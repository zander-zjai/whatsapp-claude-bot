'use strict';

const crypto = require('crypto');
const { log, logError } = require('./logger');
const errorLogger = require('./errorLogger');
const clientManager = require('./clientManager');
const memory = require('./memory');
const { getClaudeReply } = require('./claude');
const { sendWhatsAppMessage } = require('./whatsapp');
const settingsManager = require('./settingsManager');
const logsManager = require('./logsManager');
const { maskPhone } = require('./phone');

/**
 * GET /webhook
 * Meta's verification handshake. Meta sends hub.mode, hub.verify_token and
 * hub.challenge. If the token matches our VERIFY_TOKEN, echo the challenge.
 */
function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    log('Webhook verified successfully by Meta');
    return res.status(200).send(challenge);
  }

  logError('Webhook verification failed (bad mode or verify token)');
  return res.sendStatus(403);
}

/**
 * Express middleware: verifies the `X-Hub-Signature-256` header Meta sends
 * on every webhook POST, proving the request actually came from Meta and
 * wasn't tampered with in transit.
 *
 * Requires `req.rawBody` (the raw request body Buffer) to be populated by
 * the express.json() `verify` option in server.js.
 *
 * If APP_SECRET is not configured, verification is skipped (useful for
 * local development) and a warning is logged once at startup instead.
 */
function verifyMetaSignature(req, res, next) {
  const appSecret = process.env.APP_SECRET;
  if (!appSecret) {
    return next();
  }

  const signatureHeader = req.get('x-hub-signature-256') || '';
  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', appSecret)
    .update(req.rawBody || Buffer.alloc(0))
    .digest('hex')}`;

  const provided = Buffer.from(signatureHeader);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    logError('Webhook signature verification failed (invalid X-Hub-Signature-256)');
    return res.sendStatus(401);
  }

  return next();
}

/**
 * Pull the relevant fields out of a WhatsApp webhook payload.
 * Returns null when the payload is not an inbound text message we handle
 * (e.g. delivery/read status updates, or non-text message types).
 */
function parseIncomingMessage(body) {
  try {
    const entry = body.entry && body.entry[0];
    const change = entry && entry.changes && entry.changes[0];
    const value = change && change.value;

    if (!value) return null;

    // Status callbacks (sent/delivered/read) have `statuses`, not `messages`.
    const message = value.messages && value.messages[0];
    if (!message) return null;

    const phoneNumberId = value.metadata && value.metadata.phone_number_id;
    const from = message.from; // customer's WhatsApp number

    // Only handle text messages. Ignore everything else silently.
    if (message.type !== 'text') {
      return { ignored: true, type: message.type, from, phoneNumberId };
    }

    return {
      ignored: false,
      from,
      phoneNumberId,
      text: message.text && message.text.body,
      messageId: message.id,
    };
  } catch (err) {
    logError('Failed to parse incoming webhook payload:', err.message);
    return null;
  }
}

/**
 * POST /webhook
 * Main message handler. Responds 200 to Meta immediately, then processes
 * the message asynchronously (Meta retries if we are slow or error out).
 */
function handleWebhook(req, res) {
  // Always acknowledge fast so Meta doesn't retry the delivery.
  res.sendStatus(200);

  const parsed = parseIncomingMessage(req.body);

  if (!parsed) {
    // Not a message we care about (status update / unparseable). Ignore.
    return;
  }

  if (parsed.ignored) {
    log(
      `Ignored non-text message (type="${parsed.type}") from ${parsed.from}`
    );
    return;
  }

  // Process in the background; never block the HTTP response on Claude.
  processMessage(parsed).catch((err) => {
    logError('Unhandled error while processing message:', err);
  });
}

/**
 * Core pipeline: match client -> append to memory -> call Claude -> reply.
 * On Claude/parse failure, sends the fallback message to the customer.
 * Every processed message is recorded to logs.json for the admin panel.
 */
async function processMessage({ from, phoneNumberId, text }) {
  const client = clientManager.getClientByPhoneNumberId(phoneNumberId);

  if (!client) {
    logError(
      `No active client matched phone_number_id="${phoneNumberId}". Message from ${maskPhone(from)} dropped.`
    );
    return;
  }

  log(`[${client.name}] Incoming message <- ${maskPhone(from)}: "${text}"`);

  const startedAt = Date.now();

  // Record the user's message in conversation memory.
  memory.addMessage(client.id, from, 'user', text);
  const history = memory.getHistory(client.id, from);

  let reply;
  let status = 'success';

  try {
    reply = await getClaudeReply(client, history);
    // Persist the assistant reply so it's part of the next turn's context.
    memory.addMessage(client.id, from, 'assistant', reply);
  } catch (err) {
    logError(`[${client.name}] Claude API error:`, err.message);
    errorLogger.logErrorToFile(`[${client.name}] Claude API error`, err);
    reply = settingsManager.getSettings().fallback_message;
    status = 'failed';
  }

  try {
    await sendWhatsAppMessage(client, from, reply);
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    logError(`[${client.name}] Failed to send WhatsApp reply:`, detail);
    errorLogger.logErrorToFile(`[${client.name}] Failed to send WhatsApp reply: ${detail}`, err);
    status = 'failed';
  }

  logsManager.addLog({
    client_id: client.id,
    client_name: client.name,
    customer_number: from,
    customer_message: text,
    bot_reply: reply,
    response_time_ms: Date.now() - startedAt,
    status,
  });
}

module.exports = {
  verifyWebhook,
  verifyMetaSignature,
  handleWebhook,
  parseIncomingMessage,
};
