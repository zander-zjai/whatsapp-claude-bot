'use strict';

const { log, logError } = require('./logger');
const errorLogger = require('./errorLogger');
const clientManager = require('./clientManager');
const quoteManager = require('./quoteManager');
const conversationManager = require('./conversationManager');
const { sendWhatsAppMessage } = require('./whatsapp');
const { formatCurrency, formatDate } = require('./pdfGenerator');

function buildExpiryReminderText(client, quote) {
  const daysLeft = Math.max(
    1,
    Math.ceil((new Date(quote.valid_until).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  );

  return (
    `Hi ${quote.name || 'there'}! Just a friendly reminder that your quote from ${client.name} ` +
    `for ${formatCurrency(quote.total)} is valid until ${formatDate(quote.valid_until)} ` +
    `(${daysLeft} day${daysLeft === 1 ? '' : 's'} left). Would you like to go ahead? Just reply here and we'll get it sorted.`
  );
}

/**
 * Nudge customers whose sent Tier 2 quote is about to expire. Each quote is
 * only ever reminded once (quoteManager.markExpiryReminderSent), so this is
 * safe to call repeatedly on an interval.
 */
async function runExpiryReminders() {
  const candidates = quoteManager.getQuotesNeedingExpiryReminder();
  if (candidates.length === 0) return;

  log(`[quoteReminders] ${candidates.length} quote(s) due an expiry reminder`);

  for (const quote of candidates) {
    const client = clientManager.getClientById(quote.client_id);
    if (!client) continue;

    try {
      await sendWhatsAppMessage(client, quote.customer_number, buildExpiryReminderText(client, quote));
      quoteManager.markExpiryReminderSent(quote.id);
      log(`[quoteReminders] Sent expiry reminder for quote ${quote.id} to ${quote.customer_number}`);
    } catch (err) {
      const detail = err.response ? JSON.stringify(err.response.data) : err.message;
      logError(`[quoteReminders] Failed to send expiry reminder for quote ${quote.id}:`, detail);
      errorLogger.logErrorToFile(`[quoteReminders] Failed to send expiry reminder for quote ${quote.id}: ${detail}`, err);
    }
  }
}

function buildFollowupText(client, quote) {
  return (
    `Hi ${quote.name || 'there'}! Still thinking about that ${quote.item_description || 'quote'} ` +
    `from ${client.name}? No rush — just let us know if you'd like to go ahead or have any questions.`
  );
}

/**
 * Gentle check-in on quotes that have gone quiet: sent 24+ hours ago, not
 * yet expired, and the customer hasn't sent a single message since (if
 * they have, they're already engaged — don't interrupt that). Each quote
 * is only ever followed up once (quoteManager.markFollowupSent).
 */
async function runSilenceFollowups() {
  const candidates = quoteManager.getQuotesNeedingFollowup();
  if (candidates.length === 0) return;

  log(`[quoteReminders] ${candidates.length} quote(s) candidate for a silence follow-up`);

  for (const quote of candidates) {
    const client = clientManager.getClientById(quote.client_id);
    if (!client) continue;

    const conversation = conversationManager.findConversationByNumber(quote.client_id, quote.customer_number);
    const sentAt = new Date(quote.updated_at).getTime();
    const lastMessageAt = conversation && conversation.last_message_at ? new Date(conversation.last_message_at).getTime() : 0;

    // Customer has already messaged again since the quote was sent —
    // they're engaged, no need for a check-in.
    if (lastMessageAt > sentAt) {
      quoteManager.markFollowupSent(quote.id);
      continue;
    }

    try {
      await sendWhatsAppMessage(client, quote.customer_number, buildFollowupText(client, quote));
      quoteManager.markFollowupSent(quote.id);
      log(`[quoteReminders] Sent silence follow-up for quote ${quote.id} to ${quote.customer_number}`);
    } catch (err) {
      const detail = err.response ? JSON.stringify(err.response.data) : err.message;
      logError(`[quoteReminders] Failed to send follow-up for quote ${quote.id}:`, detail);
      errorLogger.logErrorToFile(`[quoteReminders] Failed to send follow-up for quote ${quote.id}: ${detail}`, err);
    }
  }
}

async function runAll() {
  await runExpiryReminders();
  await runSilenceFollowups();
}

module.exports = { runExpiryReminders, runSilenceFollowups, runAll };
