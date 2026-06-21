'use strict';

const { log, logError } = require('./logger');
const errorLogger = require('./errorLogger');
const clientManager = require('./clientManager');
const quoteManager = require('./quoteManager');
const { sendWhatsAppMessage } = require('./whatsapp');
const { formatCurrency, formatDate } = require('./pdfGenerator');

function buildReminderText(client, quote) {
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
      await sendWhatsAppMessage(client, quote.customer_number, buildReminderText(client, quote));
      quoteManager.markExpiryReminderSent(quote.id);
      log(`[quoteReminders] Sent expiry reminder for quote ${quote.id} to ${quote.customer_number}`);
    } catch (err) {
      const detail = err.response ? JSON.stringify(err.response.data) : err.message;
      logError(`[quoteReminders] Failed to send reminder for quote ${quote.id}:`, detail);
      errorLogger.logErrorToFile(`[quoteReminders] Failed to send reminder for quote ${quote.id}: ${detail}`, err);
    }
  }
}

module.exports = { runExpiryReminders };
