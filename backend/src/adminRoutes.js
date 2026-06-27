'use strict';

const fs = require('fs');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { log, logError } = require('./logger');
const clientManager = require('./clientManager');
const memory = require('./memory');
const logsManager = require('./logsManager');
const settingsManager = require('./settingsManager');
const errorLogger = require('./errorLogger');
const auth = require('./auth');
const clientAuth = require('./clientAuth');
const conversationManager = require('./conversationManager');
const quoteManager = require('./quoteManager');
const usageManager = require('./usageManager');
const gmailClient = require('./gmailClient');
const emailPoller = require('./emailPoller');

const router = express.Router();

// ------------------------------------------------------------------
// POST /admin/login (public — everything else below requires a JWT)
// 5 attempts per 15 minutes per IP, then locked out. Successful logins
// don't count against the limit.
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
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  if (!auth.verifyCredentials(username, password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = auth.issueToken(username);
  log(`Admin login: ${username}`);
  return res.json({ token });
});

// ------------------------------------------------------------------
// GET /admin/oauth/gmail/callback (public — hit directly by Google's
// redirect, which carries no Authorization header. The `state` param
// (set when the auth URL was generated) carries which client this
// grant belongs to.)
// ------------------------------------------------------------------
router.get('/oauth/gmail/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const portalUrl = settingsManager.getSettings().client_portal_url;

  if (error) {
    return res.redirect(`${portalUrl}/clients/edit/${state}?gmail=error`);
  }

  const client = clientManager.getClientById(state);
  if (!client) {
    return res.status(404).send('Unknown client for this OAuth state.');
  }

  try {
    const { refreshToken, emailAddress } = await gmailClient.exchangeCodeForTokens(code);
    clientManager.updateClient(client.id, {
      gmail_refresh_token: refreshToken,
      email_address: client.email_address || emailAddress,
    });
    return res.redirect(`${portalUrl}/clients/edit/${client.id}?gmail=connected`);
  } catch (err) {
    logError(`Gmail OAuth callback failed for ${client.name}:`, err.message);
    return res.redirect(`${portalUrl}/clients/edit/${client.id}?gmail=error`);
  }
});

// Everything below this line requires a valid JWT.
router.use(auth.requireAuth);

// ------------------------------------------------------------------
// Clients CRUD
// ------------------------------------------------------------------

const USAGE_WARNING_THRESHOLD = 0.8;

/** GET /admin/clients — list all clients with today's message count + usage-cap warning flag. */
router.get('/clients', (req, res) => {
  const { messages_today_by_client: byClient } = logsManager.getStats();

  const clients = clientManager.getAllClients().map((c) => {
    const usage = usageManager.getMonthlyUsageForClient(c.id);
    const cap = Number(c.monthly_interaction_cap) || 0;
    const usage_percentage = cap > 0 ? (usage.message_count / cap) * 100 : 0;

    return {
      ...c,
      messages_today: byClient[c.id] || 0,
      usage_percentage,
      usage_warning: usage_percentage >= USAGE_WARNING_THRESHOLD * 100,
    };
  });

  res.json({ clients });
});

/** GET /admin/clients/:id — single client (for the Edit form). */
router.get('/clients/:id', (req, res) => {
  const client = clientManager.getClientById(req.params.id);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }
  res.json({ client });
});

