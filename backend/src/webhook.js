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
const { maskPhone, normalizeNumber } = require('./phone');
const conversationManager = require('./conversationManager');
const quoteManager = require('./quoteManager');
const quoteActions = require('./quoteActions');
const leadTagger = require('./leadTagger');
const pdfGenerator = require('./pdfGenerator');
const businessHours = require('./businessHours');
const handover = require('./handover');

const URGENT_REPLY = 'Let me connect you with someone.';

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
 * Send a WhatsApp message to the client's configured owner, if any.
 * Best-effort: failures are logged but never thrown, so an owner
 * notification can never break the customer-facing reply.
 */
async function notifyOwner(client, text) {
  if (!client.owner_phone) return;

  try {
    await sendWhatsAppMessage(client, normalizeNumber(client.owner_phone), text);
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    logError(`[${client.name}] Failed to notify owner:`, detail);
    errorLogger.logErrorToFile(`[${client.name}] Failed to notify owner: ${detail}`, err);
  }
}

/**
 * Send a reply to the customer, logging (but not throwing on) failures.
 * Returns true on success, false on failure.
 */
async function sendReply(client, to, text) {
  try {
    await sendWhatsAppMessage(client, to, text);
    return true;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    logError(`[${client.name}] Failed to send WhatsApp reply:`, detail);
    errorLogger.logErrorToFile(`[${client.name}] Failed to send WhatsApp reply: ${detail}`, err);
    return false;
  }
}

/**
 * Handle a message from the client's configured owner number.
 *
 * @returns {Promise<boolean>} true if the message was a recognized
 *   #takeover/#release command (handled here, stop processing); false if
 *   it should fall through to normal customer handling.
 */
async function handleOwnerCommand(client, from, text) {
  const command = handover.parseOwnerCommand(text);
  if (!command) return false;

  if (command.command === 'approve' || command.command === 'reject') {
    await handleQuoteDecision(client, command.command);
    return true;
  }

  const target = command.number
    ? conversationManager.findConversationByNumber(client.id, command.number)
    : conversationManager.findMostRecent(client.id);

  if (!target) {
    await notifyOwner(
      client,
      command.number
        ? `No conversation found for ${command.number}.`
        : 'No active conversations yet.'
    );
    return true;
  }

  const active = command.command === 'takeover';
  conversationManager.setHandover(client.id, target.customer_number, active);

  const label = target.customer_name
    ? `${target.customer_name} (${target.customer_number})`
    : target.customer_number;

  await notifyOwner(
    client,
    active
      ? `You're now handling the conversation with ${label}. Zara will stay quiet until you send #release.`
      : `Zara is back in control of the conversation with ${label}.`
  );

  return true;
}

/** WhatsApp notification sent to the owner when a customer needs human help. */
function buildUrgentNotification(client, from, text, conv) {
  const label = conv && conv.customer_name ? `${conv.customer_name} (${from})` : from;
  return (
    `Heads up - ${label} needs human help:\n"${text}"\n\n` +
    `Reply #takeover ${from} to take over this conversation, or #takeover to grab the most recent one.`
  );
}

/** WhatsApp notification sent to the owner when Zara collects a full quote request. */
function buildQuoteNotification(quote, from) {
  return (
    `New Quote Request from ${quote.name}:\n` +
    `- Contact: ${quote.contact_number}\n` +
    `- Item: ${quote.item_description}\n` +
    `- Size: ${quote.size}\n` +
    `- Quantity: ${quote.quantity}\n` +
    `(WhatsApp: ${from})`
  );
}

/** WhatsApp notification sent to the owner when a Tier 2 PDF quote is ready for review. */
function buildPdfQuoteNotification(record) {
  return (
    `New quote ready for approval — R${Number(record.total).toFixed(2)} for ${record.name}. ` +
    `Reply #approve to send or #reject to decline.`
  );
}

/**
 * Tier 2 flow: calculate the total from the client's price list, generate
 * the branded PDF, store it as a pending quote, and notify the owner for
 * approval. The PDF is NOT sent to the customer yet.
 */
async function handleTier2Quote(client, from, quote, { items, total }) {
  const record = quoteManager.addPdfQuote({
    client_id: client.id,
    client_name: client.name,
    customer_number: from,
    name: quote.name,
    contact_number: quote.contact_number,
    item_description: quote.item_description,
    size: quote.size,
    quantity: quote.quantity,
    line_items: items,
    total,
  });

  try {
    const pdfBuffer = await pdfGenerator.generateQuotePdf(client, record);
    quoteManager.savePdfFile(record.id, pdfBuffer);
  } catch (err) {
    logError(`[${client.name}] Failed to generate quote PDF:`, err.message);
    errorLogger.logErrorToFile(`[${client.name}] Failed to generate quote PDF`, err);
  }

  await notifyOwner(client, buildPdfQuoteNotification(record));
}

/**
 * Handle an owner's #approve/#reject reply for the most recent pending
 * Tier 2 quote. #approve sends the PDF to the customer; #reject leaves it
 * for the owner to handle manually.
 */
