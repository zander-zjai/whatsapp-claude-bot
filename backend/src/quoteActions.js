'use strict';

const { logError } = require('./logger');
const errorLogger = require('./errorLogger');
const quoteManager = require('./quoteManager');
const { sendWhatsAppDocument } = require('./whatsapp');

/** Send a generated PDF quote to the customer. Returns true on success. */
async function sendQuotePdf(client, quote, pdfBuffer) {
  try {
    const filename = `Quote-${quote.id.slice(0, 8)}.pdf`;
    const caption = `Here's your quote, valid until ${new Date(quote.valid_until).toLocaleDateString('en-ZA')}.`;
    await sendWhatsAppDocument(client, quote.customer_number, pdfBuffer, filename, caption);
    return true;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    logError(`[${client.name}] Failed to send quote PDF:`, detail);
    errorLogger.logErrorToFile(`[${client.name}] Failed to send quote PDF`, err);
    return false;
  }
}

/**
 * Approve a pending Tier 2 quote: mark it approved, send the generated PDF
 * to the customer via WhatsApp, and mark it sent on success. Shared by the
 * WhatsApp #approve command and the client portal's "Approve" button.
 *
 * @returns {Promise<{ ok: boolean, reason?: 'pdf_missing'|'send_failed' }>}
 */
async function approveQuote(client, quote) {
  quoteManager.setQuoteStatus(quote.id, 'approved');

  const pdfBuffer = quoteManager.readPdfFile(quote.id);
  if (!pdfBuffer) {
    return { ok: false, reason: 'pdf_missing' };
  }

  const sent = await sendQuotePdf(client, quote, pdfBuffer);
  if (!sent) {
    return { ok: false, reason: 'send_failed' };
  }

  quoteManager.setQuoteStatus(quote.id, 'sent');
  return { ok: true };
}

/**
 * Reject a pending Tier 2 quote: marks it rejected so the owner can follow
 * up with the customer manually. Shared by the WhatsApp #reject command and
 * the client portal's "Reject" button.
 */
function rejectQuote(quote) {
  return quoteManager.setQuoteStatus(quote.id, 'rejected');
}

module.exports = { sendQuotePdf, approveQuote, rejectQuote };