/** POST /admin/clients — create a new client. */
router.post('/clients', (req, res) => {
  try {
    const newClient = clientManager.addClient(req.body || {});
    log(`Admin added new client "${newClient.name}" (id=${newClient.id})`);

    const webhookBaseUrl = settingsManager.getSettings().webhook_base_url;
    res.status(201).json({
      client: newClient,
      webhook_url: `${webhookBaseUrl.replace(/\/+$/, '')}/webhook`,
    });
  } catch (err) {
    logError('Admin: failed to add client:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/** PUT /admin/clients/:id — update an existing client. */
router.put('/clients/:id', (req, res) => {
  try {
    const updated = clientManager.updateClient(req.params.id, req.body || {});
    if (!updated) {
      return res.status(404).json({ error: 'Client not found' });
    }
    log(`Admin updated client "${updated.name}" (id=${updated.id})`);
    res.json({ client: updated });
  } catch (err) {
    logError('Admin: failed to update client:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * PUT /admin/clients/:id/portal-password — set or reset a client's Client
 * Portal login password (their portal account uses contact_email + this
 * password, separate from the admin login).
 */
router.put('/clients/:id/portal-password', (req, res) => {
  const client = clientManager.getClientById(req.params.id);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const { password } = req.body || {};
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }

  clientAuth.setClientPassword(client.id, password);
  log(`Admin set portal password for client "${client.name}" (id=${client.id})`);
  res.json({ success: true });
});

/** DELETE /admin/clients/:id — remove a client and its conversation memory. */
router.delete('/clients/:id', (req, res) => {
  const client = clientManager.getClientById(req.params.id);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  clientManager.deleteClient(req.params.id);
  memory.clearForClient(req.params.id);
  conversationManager.clearForClient(req.params.id);
  quoteManager.clearForClient(req.params.id);
  log(`Admin deleted client "${client.name}" (id=${client.id})`);
  res.json({ success: true });
});

// ------------------------------------------------------------------
// Logs
// ------------------------------------------------------------------

/** GET /admin/clients/:id/logs — last N messages for a client. */
router.get('/clients/:id/logs', (req, res) => {
  const client = clientManager.getClientById(req.params.id);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const { search, date_from: dateFrom, date_to: dateTo, limit } = req.query;

  const logs = logsManager.getLogsForClient(req.params.id, {
    search,
    dateFrom,
    dateTo,
    limit: limit ? Number(limit) : 100,
  });

  res.json({ logs });
});

// ------------------------------------------------------------------
// Usage & cost tracking (Claude API spend, not billing)
// ------------------------------------------------------------------

/** GET /admin/clients/:id/usage — this client's current-month usage + cap. */
router.get('/clients/:id/usage', (req, res) => {
  const client = clientManager.getClientById(req.params.id);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const usage = usageManager.getMonthlyUsageForClient(client.id);
  const cap = Number(client.monthly_interaction_cap) || 0;
  const usage_percentage = cap > 0 ? (usage.message_count / cap) * 100 : 0;

  res.json({
    usage,
    monthly_interaction_cap: cap,
    usage_percentage,
    usage_warning: usage_percentage >= USAGE_WARNING_THRESHOLD * 100,
  });
});

/** GET /admin/usage/summary — total estimated Anthropic spend this month across every client. */
router.get('/usage/summary', (req, res) => {
  res.json({ summary: usageManager.getMonthlySummary() });
});

// ------------------------------------------------------------------
// Email Receptionist (Gmail OAuth + manual poll trigger)
// ------------------------------------------------------------------

/** POST /admin/clients/:id/gmail-auth-url — returns the Google consent URL to open for this client. */
router.post('/clients/:id/gmail-auth-url', (req, res) => {
  const client = clientManager.getClientById(req.params.id);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }
  try {
    const url = gmailClient.buildAuthUrl(client.id);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /admin/email/poll-now — manually trigger one poll cycle across every email-enabled client (also used by /handle-email below). */
router.post('/email/poll-now', async (req, res) => {
  try {
    const results = await emailPoller.pollAllClients();
    res.json({ results });
  } catch (err) {
    logError('Manual email poll failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------------
// Stats (dashboard)
// ------------------------------------------------------------------

/** GET /admin/stats — overview cards + 7-day per-client message chart. */
router.get('/stats', (req, res) => {
  const stats = logsManager.getStats();
  const allClients = clientManager.getAllClients();

  res.json({
    server_status: 'online',
    active_clients: clientManager.getActiveClients().length,
    total_clients: allClients.length,
    messages_today: stats.messages_today,
    messages_this_month: stats.messages_this_month,
    chart_data: stats.chart_data,
    clients: allClients.map((c) => ({ id: c.id, name: c.name })),
  });
});

// ------------------------------------------------------------------
// Settings
// ------------------------------------------------------------------

/** GET /admin/settings — platform config (never exposes the password hash). */
router.get('/settings', (req, res) => {
  const { admin_pass_hash, ...settings } = settingsManager.getSettings();
  res.json({ settings });
});

/**
 * PUT /admin/settings — update platform config and/or change the admin
 * password. To change the password, include `current_password` and
 * `new_password` in the body.
 */
router.put('/settings', (req, res) => {
  const {
    platform_claude_api_key,
    webhook_base_url,
    client_portal_url,
    fallback_message,
    max_conversation_memory,
    current_password,
    new_password,
  } = req.body || {};

  const updates = {};
  if (platform_claude_api_key !== undefined) updates.platform_claude_api_key = platform_claude_api_key;
  if (webhook_base_url !== undefined) updates.webhook_base_url = webhook_base_url;
  if (client_portal_url !== undefined) updates.client_portal_url = client_portal_url;
  if (fallback_message !== undefined) updates.fallback_message = fallback_message;
  if (max_conversation_memory !== undefined) {
    const n = Number(max_conversation_memory);
    if (!Number.isFinite(n) || n <= 0) {
      return res.status(400).json({ error: 'max_conversation_memory must be a positive number' });
    }
    updates.max_conversation_memory = n;
  }

  if (new_password) {
    if (!current_password || !auth.verifyCredentials(req.admin.username, current_password)) {
      return res.status(401).json({ error: 'current_password is incorrect' });
    }
    auth.setCredentials(req.admin.username, new_password);
    log(`Admin password changed for user "${req.admin.username}"`);
  }

  settingsManager.updateSettings(updates);
  log('Admin updated settings');

  const { admin_pass_hash, ...settings } = settingsManager.getSettings();
  res.json({ settings });
});

// ------------------------------------------------------------------
// Error log viewer
// ------------------------------------------------------------------

/** GET /admin/errors — recent server errors (last 7 days, newest first). */
router.get('/errors', (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  res.json({ errors: errorLogger.getRecentErrors(Number.isFinite(limit) ? limit : 100) });
});

// ------------------------------------------------------------------
// Conversations (active conversations + handover status)
// ------------------------------------------------------------------

/** GET /admin/conversations — all conversations, optionally filtered by client. */
router.get('/conversations', (req, res) => {
  const { client_id: clientId } = req.query;

  const conversations = clientId
    ? conversationManager.getConversationsForClient(clientId)
    : conversationManager.getAllConversations();

  res.json({ conversations });
});

/**
 * POST /admin/conversations/handover — manually set the handover state of a
 * conversation (the same toggle the owner controls via #takeover/#release).
 * Body: { client_id, customer_number, active }
 */
router.post('/conversations/handover', (req, res) => {
  const { client_id: clientId, customer_number: customerNumber, active } = req.body || {};

  if (!clientId || !customerNumber) {
    return res.status(400).json({ error: 'client_id and customer_number are required' });
  }

  const client = clientManager.getClientById(clientId);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const conversation = conversationManager.setHandover(clientId, customerNumber, Boolean(active));
  log(
    `Admin ${active ? 'started' : 'ended'} handover for ${client.name} <-> ${customerNumber}`
  );
  res.json({ conversation });
});

// ------------------------------------------------------------------
// Quote requests
// ------------------------------------------------------------------

/** GET /admin/quotes — quote requests, optionally filtered by client. */
router.get('/quotes', (req, res) => {
  const { client_id: clientId, limit } = req.query;
  const opts = { limit: limit ? Number(limit) : 100 };

  const quotes = clientId
    ? quoteManager.getQuotesForClient(clientId, opts)
    : quoteManager.getAllQuotes(opts);

  res.json({ quotes });
});

/** GET /admin/quotes/:id/pdf — stream the generated PDF for a Tier 2 quote. */
router.get('/quotes/:id/pdf', (req, res) => {
  const quote = quoteManager.getQuoteById(req.params.id);
  if (!quote || quote.tier !== 2) {
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

module.exports = router;
