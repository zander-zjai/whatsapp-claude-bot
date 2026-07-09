'use strict';

const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { log, logError } = require('./logger');
const clientManager = require('./clientManager');
const clientAuth = require('./clientAuth');
const conversationManager = require('./conversationManager');
const logsManager = require('./logsManager');
const emailLogsManager = require('./emailLogsManager');
const quoteManager = require('./quoteManager');
const quoteActions = require('./quoteActions');
const mediaManager = require('./mediaManager');
const emailNotifier = require('./emailNotifier');
const settingsManager = require('./settingsManager');
const { normalizeNumber } = require('./phone');

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

// ------------------------------------------------------------------
// Forgot / reset password (public). Same rate limit shape as login —
// reuse loginLimiter so this can't be used to brute-force or spam emails.
// ------------------------------------------------------------------
const RESET_TOKEN_VALIDITY_MS = 60 * 60 * 1000; // 1 hour

/**
 * POST /client/forgot-password — always responds with a generic success
 * message regardless of whether the email matches a client, so this can't
 * be used to enumerate which businesses have an account. If it does match,
 * emails a one-time reset link to the client's contact_email.
 */
router.post('/forgot-password', loginLimiter, async (req, res) => {
  const { email } = req.body || {};
  const genericResponse = { message: "If that email is registered, we've sent a password reset link." };

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  const client = clientManager.getClientByEmail(email);
  if (client) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_VALIDITY_MS).toISOString();
    clientManager.setResetToken(client.id, token, expiresAt);

    const resetUrl = `${settingsManager.getSettings().client_portal_url}/client/reset-password?token=${token}`;
    try {
      await emailNotifier.sendOwnerEmail(
        client,
        'Reset your ZJAI client portal password',
        `Hi ${client.contact_person || ''},\n\nWe received a request to reset your client portal password. Click the link below to set a new one — it's valid for 1 hour:\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`
      );
    } catch (err) {
      logError(`[${client.name}] Failed to send password reset email:`, err.message);
    }
  }

  res.json(genericResponse);
});

