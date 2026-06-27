'use strict';

const clientManager = require('./clientManager');
const gmailClient = require('./gmailClient');
const { generateEmailReply } = require('./emailReply');
const { log, logError } = require('./logger');
const errorLogger = require('./errorLogger');
const quoteManager = require('./quoteManager');
const leadTagger = require('./leadTagger');
const pdfGenerator = require('./pdfGenerator');
const settingsManager = require('./settingsManager');
const emailLogsManager = require('./emailLogsManager');
const { notifyOwner } = require('./webhook');

const POLL_INTERVAL_MS = 2 * 60 * 1000;

let polling = false;

function quotesPortalLink() {
  return `${settingsManager.getSettings().client_portal_url}/client/quotes`;
}

/**
 * Mirrors webhook.js's Tier 1/Tier 2 quote handling for an email-sourced
 * quote request: same scoring, same PDF generation, same owner
 * notification — just no WhatsApp-specific "from" masking, and the record
 * is tagged channel: 'email' so quoteActions.js sends the eventual approval
 * back over Gmail instead of WhatsApp.
 */
async function handleQuoteRequest(client, fromAddress, quote) {
  if (quoteManager.hasRecentDuplicateQuote(client.id, fromAddress, quote.item_description)) {
    log(`[${client.name}] Skipped duplicate email quote request from ${fromAddress} for "${quote.item_description}"`);
    return;
  }

  const isPdf = quoteManager.isPdfQuoteEnabled(client);
  const calc = isPdf
    ? quoteManager.calculateQuoteTotal(client.price_list, quote.line_items)
    : { items: [], total: 0 };

  const isRepeatCustomer = quoteManager
    .getQuotesForClient(client.id)
    .some((q) => q.customer_number === fromAddress && ['sent', 'won'].includes(q.status));

  const score = leadTagger.scoreQuote({
    total: calc.total,
    size: quote.size,
    quantity: quote.quantity,
    itemDescription: quote.item_description,
    isRepeatCustomer,
  });

  if (isPdf) {
    const needsPricing = calc.total <= 0;
    const record = quoteManager.addPdfQuote({
      client_id: client.id,
      client_name: client.name,
      customer_number: fromAddress,
      channel: 'email',
      name: quote.name,
      contact_number: quote.contact_number,
      item_description: quote.item_description,
      size: quote.size,
      quantity: quote.quantity,
      line_items: calc.items,
      total: calc.total,
      status: needsPricing ? 'needs_pricing' : 'pending',
    });

    if (!needsPricing) {
      try {
        const pdfBuffer = await pdfGenerator.generateQuotePdf(client, record);
        quoteManager.savePdfFile(record.id, pdfBuffer);
      } catch (err) {
        logError(`[${client.name}] Failed to generate email quote PDF:`, err.message);
        errorLogger.logErrorToFile(`[${client.name}] Failed to generate email quote PDF`, err);
      }
    }

    const text = needsPricing
      ? `New quote request (email) — ${score.temperature.toUpperCase()} — ${record.name}, ${record.contact_number}, ${record.item_description || 'their request'} — didn't match anything on your price list, no PDF generated. Please price it manually and follow up directly. View in portal: ${quotesPortalLink()}`
      : `New quote request (email) — ${score.temperature.toUpperCase()} — ${record.name}, ${record.contact_number}, ${record.item_description}, ${pdfGenerator.formatCurrency(record.total)}. Approve in portal: ${quotesPortalLink()}`;

    await notifyOwner(client, text, { email: true, emailSubject: `New quote request — ${score.temperature.toUpperCase()}` });
  } else {
    quoteManager.addQuote({
      client_id: client.id,
      client_name: client.name,
      customer_number: fromAddress,
      channel: 'email',
      name: quote.name,
      contact_number: quote.contact_number,
      item_description: quote.item_description,
      size: quote.size,
      quantity: quote.quantity,
    });

    const text = `New quote request (email) — ${score.temperature.toUpperCase()} — ${quote.name}, ${quote.contact_number}, ${quote.item_description} (size: ${quote.size}, qty: ${quote.quantity}). (Email: ${fromAddress})\nApprove in portal: ${quotesPortalLink()}`;
    await notifyOwner(client, text, { email: true, emailSubject: `New quote request — ${score.temperature.toUpperCase()}` });
  }
}

/** Process all unread mail for one client: generate + send a Claude reply (handling any quote request along the way), then mark read. */
async function processClient(client) {
  const unread = await gmailClient.listUnreadForClient(client);
  log(`[${client.name}] Email poll: ${unread.length} unread message(s) for ${client.email_address}`);
  if (unread.length === 0) return 0;

  let handled = 0;
  for (const { id } of unread) {
    try {
      const message = await gmailClient.getMessage(client, id);

      const rawReply = await generateEmailReply(client, {
        fromName: message.fromName,
        subject: message.subject,
        bodyText: message.bodyText,
      });

      const { text: replyText, quote } = quoteManager.extractQuoteRequest(rawReply);

      if (quote) {
        await handleQuoteRequest(client, message.fromAddress, quote);
      }

      await gmailClient.sendReply(client, {
        threadId: message.threadId,
        to: message.fromAddress,
        subject: message.subject,
        bodyText: replyText,
        inReplyTo: message.messageIdHeader,
        references: message.references || message.messageIdHeader,
      });

      await gmailClient.markAsRead(client, id);

      emailLogsManager.addLog({
        client_id: client.id,
        from_address: message.fromAddress,
        from_name: message.fromName,
        subject: message.subject,
        customer_message: message.bodyText,
        reply_text: replyText,
      });

      handled += 1;
      log(`[${client.name}] Replied to email from ${message.fromAddress} (subject: "${message.subject}")`);
    } catch (err) {
      logError(`[${client.name}] Failed to process email ${id}:`, err.message);
    }
  }
  return handled;
}

/** Run one poll cycle across every client with email receptionist enabled. One client's failure never blocks the rest. */
async function pollAllClients() {
  const clients = clientManager
    .getActiveClients()
    .filter((c) => c.email_receptionist_enabled && c.gmail_refresh_token && c.email_address);

  const results = {};
  for (const client of clients) {
    try {
      results[client.id] = await processClient(client);
    } catch (err) {
      logError(`[${client.name}] Email poll failed:`, err.message);
      results[client.id] = 0;
    }
  }
  return results;
}

function startEmailPolling() {
  if (polling) return;
  polling = true;
  log(`Email polling started (every ${POLL_INTERVAL_MS / 1000}s)`);
  setInterval(() => {
    pollAllClients().catch((err) => logError('Email poll cycle failed:', err.message));
  }, POLL_INTERVAL_MS);
}

module.exports = { startEmailPolling, pollAllClients };
