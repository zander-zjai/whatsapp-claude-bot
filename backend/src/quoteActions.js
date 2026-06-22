'use strict';

const { logError } = require('./logger');
const errorLogger = require('./errorLogger');
const quoteManager = require('./quoteManager');
const { sendWhatsAppDocument } = require('./whatsapp');

/**
 * Build the customer-facing caption that goes out with the PDF: validity,
 * the owner-provided ETA (if set), and how to pay — a real payment link if
 * the client has one configured, otherwise their EFT banking details as a
 * fallback so there's always a concrete next step for the customer.
 */
function buildQuoteCaption(client, quote) {
  const parts = [`Here's your quote! 🎉 It's valid until ${new Date(quote.valid_until).toLocaleDateString('en-ZA')}${quote.eta ? `, with an estimated completion time of ${quote.eta}` : ''}.`];

  parts.push(`If you have any questions or would like to make changes, just let us know — we're happy to help.`);

  if (client.payment_link_url) {
    parts.push(`To go ahead, pay here: ${client.payment_link_url}`);
  } else if (client.banking_details) {
    parts.push(`To go ahead, pay via EFT:\n${client.banking_details}\nPlease send proof of payment once paid.`);
  }

  return parts.join(' ');
}

/** Send a generated PDF quote to the customer. Returns true on success. */
async function sendQuotePdf(client, quote, pdfBuffer) {
  try {
    const filename = `Quote-${quote.id.slice(0, 8)}.pdf`;
    const caption = buildQuoteCaption(client, quote);
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
 * Approve a pending Tier 2 quote: record the owner-provided ETA, mark it
 * approved, send the generated PDF (with ETA + payment instructions) to the
 * customer via WhatsApp, and mark it sent on success. Shared by the
 * WhatsApp #approve command and the client portal's "Approve" button.
 *
 * @returns {Promise<{ ok: boolean, reason?: 'pdf_missing'|'send_failed' }>}
 */
async function approveQuote(client, quote, eta) {
  if (eta !== undefined) {
    quoteManager.setQuoteEta(quote.id, eta);
  }
  quoteManager.setQuoteStatus(quote.id, 'approved');

  const pdfBuffer = quoteManager.readPdfFile(quote.id);
  if (!pdfBuffer) {
    return { ok: false, reason: 'pdf_missing' };
  }

  const sent = await sendQuotePdf(client, quoteManager.getQuoteById(quote.id), pdfBuffer);
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
