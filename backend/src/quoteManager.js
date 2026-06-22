'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readJSON, writeJSON, dataPath } = require('./fileStore');
const { logError } = require('./logger');
const { DEFAULT_TERMS } = require('./pdfGenerator');

const QUOTES_FILE = 'quotes.json';
const PDF_DIR = 'quote-pdfs';

// Hard cap so quotes.json doesn't grow forever. Oldest entries are dropped.
const MAX_QUOTES = 1000;

// Tier 2 (Auto PDF Quote) quotes stay valid for this many days from issue.
const QUOTE_VALIDITY_DAYS = 7;

let quotes = [];

/** Load quotes.json into memory, creating an empty file if missing. */
function load() {
  const parsed = readJSON(QUOTES_FILE, { quotes: [] });
  quotes = Array.isArray(parsed.quotes) ? parsed.quotes : [];
  return quotes;
}

function persist() {
  writeJSON(QUOTES_FILE, { quotes });
}

/**
 * Store a new Tier 1 quote request (Quote Assist - owner finalizes manually).
 *
 * @param {object} entry
 * @param {string} entry.client_id
 * @param {string} entry.client_name
 * @param {string} entry.customer_number
 * @param {string} entry.name
 * @param {string} entry.contact_number
 * @param {string} entry.item_description
 * @param {string} entry.size
 * @param {string} entry.quantity
 */
function addQuote(entry) {
  const record = {
    id: crypto.randomUUID(),
    tier: 1,
    status: 'pending',
    payment_received: false,
    created_at: new Date().toISOString(),
    ...entry,
  };

  quotes.push(record);

  if (quotes.length > MAX_QUOTES) {
    quotes = quotes.slice(-MAX_QUOTES);
  }

  persist();
  return record;
}

/** Quote requests for a single client, most-recent-first. */
function getQuotesForClient(clientId, { limit = 100 } = {}) {
  return quotes
    .filter((q) => q.client_id === clientId)
    .slice()
    .reverse()
    .slice(0, limit);
}

/** Quote requests across every client, most-recent-first. */
function getAllQuotes({ limit = 100 } = {}) {
  return quotes.slice().reverse().slice(0, limit);
}

/** Find a single quote by id, or undefined if it doesn't exist. */
function getQuoteById(id) {
  return quotes.find((q) => q.id === id);
}

// A reply Claude sends shortly after a quote (e.g. the customer just says
// "thanks") can re-trigger the [[QUOTE_REQUEST]] marker even with prompt
// instructions not to. This is a safety net against that: skip creating a
// second quote for the same customer + same request within this window.
const DUPLICATE_QUOTE_WINDOW_MINUTES = 60;

/**
 * True if this customer already has a quote for the same item, for this
 * client, created within the last DUPLICATE_QUOTE_WINDOW_MINUTES.
 */
function hasRecentDuplicateQuote(clientId, customerNumber, itemDescription) {
  const cutoff = Date.now() - DUPLICATE_QUOTE_WINDOW_MINUTES * 60 * 1000;
  const normalized = String(itemDescription || '').trim().toLowerCase();

  return quotes.some(
    (q) =>
      q.client_id === clientId &&
      q.customer_number === customerNumber &&
      String(q.item_description || '').trim().toLowerCase() === normalized &&
      new Date(q.created_at).getTime() >= cutoff
  );
}

/** Drop all stored quote requests (and any generated PDFs) for a client. */
function clearForClient(clientId) {
  quotes
    .filter((q) => q.client_id === clientId && q.tier === 2)
    .forEach((q) => deletePdfFile(q.id));

  quotes = quotes.filter((q) => q.client_id !== clientId);
  persist();
}

// ------------------------------------------------------------------
// Tier 2: Auto PDF Quote
//
// When a client has quote_tier=2 and a non-empty price_list, a completed
// quote-collection flow generates a branded PDF and a "pending" record
// here instead of (just) notifying the owner with a summary. The owner
// then replies #approve (PDF sent to the customer, status -> sent) or
// #reject (status -> rejected, owner handles manually).
// ------------------------------------------------------------------

/**
 * True if a client has Tier 2 (Auto PDF Quote) configured with at least one
 * price list entry. Clients with quote_tier=2 but an empty price list fall
 * back to Tier 1 (Quote Assist) since totals can't be calculated.
 */
function isPdfQuoteEnabled(client) {
  return (
    Number(client && client.quote_tier) === 2 &&
    Array.isArray(client && client.price_list) &&
    client.price_list.length > 0
  );
}

/**
 * Store a new pending Tier 2 quote. Sets id, tier, status ("pending"),
 * timestamps and the 7-day validity window; `entry` supplies the
 * customer/line-item details.
 */
