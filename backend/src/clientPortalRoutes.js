'use strict';

const fs = require('fs');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { log } = require('./logger');
const clientManager = require('./clientManager');
const clientAuth = require('./clientAuth');
const conversationManager = require('./conversationManager');
const logsManager = require('./logsManager');
const quoteManager = require('./quoteManager');
const quoteActions = require('./quoteActions');

const router = express.Router();

// ------------------------------------------------------------------
// POST /client/login (public — everything else below requires a client JWT)
// Same 5-attempts/15min shape as the admin login limiter.
// ------------------------------------------------------------------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

router.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const client = clientAuth.verifyClientCredentials(email, password);
  if (!client) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = clientAuth.issueClientToken(client.id);
  log(`Client portal login: ${client.name}`);
  res.json({ token, client: clientManager.sanitizeClientForPortal(client) });
});

// Everything below this line requires a valid client JWT, and req.clientId /
// req.client are scoped to the logged-in client only.
router.use(clientAuth.requireClientAuth);

// ------------------------------------------------------------------
// Dashboard
// ------------------------------------------------------------------

/** GET /client/me — own client info + summary stats for the dashboard. */
router.get('/me', async (req, res) => {
  const client = req.client;
  const conversations = conversationManager.getConversationsForClient(client.id);
  const quotes = quoteManager.getQuotesForClient(client.id, { limit: 1000 });

  const now = new Date();
  const isThisMonth = (iso) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
  };

  const pendingQuotes = quotes.filter((q) => q.status === 'pending');
  const hotConversations = conversations.filter((c) => c.lead_temperature === 'hot');
  const wonQuotesThisMonth = quotes.filter((q) => q.status === 'won' && isThisMonth(q.updated_at));

  let callsToday = 0;
  const jarvisUrl = process.env.JARVIS_URL;
  const callsApiKey = process.env.CALLS_API_KEY;
  if (jarvisUrl && callsApiKey) {
    try {
      const upstream = await fetch(`${jarvisUrl}/calls?client_id=${encodeURIComponent(client.id)}`, {
        headers: { Authorization: `Bearer ${callsApiKey}` },
      });
      if (upstream.ok) {
        const data = await upstream.json();
        const calls = data.calls || [];
        const todayStr = now.toISOString().slice(0, 10);
        callsToday = calls.filter((c) => (c.timestamp || '').slice(0, 10) === todayStr).length;
      }
    } catch (err) {
      // Calls dashboard stat is best-effort -- JARVIS being unreachable
      // shouldn't break the rest of the dashboard.
    }
  }

  res.json({
    client: clientManager.sanitizeClientForPortal(client),
    summary: {
      messages_today: logsManager.getTodayMessageCountForClient(client.id),
      messages_this_month: logsManager.getMonthlyMessageCountForClient(client.id),
      monthly_message_limit: client.monthly_message_limit,
      active_conversations: conversations.length,
      pending_quotes: pendingQuotes.length,
      hot_leads: hotConversations.length,
      won_quotes_this_month: wonQuotesThisMonth.length,
      calls_today: callsToday,
    },
    pending_quotes: pendingQuotes.slice(0, 5).map((q) => ({
      id: q.id,
      name: q.name,
      item_description: q.item_description,
      total: q.total,
      tier: q.tier,
    })),
    hot_leads: hotConversations.slice(0, 5).map((c) => ({
      customer_number: c.customer_number,
      customer_name: c.customer_name,
      last_message_preview: c.last_message_preview,
      lead_reason: c.lead_reason,
    })),
  });
});

// ------------------------------------------------------------------
// Conversations
// ------------------------------------------------------------------

/** GET /client/conversations — all of this client's conversations. */
router.get('/conversations', (req, res) => {
  const conversations = conversationManager.getConversationsForClient(req.clientId);
  res.json({ conversations });
});