async function handleQuoteDecision(client, decision) {
  const pending = quoteManager.getMostRecentPendingQuote(client.id);
  if (!pending) {
    await notifyOwner(client, `No pending quotes to ${decision}.`);
    return;
  }

  if (decision === 'approve') {
    const result = await quoteActions.approveQuote(client, pending);
    if (result.ok) {
      await notifyOwner(client, `Quote sent to ${pending.name}.`);
    } else if (result.reason === 'pdf_missing') {
      await notifyOwner(
        client,
        `Could not find the PDF for ${pending.name}'s quote. Please follow up manually.`
      );
    } else {
      await notifyOwner(
        client,
        `Failed to send the quote to ${pending.name}. Please follow up manually.`
      );
    }
  } else {
    quoteActions.rejectQuote(pending);
    await notifyOwner(
      client,
      `Quote for ${pending.name} marked as rejected. Please follow up with them manually.`
    );
  }
}

/**
 * Core pipeline. Order of operations:
 *  1. Owner commands (#takeover / #release) - handled and stopped here.
 *  2. Record the message + learn the customer's name if introduced.
 *  3. Active handover - Zara stays silent, message just logged.
 *  4. Urgent keywords - canned "connect you with someone" reply + owner ping.
 *  5. Outside business hours - closed-hours auto-reply.
 *  6. Normal flow - Claude reply, returning-customer greeting, quote capture.
 *
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

  // The owner messaging the bot's own number is a control command, not a
  // customer conversation - handle it separately and stop.
  if (handover.isFromOwner(client, from)) {
    const handled = await handleOwnerCommand(client, from, text);
    if (handled) return;
  }

  const startedAt = Date.now();

  conversationManager.recordCustomerMessage(client.id, from, text);
  const conv = conversationManager.getConversation(client.id, from);

  // Capture the name we already knew about *before* this message, so a
  // first-time introduction doesn't get treated as a "returning customer".
  const priorCustomerName = conv.customer_name;

  const introducedName = conversationManager.extractIntroducedName(text);
  if (introducedName) {
    conversationManager.setCustomerName(client.id, from, introducedName);
  }

  // The owner has taken this conversation over: Zara stays silent.
  if (conv.handover_active) {
    logsManager.addLog({
      client_id: client.id,
      client_name: client.name,
      customer_number: from,
      customer_message: text,
      bot_reply: '(handover active - no reply sent)',
      response_time_ms: Date.now() - startedAt,
      status: 'handover',
    });
    return;
  }

  // Urgent keyword - hand off to a human regardless of business hours.
  if (handover.isUrgentMessage(text)) {
    conversationManager.setAwaitingHuman(client.id, from, true);

    memory.addMessage(client.id, from, 'user', text);
    memory.addMessage(client.id, from, 'assistant', URGENT_REPLY);

    await sendReply(client, from, URGENT_REPLY);
    await notifyOwner(client, buildUrgentNotification(client, from, text, conv));

    logsManager.addLog({
      client_id: client.id,
      client_name: client.name,
      customer_number: from,
      customer_message: text,
      bot_reply: URGENT_REPLY,
      response_time_ms: Date.now() - startedAt,
      status: 'handover',
    });
    return;
  }

  // Outside business hours - send the closed-hours auto-reply.
  if (!businessHours.isWithinBusinessHours(client)) {
    const reply = businessHours.getClosedMessage(client);

    memory.addMessage(client.id, from, 'user', text);
    memory.addMessage(client.id, from, 'assistant', reply);

    const sent = await sendReply(client, from, reply);

    logsManager.addLog({
      client_id: client.id,
      client_name: client.name,
      customer_number: from,
      customer_message: text,
      bot_reply: reply,
      response_time_ms: Date.now() - startedAt,
      status: sent ? 'success' : 'failed',
    });
    return;
  }

  // Normal flow: ask Claude for a reply.
  const isNewSession = memory.getHistory(client.id, from).length === 0;
  const returningCustomerName = isNewSession ? priorCustomerName : null;

  memory.addMessage(client.id, from, 'user', text);
  const history = memory.getHistory(client.id, from);

  let reply;
  let status = 'success';
  let quote = null;

  try {
    const rawReply = await getClaudeReply(client, history, {
      returningCustomerName,
      quoteRequestsEnabled: !!client.quote_requests_enabled,
    });

    const extracted = quoteManager.extractQuoteRequest(rawReply);
    reply = extracted.text;
    quote = extracted.quote;

    // Persist the cleaned reply (marker stripped) so it's part of the
    // next turn's context.
    memory.addMessage(client.id, from, 'assistant', reply);
  } catch (err) {
    logError(`[${client.name}] Claude API error:`, err.message);
    errorLogger.logErrorToFile(`[${client.name}] Claude API error`, err);
    reply = settingsManager.getSettings().fallback_message;
    status = 'failed';
  }

  const sent = await sendReply(client, from, reply);
  if (!sent) status = 'failed';

  if (quote) {
    let total = 0;

    if (quoteManager.isPdfQuoteEnabled(client)) {
      const calc = quoteManager.calculateQuoteTotal(client.price_list, quote.line_items);
      total = calc.total;
      await handleTier2Quote(client, from, quote, calc);
    } else {
      quoteManager.addQuote({
        client_id: client.id,
        client_name: client.name,
        customer_number: from,
        ...quote,
      });
      await notifyOwner(client, buildQuoteNotification(quote, from));
    }

    const isRepeatCustomer = quoteManager
      .getQuotesForClient(client.id)
      .some((q) => q.customer_number === from && ['sent', 'won'].includes(q.status));

    const score = leadTagger.scoreQuote({
      total,
      size: quote.size,
      quantity: quote.quantity,
      itemDescription: quote.item_description,
      isRepeatCustomer,
    });
    conversationManager.setLeadTag(client.id, from, score);
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