/** POST /client/reset-password — sets a new password given a valid, unexpired reset token. */
router.post('/reset-password', loginLimiter, (req, res) => {
  const { token, password } = req.body || {};

  if (!token || !password) {
    return res.status(400).json({ error: 'token and password are required' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }

  const client = clientManager.getClientByResetToken(token);
  if (!client) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  }

  clientAuth.setClientPassword(client.id, password);
  clientManager.clearResetToken(client.id);
  log(`Client portal password reset via self-service for "${client.name}"`);
  res.json({ success: true });
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
  const awaitingHumanConversations = conversations.filter((c) => c.awaiting_human && !c.handover_active);
  const activeHandovers = conversations
    .filter((c) => c.handover_active)
    .sort((a, b) => new Date(a.handover_started_at || 0) - new Date(b.handover_started_at || 0));
  const wonQuotesThisMonth = quotes.filter((q) => q.status === 'won' && isThisMonth(q.updated_at));

  let callsToday = 0;
  let recentCalls = [];
  let missedCallsCount = 0;
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
        missedCallsCount = calls.filter((c) => (c.ended_reason || '').toLowerCase().includes('customer')).length;
        recentCalls = calls
          .slice()
          .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
          .slice(0, 5)
          .map((c) => ({
            caller_name: c.caller_name,
            caller: c.caller,
            summary: c.summary,
            callback_requested: c.callback_requested,
            timestamp: c.timestamp,
          }));
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
      awaiting_human: awaitingHumanConversations.length,
      won_quotes_this_month: wonQuotesThisMonth.length,
      calls_today: callsToday,
      missed_calls_total: missedCallsCount,
      emails_today: emailLogsManager.getTodayCountForClient(client.id),
      active_handovers: activeHandovers.length,
    },
    recent_calls: recentCalls,
    active_handovers: activeHandovers.slice(0, 5).map((c) => ({
      customer_number: c.customer_number,
      customer_name: c.customer_name,
      last_message_preview: c.last_message_preview,
      handover_started_at: c.handover_started_at,
    })),
    pending_quotes: pendingQuotes.slice(0, 5).map((q) => ({
      id: q.id,
      name: q.name,
      item_description: q.item_description,
      total: q.total,
      tier: q.tier,
      channel: q.channel || 'whatsapp',
    })),
    hot_leads: hotConversations.slice(0, 5).map((c) => ({
      customer_number: c.customer_number,
      customer_name: c.customer_name,
      last_message_preview: c.last_message_preview,
      lead_reason: c.lead_reason,
    })),
    awaiting_human: awaitingHumanConversations.slice(0, 5).map((c) => ({
      customer_number: c.customer_number,
      customer_name: c.customer_name,
      last_message_preview: c.last_message_preview,
    })),
    recent_conversations: conversations
      .slice()
      .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0))
      .slice(0, 5)
      .map((c) => ({
        customer_number: c.customer_number,
        customer_name: c.customer_name,
        last_message_preview: c.last_message_preview,
        last_message_at: c.last_message_at,
      })),
    recent_emails: emailLogsManager.getLogsForClient(client.id, { limit: 5 }).map((l) => ({
      id: l.id,
      from_address: l.from_address,
      from_name: l.from_name,
      subject: l.subject,
      timestamp: l.timestamp,
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

/** GET /client/conversations/:customerNumber — conversation + full message history.
 *  If the identifier is an email address, returns the email thread instead. */
router.get('/conversations/:customerNumber', (req, res) => {
  const customerNumber = decodeURIComponent(req.params.customerNumber);

  // Email-channel: return email thread formatted as chat messages
  if (customerNumber.includes('@')) {
    const emailLogs = emailLogsManager.getLogsForAddress(req.clientId, customerNumber);
    if (!emailLogs.length) return res.status(404).json({ error: 'Conversation not found' });
    const messages = [];
    for (const log of emailLogs) {
      if (log.customer_message) {
        messages.push({ id: log.id + '-in', role: 'user', content: log.customer_message, timestamp: log.timestamp, subject: log.subject });
      }
      if (log.reply_text) {
        messages.push({ id: log.id + '-out', role: 'assistant', content: log.reply_text, timestamp: log.timestamp });
      }
    }
    return res.json({ conversation: { customer_number: customerNumber, channel: 'email' }, messages });
  }

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

/** GET /client/quotes/:id — single quote, for the quote detail view. */
router.get('/quotes/:id', (req, res) => {
  const quote = quoteManager.getQuoteById(req.params.id);
  if (!quote || quote.client_id !== req.clientId) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  res.json({ quote });
});

/**
 * GET /client/quotes/:id/attachments — design files/images this customer
 * sent around the time of this quote (window: created_at ± 48h). Media
 * isn't linked to a specific quote at capture time, so this is a heuristic
 * association by customer number + timestamp, not an exact link.
 */
const ATTACHMENT_WINDOW_HOURS = 48;

router.get('/quotes/:id/attachments', (req, res) => {
  const quote = quoteManager.getQuoteById(req.params.id);
  if (!quote || quote.client_id !== req.clientId) {
    return res.status(404).json({ error: 'Quote not found' });
  }

  const createdAt = new Date(quote.created_at).getTime();
  const sinceISO = new Date(createdAt - ATTACHMENT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const untilISO = new Date(createdAt + ATTACHMENT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const attachments = mediaManager.getAttachmentsForCustomerInWindow(
    req.clientId,
    quote.customer_number,
    sinceISO,
    untilISO
  );

  res.json({
    attachments: attachments.map((a) => ({
      id: a.id,
      mime_type: a.mime_type,
      caption: a.caption,
      created_at: a.created_at,
      url: `/client/attachments/${a.id}/file`,
    })),
  });
});

/** GET /client/attachments/:id/file — stream a stored attachment file. */
router.get('/attachments/:id/file', (req, res) => {
  const attachment = mediaManager.getAttachmentById(req.params.id);
  if (!attachment || attachment.client_id !== req.clientId) {
    return res.status(404).json({ error: 'Attachment not found' });
  }

  if (!fs.existsSync(attachment.file_path)) {
    return res.status(404).json({ error: 'File not available' });
  }

  res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
  fs.createReadStream(attachment.file_path).pipe(res);
});

/**
 * PATCH /client/quotes/:id — update a quote.
 * Actions: approve | reject | revise
 * Status overrides: pending | quoted | won | lost | accepted | declined
 */
router.patch('/quotes/:id', async (req, res) => {
  const quote = quoteManager.getQuoteById(req.params.id);
  if (!quote || quote.client_id !== req.clientId) {
    return res.status(404).json({ error: 'Quote not found' });
  }

  const { action, status, eta, payment_received: paymentReceived, line_items, notes } = req.body || {};

  if (paymentReceived !== undefined) {
    const updated = quoteManager.setPaymentReceived(quote.id, paymentReceived);
    return res.json({ quote: updated });
  }

  if (action) {
    if (!['approve', 'reject', 'revise'].includes(action)) {
      return res.status(400).json({ error: 'action must be "approve", "reject", or "revise"' });
    }

    if (action === 'approve') {
      const approvableStatuses = ['pending', 'revised', 'needs_pricing'];
      if (quote.tier !== 2 || !approvableStatuses.includes(quote.status)) {
        return res.status(400).json({ error: 'Only pending or revised Tier 2 quotes can be approved' });
      }
      const result = await quoteActions.approveQuote(req.client, quote, eta);
      if (!result.ok) {
        const message =
          result.reason === 'pdf_missing'
            ? 'The PDF for this quote could not be found.'
            : 'Failed to send the quote to the customer. Please try again.';
        return res.status(502).json({ error: message, quote: quoteManager.getQuoteById(quote.id) });
      }
      log(`Client portal: ${req.client.name} approved quote for ${quote.name}`);

    } else if (action === 'reject') {
      quoteActions.rejectQuote(quote);
      log(`Client portal: ${req.client.name} rejected quote for ${quote.name}`);

    } else if (action === 'revise') {
      if (quote.tier !== 2) {
        return res.status(400).json({ error: 'Only Tier 2 quotes can be revised' });
      }
      // Allow revising quotes in any status — the revision will re-send the PDF
      if (!Array.isArray(line_items) || line_items.length === 0) {
        return res.status(400).json({ error: 'line_items are required for a revision' });
      }
      // Apply the customer's stored discount to the entered unit prices, same as the auto-PDF path.
      const marginMultiplier = 1 + (Number(quote.margin_percent) || 0) / 100;
      const discountedLineItems = line_items.map((li) => ({
        ...li,
        unit_price: Math.round((Number(li.unit_price) || 0) * marginMultiplier * 100) / 100,
      }));
      const { items, total } = quoteManager.recalculateRevisedItems(discountedLineItems);
      const result = await quoteActions.reviseAndSendQuote(req.client, quote, { lineItems: items, total, notes, eta });
      if (!result.ok) {
        const message = result.reason === 'pdf_generation_failed'
          ? 'Failed to regenerate the PDF. Please try again.'
          : 'Failed to send the revised quote. Please try again.';
        return res.status(502).json({ error: message, quote: quoteManager.getQuoteById(quote.id) });
      }
      log(`Client portal: ${req.client.name} revised and sent quote for ${quote.name}`);
    }

    return res.json({ quote: quoteManager.getQuoteById(quote.id) });
  }

  if (status) {
    const ALLOWED_STATUSES = ['pending', 'quoted', 'won', 'lost', 'accepted', 'declined'];
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
// Quote analytics + customer quote history
// ------------------------------------------------------------------

/** GET /client/quotes/analytics — monthly summary stats for this client's quotes. */
router.get('/quotes/analytics', (req, res) => {
  res.json({ analytics: quoteManager.getQuoteAnalytics(req.clientId) });
});

/**
/**
 * GET /client/customers — all unique customers for this client, aggregated from
 * quote history, with their current margin and summary stats.
 */
router.get('/customers', (req, res) => {
  const quotes = quoteManager.getQuotesForClient(req.clientId, { limit: 10000 });
  const margins = req.client.customer_margins || [];
  const defaultMargin = Number(req.client.default_margin) || 0;

  const byNumber = {};
  for (const q of quotes) {
    const num = q.customer_number || q.contact_number;
    if (!num) continue;
    if (!byNumber[num]) {
      byNumber[num] = {
        customer_number: num,
        name: q.name || num,
        quote_count: 0,
        total_value: 0,
        last_quote_at: q.created_at,
        statuses: {},
      };
    }
    const c = byNumber[num];
    c.quote_count += 1;
    c.total_value += Number(q.total) || 0;
    if (!c.last_quote_at || q.created_at > c.last_quote_at) {
      c.last_quote_at = q.created_at;
      if (q.name) c.name = q.name;
    }
    c.statuses[q.status] = (c.statuses[q.status] || 0) + 1;
  }

  const customers = Object.values(byNumber).map((c) => {
    const num = c.customer_number;
    const isEmail = num.includes('@');
    const marginEntry = isEmail
      ? margins.find((m) => m.email && String(m.email).toLowerCase() === num.toLowerCase())
      : margins.find((m) => m.phone_number && normalizeNumber(String(m.phone_number)) === normalizeNumber(num));
    return {
      ...c,
      margin_percent: marginEntry ? Number(marginEntry.margin_percent) : defaultMargin,
      margin_id: marginEntry ? marginEntry.id : null,
      margin_is_custom: !!marginEntry,
      linked_email: marginEntry ? (marginEntry.email || '') : '',
      linked_phone: marginEntry ? (marginEntry.phone_number || '') : '',
    };
  });

  customers.sort((a, b) => (b.last_quote_at || '').localeCompare(a.last_quote_at || ''));
  res.json({ customers, default_margin: defaultMargin });
});

/**
 * GET /client/customers/:identifier/quotes — all quotes ever for a specific
 * customer (identified by their phone number or email address).
 */
router.get('/customers/:identifier/quotes', (req, res) => {
  const identifier = decodeURIComponent(req.params.identifier);
  const quotes = quoteManager.getQuotesForCustomer(req.clientId, identifier);
  const totalValue = quotes.reduce((s, q) => s + (Number(q.total) || 0), 0);
  // Use the most recent name associated with this customer from their quotes
  const customerName = quotes.length > 0 ? (quotes[quotes.length - 1].name || identifier) : identifier;
  res.json({ quotes, total_value: totalValue, customer: identifier, customer_name: customerName });
});

// ------------------------------------------------------------------
// Customer margins
// ------------------------------------------------------------------

/** GET /client/margins — list all customer-specific margins for this client. */
router.get('/margins', (req, res) => {
  res.json({
    margins: req.client.customer_margins || [],
    default_margin: req.client.default_margin || 0,
  });
});

/** POST /client/margins — add or update a customer margin. */
router.post('/margins', (req, res) => {
  const { label, phone_number, email, margin_percent } = req.body || {};
  if (!phone_number && !email) {
    return res.status(400).json({ error: 'phone_number or email is required' });
  }
  if (margin_percent === undefined || margin_percent === null) {
    return res.status(400).json({ error: 'margin_percent is required' });
  }
  const margins = clientManager.addCustomerMargin(req.clientId, { label, phone_number, email, margin_percent });
  res.json({ margins });
});

/** PATCH /client/margins/:id — update label, phone_number, email, or margin_percent on a record. */
router.patch('/margins/:id', (req, res) => {
  const { label, phone_number, email, margin_percent } = req.body || {};
  const margins = clientManager.updateCustomerMargin(req.clientId, req.params.id, { label, phone_number, email, margin_percent });
  if (!margins) return res.status(404).json({ error: 'Margin not found' });
  res.json({ margins });
});

/** DELETE /client/margins/:id — remove a customer margin by id. */
router.delete('/margins/:id', (req, res) => {
  const margins = clientManager.removeCustomerMargin(req.clientId, req.params.id);
  if (!margins) return res.status(404).json({ error: 'Margin not found' });
  res.json({ margins });
});

/** PATCH /client/margins/default — update the default margin percentage. */
router.patch('/margins/default', (req, res) => {
  const { margin_percent } = req.body || {};
  if (margin_percent === undefined || margin_percent === null) {
    return res.status(400).json({ error: 'margin_percent is required' });
  }
  const updated = clientManager.updateClient(req.clientId, { default_margin: Number(margin_percent) || 0 });
  res.json({ default_margin: updated ? updated.default_margin : 0 });
});

// ------------------------------------------------------------------
// Email Receptionist thread
// ------------------------------------------------------------------

/** GET /client/emails — recent email exchanges for this client. */
router.get('/emails', (req, res) => {
  res.json({ emails: emailLogsManager.getLogsForClient(req.clientId, { limit: 100 }) });
});

// ------------------------------------------------------------------
// Call logs (proxied from JARVIS — AI Receptionist clients)
// ------------------------------------------------------------------

/** GET /client/calls — returns call log entries for this client from JARVIS, merged with local callback-done state. */
router.get('/calls', async (req, res) => {
  const callbackDoneStore = require('./callbackDoneStore');
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
    const calls = (data.calls || []).map((c) => ({
      ...c,
      callback_done: callbackDoneStore.isDone(`${req.clientId}:${c.id}`),
    }));
    res.json({ calls });
  } catch (err) {
    console.error('[calls-proxy] Failed to fetch from JARVIS:', err.message);
    res.json({ calls: [] });
  }
});

/** PATCH /client/calls/:id/callback-done — mark a callback as handled. */
router.patch('/calls/:id/callback-done', (req, res) => {
  const callbackDoneStore = require('./callbackDoneStore');
  callbackDoneStore.markDone(`${req.clientId}:${req.params.id}`);
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// Price list (Tier 2 only)
// ------------------------------------------------------------------

/** GET /client/pricelist — current price list (empty for Tier 1 clients). */
router.get('/pricelist', (req, res) => {
  res.json({ price_list: req.client.price_list || [] });
});

/** PUT /client/pricelist — replace the price list. */
router.put('/pricelist', (req, res) => {
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