/** GET /client/conversations/:customerNumber — conversation + full message history. */
router.get('/conversations/:customerNumber', (req, res) => {
  const customerNumber = decodeURIComponent(req.params.customerNumber);
  const conversation = conversationManager.findConversationByNumber(req.clientId, customerNumber);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const messages = logsManager.getLogsForConversation(req.clientId, conversation.customer_number);
  res.json({ conversation, messages });
});

/**
 * POST /client/conversations/handover — toggle handover for one of this
 * client's conversations (the portal equivalent of #takeover/#release).
 * Body: { customer_number, active }
 */
router.post('/conversations/handover', (req, res) => {
  const { customer_number: customerNumber, active } = req.body || {};

  if (!customerNumber) {
    return res.status(400).json({ error: 'customer_number is required' });
  }

  const conversation = conversationManager.setHandover(req.clientId, customerNumber, Boolean(active));
  log(`Client portal: ${req.client.name} ${active ? 'started' : 'ended'} handover for ${customerNumber}`);
  res.json({ conversation });
});

/**
 * POST /client/conversations/priority — set or clear the owner's manual
 * priority tier for a customer (high/medium/low/none), independent of the
 * auto-inferred lead_temperature. Body: { customer_number, priority }.
 */
router.post('/conversations/priority', (req, res) => {
  const { customer_number: customerNumber, priority } = req.body || {};

  if (!customerNumber) {
    return res.status(400).json({ error: 'customer_number is required' });
  }

  const ALLOWED = ['high', 'medium', 'low', null, 'none'];
  if (!ALLOWED.includes(priority)) {
    return res.status(400).json({ error: 'priority must be one of: high, medium, low, none' });
  }

  const conversation = conversationManager.setPriority(
    req.clientId,
    customerNumber,
    priority === 'none' ? null : priority
  );
  log(`Client portal: ${req.client.name} set priority "${priority}" for ${customerNumber}`);
  res.json({ conversation });
});

// ------------------------------------------------------------------
// Quote requests
// ------------------------------------------------------------------

/** GET /client/quotes — this client's quote requests, most recent first. */
router.get('/quotes', (req, res) => {
  const { limit } = req.query;
  const quotes = quoteManager.getQuotesForClient(req.clientId, { limit: limit ? Number(limit) : 100 });
  res.json({ quotes });
});

/**
 * PATCH /client/quotes/:id — update a quote.
 * - { action: 'approve' | 'reject' } — Tier 2 only, while status is 'pending'.
 *   Mirrors the #approve/#reject WhatsApp commands.
 * - { status: 'pending' | 'quoted' | 'won' | 'lost' } — mark the outcome of
 *   any quote once the job has been discussed/completed.
 */
router.patch('/quotes/:id', async (req, res) => {
  const quote = quoteManager.getQuoteById(req.params.id);
  if (!quote || quote.client_id !== req.clientId) {
    return res.status(404).json({ error: 'Quote not found' });
  }

  const { action, status, eta } = req.body || {};

  if (action) {
    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ error: 'action must be "approve" or "reject"' });
    }
    if (quote.tier !== 2 || quote.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending Tier 2 quotes can be approved or rejected' });
    }

    if (action === 'approve') {
      const result = await quoteActions.approveQuote(req.client, quote, eta);
      if (!result.ok) {
        const message =
          result.reason === 'pdf_missing'
            ? 'The PDF for this quote could not be found.'
            : 'Failed to send the quote to the customer. Please try again.';
        return res.status(502).json({ error: message, quote: quoteManager.getQuoteById(quote.id) });
      }
      log(`Client portal: ${req.client.name} approved quote for ${quote.name}`);
    } else {
      quoteActions.rejectQuote(quote);
      log(`Client portal: ${req.client.name} rejected quote for ${quote.name}`);
    }

    return res.json({ quote: quoteManager.getQuoteById(quote.id) });
  }

  if (status) {
    const ALLOWED_STATUSES = ['pending', 'quoted', 'won', 'lost'];
    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` });
    }
    const updated = quoteManager.setQuoteStatus(quote.id, status);
    return res.json({ quote: updated });
  }

  return res.status(400).json({ error: 'action or status is required' });
});

/** GET /client/quotes/:id/pdf — stream the generated PDF for one of this client's Tier 2 quotes. */
router.get('/quotes/:id/pdf', (req, res) => {
  const quote = quoteManager.getQuoteById(req.params.id);
  if (!quote || quote.client_id !== req.clientId || quote.tier !== 2) {
    return res.status(404).json({ error: 'Quote not found' });
  }

  const pdfPath = quoteManager.getPdfFilePath(quote.id);
  if (!fs.existsSync(pdfPath)) {
    return res.status(404).json({ error: 'PDF not available' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="quote-${quote.id.slice(0, 8)}.pdf"`);
  fs.createReadStream(pdfPath).pipe(res);
});