function addPdfQuote(entry) {
  const now = new Date();
  const validUntil = new Date(now.getTime() + QUOTE_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

  const record = {
    id: crypto.randomUUID(),
    tier: 2,
    status: 'pending',
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    valid_until: validUntil.toISOString(),
    expiry_reminder_sent: false,
    followup_sent: false,
    payment_received: false,
    eta: null,
    ...entry,
  };

  quotes.push(record);

  if (quotes.length > MAX_QUOTES) {
    quotes = quotes.slice(-MAX_QUOTES);
  }

  persist();
  return record;
}

/**
 * Update a quote's status. Tier 2 quotes move through the PDF approval
 * lifecycle (pending -> approved -> sent, or pending -> rejected); both
 * tiers can also be marked quoted/won/lost from the client portal once the
 * job outcome is known.
 */
function setQuoteStatus(id, status) {
  const quote = getQuoteById(id);
  if (!quote) return undefined;
  quote.status = status;
  quote.updated_at = new Date().toISOString();
  persist();
  return quote;
}

/** Set whether the customer's payment has been received (manual toggle, independent of won/lost). */
function setPaymentReceived(id, value) {
  const quote = getQuoteById(id);
  if (!quote) return undefined;
  quote.payment_received = Boolean(value);
  quote.updated_at = new Date().toISOString();
  persist();
  return quote;
}

/** Set the owner-provided ETA (free text, e.g. "7-10 working days") on a quote. */
function setQuoteEta(id, eta) {
  const quote = getQuoteById(id);
  if (!quote) return undefined;
  quote.eta = eta || null;
  persist();
  return quote;
}

/** Most recent pending Tier 2 quote for a client, or undefined if none. */
function getMostRecentPendingQuote(clientId) {
  for (let i = quotes.length - 1; i >= 0; i--) {
    const q = quotes[i];
    if (q.client_id === clientId && q.tier === 2 && q.status === 'pending') return q;
  }
  return undefined;
}

const EXPIRY_REMINDER_WINDOW_HOURS = 48;

/**
 * Sent Tier 2 quotes whose valid_until falls within the next
 * EXPIRY_REMINDER_WINDOW_HOURS and haven't already had a reminder sent —
 * the candidates for the expiry-reminder nudge.
 */
function getQuotesNeedingExpiryReminder() {
  const now = Date.now();
  const cutoff = now + EXPIRY_REMINDER_WINDOW_HOURS * 60 * 60 * 1000;

  return quotes.filter((q) => {
    if (q.tier !== 2 || q.status !== 'sent' || q.expiry_reminder_sent) return false;
    const validUntil = new Date(q.valid_until).getTime();
    return validUntil > now && validUntil <= cutoff;
  });
}

const FOLLOWUP_MIN_HOURS = 24;

/**
 * Sent Tier 2 quotes older than FOLLOWUP_MIN_HOURS, not yet expired, and
 * not already followed up — candidates for the "still thinking about it?"
 * check-in. Doesn't know about conversation activity (that's a cross-module
 * check the caller does against conversationManager) — this only filters
 * on the quote record itself.
 */
function getQuotesNeedingFollowup() {
  const now = Date.now();
  const cutoff = now - FOLLOWUP_MIN_HOURS * 60 * 60 * 1000;

  return quotes.filter((q) => {
    if (q.tier !== 2 || q.status !== 'sent' || q.followup_sent) return false;
    const sentAt = new Date(q.updated_at).getTime();
    const validUntil = new Date(q.valid_until).getTime();
    return sentAt <= cutoff && validUntil > now;
  });
}

/** Mark a quote as having had its silence follow-up sent (never sent twice). */
function markFollowupSent(id) {
  const quote = getQuoteById(id);
  if (!quote) return undefined;
  quote.followup_sent = true;
  persist();
  return quote;
}

/** Mark a quote as having had its expiry reminder sent (never sent twice). */
function markExpiryReminderSent(id) {
  const quote = getQuoteById(id);
  if (!quote) return undefined;
  quote.expiry_reminder_sent = true;
  persist();
  return quote;
}

/**
 * Most recent quote (either tier) for a specific customer number, for
 * injecting "what's the status of my quote" context into Claude's system
 * prompt — undefined if this customer has no quotes on record.
 */
function getLatestQuoteForCustomer(clientId, customerNumber) {
  for (let i = quotes.length - 1; i >= 0; i--) {
    const q = quotes[i];
    if (q.client_id === clientId && q.customer_number === customerNumber) return q;
  }
  return undefined;
}

/** Absolute path to a Tier 2 quote's generated PDF file. */
function getPdfFilePath(id) {
  return dataPath(path.join(PDF_DIR, `${id}.pdf`));
}

/** Save a generated PDF buffer for a quote, creating the directory if needed. */
function savePdfFile(id, buffer) {
  const filePath = getPdfFilePath(id);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

/** Read a previously generated PDF for a quote, or null if it doesn't exist. */
function readPdfFile(id) {
  const filePath = getPdfFilePath(id);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

/** Delete a quote's generated PDF file, if any. */
function deletePdfFile(id) {
  const filePath = getPdfFilePath(id);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Find a price list entry matching a requested item name (exact, then fuzzy). */
function findPriceListEntry(priceList, itemName) {
  const target = String(itemName || '').toLowerCase().trim();
  if (!target) return undefined;

  return (
    priceList.find((p) => p.item.toLowerCase() === target) ||
    priceList.find(
      (p) => p.item.toLowerCase().includes(target) || target.includes(p.item.toLowerCase())
    )
  );
}

/**
 * Match Claude-proposed line items against a client's price list, recomputing
 * unit prices and line totals from the price list (not from whatever numbers
 * Claude may have guessed) so the PDF reflects the business's actual pricing.
 *
 * @param {Array<{item: string, unit: string, price: number}>} priceList
 * @param {Array<{item: string, quantity: number}>} lineItems
 * @returns {{ items: Array<{item: string, unit: string, quantity: number, unit_price: number, line_total: number}>, total: number }}
 */
function calculateQuoteTotal(priceList, lineItems) {
  const list = Array.isArray(priceList) ? priceList : [];

  const items = (Array.isArray(lineItems) ? lineItems : []).map((requested) => {
    const match = findPriceListEntry(list, requested.item);
    const unitPrice = match ? Number(match.price) || 0 : 0;
    const quantity = Number(requested.quantity) || 0;
    return {
      item: match ? match.item : requested.item,
      unit: match ? match.unit : '',
      quantity,
      unit_price: unitPrice,
      line_total: round2(unitPrice * quantity),
    };
  });

  const total = round2(items.reduce((sum, item) => sum + item.line_total, 0));
  return { items, total };
}

// ------------------------------------------------------------------
// Quote-collection prompt + reply parsing.
//
// When a client has quote_requests_enabled, this block is appended to
// their system prompt. Once Claude has gathered all five fields, it emits
// a hidden [[QUOTE_REQUEST]]...[[/QUOTE_REQUEST]] JSON block at the end of
// its reply, which extractQuoteRequest() below strips out before the
// message is sent to the customer.
// ------------------------------------------------------------------
const QUOTE_REQUEST_INSTRUCTIONS = `QUOTE REQUESTS: If the customer asks for a price, quote, or estimate, collect the following details through natural conversation — ask for whatever is still missing, one or two questions at a time, don't interrogate:
- their name
- a contact number
- what they need (the product/service they're asking about)
- the size or specifications
- the quantity

Once you have ALL FIVE details, append this exact block to the very end of your reply, on its own line, with nothing after it (the customer will never see this — it is removed before the message is sent):
[[QUOTE_REQUEST]]{"name":"...","contact_number":"...","item_description":"...","size":"...","quantity":"..."}[[/QUOTE_REQUEST]]

Do not include this block until every field has been provided. Only include it ONCE per distinct request — if you already submitted this exact block earlier in the conversation and the customer is now just saying thanks, goodbye, or asking something unrelated, do NOT include it again. Otherwise, continue the conversation normally.`;

/**
 * Build the quote-collection system prompt instructions for a client. Tier 2
 * clients (quote_tier=2 with a configured price list) get a variant that
 * includes the price list and asks Claude to also return matching line
 * items so the backend can calculate a total and generate a PDF quote.
 * Everything else gets the plain Tier 1 instructions.
 */
function buildQuoteInstructions(client) {
  if (!isPdfQuoteEnabled(client)) return QUOTE_REQUEST_INSTRUCTIONS;

  const priceListText = client.price_list
    .map((p) => `- ${p.item} (${p.unit}): R${Number(p.price).toFixed(2)}`)
    .join('\n');

  return `QUOTE REQUESTS: If the customer asks for a price, quote, or estimate, collect the following details through natural conversation — ask for whatever is still missing, one or two questions at a time, don't interrogate:
- their name
- a contact number
- what they need (the product/service they're asking about)
- the size or specifications
- the quantity

You have access to this price list:
${priceListText}

Once you have ALL FIVE details, match what the customer needs against the price list above and work out the quantity for each matching item (e.g. for a "per sqm" item, multiply the dimensions to get square metres; for a "per unit"/"each" item, use the quantity given). When you state the calculated price to the customer in this same reply, make clear this is a rough estimate and not yet the final confirmed price — e.g. "Please note this is a rough estimate — our team will review and send you the final confirmed quote as soon as possible." Then end with a soft close instead of a generic "is there anything else?" — give them a concrete next step, e.g. "This quote is valid for ${QUOTE_VALIDITY_DAYS} days — reply to confirm and we'll get you sorted with a deposit invoice." Adjust the wording naturally to fit the conversation, and reference these terms if it helps: ${client.quote_terms || DEFAULT_TERMS}. (Skip the soft close if nothing matched and no price was given — in that case just let them know the team will follow up.) Then append this exact block to the very end of your reply, on its own line, with nothing after it (the customer will never see this — it is removed before the message is sent):
[[QUOTE_REQUEST]]{"name":"...","contact_number":"...","item_description":"...","size":"...","quantity":"...","line_items":[{"item":"<exact item name from the price list>","quantity":<number>}]}[[/QUOTE_REQUEST]]

If nothing on the price list matches what they need, use "line_items":[] and let the team price it manually. Do not include this block until every field has been provided. Only include it ONCE per distinct request — if you already submitted this exact block earlier in the conversation and the customer is now just saying thanks, goodbye, or asking something unrelated, do NOT include it again. Otherwise, continue the conversation normally.`;
}

const QUOTE_MARKER_REGEX = /\[\[QUOTE_REQUEST\]\]([\s\S]*?)\[\[\/QUOTE_REQUEST\]\]/;

/**
 * Strip a [[QUOTE_REQUEST]]{...}[[/QUOTE_REQUEST]] marker out of Claude's
 * reply, if present, and parse the JSON payload.
 *
 * @returns {{ text: string, quote: object|null }} The customer-facing text
 *   (marker removed) and the parsed quote fields, or null if no marker /
 *   the JSON failed to parse.
 */
function extractQuoteRequest(replyText) {
  const source = String(replyText || '');
  const match = source.match(QUOTE_MARKER_REGEX);
  if (!match) return { text: source, quote: null };

  let quote = null;
  try {
    const parsed = JSON.parse(match[1]);
    quote = {
      name: String(parsed.name || '').trim(),
      contact_number: String(parsed.contact_number || '').trim(),
      item_description: String(parsed.item_description || '').trim(),
      size: String(parsed.size || '').trim(),
      quantity: String(parsed.quantity || '').trim(),
      line_items: Array.isArray(parsed.line_items)
        ? parsed.line_items
            .map((li) => ({
              item: String((li && li.item) || '').trim(),
              quantity: Number(li && li.quantity) || 0,
            }))
            .filter((li) => li.item && li.quantity > 0)
        : [],
    };
  } catch (err) {
    logError('Failed to parse [[QUOTE_REQUEST]] marker:', err.message);
  }

  const text = source.replace(QUOTE_MARKER_REGEX, '').trim();
  return { text, quote };
}

const STATUS_DESCRIPTIONS = {
  pending: 'still awaiting approval from our team',
  approved: 'approved and about to be sent to you',
  sent: 'sent to you and awaiting your decision',
  rejected: 'being reviewed manually by our team — someone will follow up',
  quoted: 'quoted and awaiting your decision',
  won: 'confirmed — thank you for your business',
  lost: 'closed out',
};

/**
 * One-line, customer-facing description of a customer's most recent quote,
 * for injecting into Claude's system prompt so it can answer "what's the
 * status of my quote?" directly without involving the owner. Returns null
 * if this customer has no quotes on record.
 */
function describeQuoteForCustomer(clientId, customerNumber) {
  const quote = getLatestQuoteForCustomer(clientId, customerNumber);
  if (!quote) return null;

  const itemDesc = quote.item_description || 'their request';
  const statusText = STATUS_DESCRIPTIONS[quote.status] || quote.status;

  if (quote.tier === 2 && quote.total > 0) {
    const validity = quote.valid_until ? ` (valid until ${new Date(quote.valid_until).toLocaleDateString('en-ZA')})` : '';
    return `Their most recent quote: ${itemDesc}, total R${Number(quote.total).toFixed(2)}, status: ${statusText}${validity}.`;
  }
  return `Their most recent quote request: ${itemDesc}, status: ${statusText}.`;
}

module.exports = {
  load,
  addQuote,
  getQuotesForClient,
  getAllQuotes,
  getQuoteById,
  hasRecentDuplicateQuote,
  clearForClient,
  extractQuoteRequest,
  buildQuoteInstructions,
  QUOTE_REQUEST_INSTRUCTIONS,
  isPdfQuoteEnabled,
  addPdfQuote,
  setQuoteStatus,
  setQuoteEta,
  setPaymentReceived,
  getMostRecentPendingQuote,
  getQuotesNeedingExpiryReminder,
  markExpiryReminderSent,
  getQuotesNeedingFollowup,
  markFollowupSent,
  getLatestQuoteForCustomer,
  describeQuoteForCustomer,
  calculateQuoteTotal,
  getPdfFilePath,
  savePdfFile,
  readPdfFile,
  deletePdfFile,
  QUOTE_VALIDITY_DAYS,
};