// ------------------------------------------------------------------
// Call logs (proxied from JARVIS — AI Receptionist clients)
// ------------------------------------------------------------------

/** GET /client/calls — returns call log entries for this client from JARVIS. */
router.get('/calls', async (req, res) => {
  const jarvisUrl = process.env.JARVIS_URL;
  const apiKey = process.env.CALLS_API_KEY;

  if (!jarvisUrl || !apiKey) {
    return res.json({ calls: [] });
  }

  try {
    const upstream = await fetch(
      `${jarvisUrl}/calls?client_id=${encodeURIComponent(req.clientId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!upstream.ok) return res.json({ calls: [] });
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    console.error('[calls-proxy] Failed to fetch from JARVIS:', err.message);
    res.json({ calls: [] });
  }
});

// ------------------------------------------------------------------
// Price list (Tier 2 only)
// ------------------------------------------------------------------

/** GET /client/pricelist — current price list (empty for Tier 1 clients). */
router.get('/pricelist', (req, res) => {
  res.json({ price_list: req.client.price_list || [], quote_tier: req.client.quote_tier });
});

/** PUT /client/pricelist — replace the price list. Tier 2 only. */
router.put('/pricelist', (req, res) => {
  if (Number(req.client.quote_tier) !== 2) {
    return res.status(403).json({ error: 'Price list is only available for Tier 2 clients' });
  }

  const { price_list: priceList } = req.body || {};
  const updated = clientManager.updatePriceList(req.clientId, priceList);
  log(`Client portal: ${req.client.name} updated their price list`);
  res.json({ price_list: updated.price_list });
});

// ------------------------------------------------------------------
// Settings
// ------------------------------------------------------------------

function settingsView(client) {
  return {
    business_hours: client.business_hours,
    system_prompt: client.system_prompt,
    bot_personality: client.bot_personality,
    bot_name: client.bot_name,
    contact_person: client.contact_person,
    contact_email: client.contact_email,
    contact_phone: client.contact_phone,
  };
}

/** GET /client/settings — editable business settings (never exposes credentials). */
router.get('/settings', (req, res) => {
  res.json({ settings: settingsView(req.client) });
});

/**
 * PUT /client/settings — update business hours, system prompt, personality,
 * bot name and contact details. To change the portal password, include
 * `current_password` and `new_password` in the body.
 */
router.put('/settings', (req, res) => {
  const { current_password, new_password, ...rest } = req.body || {};

  if (new_password) {
    if (typeof new_password !== 'string' || new_password.length < 8) {
      return res.status(400).json({ error: 'new_password must be at least 8 characters' });
    }
    if (!current_password || !clientAuth.verifyPortalPassword(req.client, current_password)) {
      return res.status(401).json({ error: 'current_password is incorrect' });
    }
    clientAuth.setClientPassword(req.clientId, new_password);
    log(`Client portal: ${req.client.name} changed their portal password`);
  }

  try {
    const updated = clientManager.updatePortalSettings(req.clientId, rest);
    log(`Client portal: ${req.client.name} updated settings`);
    res.json({ settings: settingsView(updated) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
