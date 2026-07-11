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

/**
 * True if a client has Auto PDF Quote enabled â€” i.e. a non-empty price list
 * is configured. When true, completed quote conversations auto-generate a
 * branded PDF that the owner approves in the portal before it's sent.
 * Without a price list, Zara collects the details and notifies the owner
 * to quote manually.
 */
function isPdfQuoteEnabled(client) {
  return (
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

const EXPIRY_REMINDER_WINDOW_HOURS = 72; // 3-day reminder per spec

/**
 * Sent Tier 2 quotes whose valid_until falls within the next
 * EXPIRY_REMINDER_WINDOW_HOURS and haven't already had a reminder sent â€”
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
 * not already followed up â€” candidates for the "still thinking about it?"
 * check-in. Doesn't know about conversation activity (that's a cross-module
 * check the caller does against conversationManager) â€” this only filters
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
 * prompt â€” undefined if this customer has no quotes on record.
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
 * unit prices and line totals from the price list. An optional marginPercent
 * (e.g. 15 for 15%) is applied on top of each base unit price.
 *
 * @param {Array<{item: string, unit: string, price: number}>} priceList
 * @param {Array<{item: string, quantity: number}>} lineItems
 * @param {number} [marginPercent=0]
 * @returns {{ items: Array, total: number }}
 */
function calculateQuoteTotal(priceList, lineItems, marginPercent = 0) {
  const list = Array.isArray(priceList) ? priceList : [];
  const multiplier = 1 + (Number(marginPercent) || 0) / 100;

  const items = (Array.isArray(lineItems) ? lineItems : []).map((requested) => {
    const match = findPriceListEntry(list, requested.item);
    const basePrice = match ? Number(match.price) || 0 : 0;
    const unitPrice = round2(basePrice * multiplier);
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

/**
 * Recalculate totals for revised line items where the owner has manually
 * set unit prices. Takes prices as-is â€” no price list matching, no margin.
 */
function recalculateRevisedItems(lineItems) {
  const items = (Array.isArray(lineItems) ? lineItems : []).map((li) => {
    const unitPrice = round2(Number(li.unit_price) || 0);
    const quantity = Number(li.quantity) || 0;
    return {
      item: String(li.item || ''),
      unit: String(li.unit || ''),
      quantity,
      unit_price: unitPrice,
      line_total: round2(unitPrice * quantity),
    };
  });
  const total = round2(items.reduce((sum, item) => sum + item.line_total, 0));
  return { items, total };
}

/**
 * Save a revision to an existing quote. The current line items are pushed
 * into a revisions array for the audit trail, then the quote is updated
 * with the revised figures and its status set to 'revised'.
 */
function saveRevision(id, { lineItems, total, notes }) {
  const quote = getQuoteById(id);
  if (!quote) return undefined;

  if (!Array.isArray(quote.revisions)) quote.revisions = [];
  quote.revisions.push({
    revised_at: new Date().toISOString(),
    line_items: quote.line_items,
    total: quote.total,
    notes: quote.revision_notes || null,
  });

  quote.line_items = lineItems;
  quote.total = total;
  quote.revision_notes = notes || null;
  quote.status = 'revised';
  quote.updated_at = new Date().toISOString();
  persist();
  return quote;
}

/** Mark any overdue Tier 2 quotes as expired. Returns the newly-expired records. */
function expireOverdueQuotes() {
  const now = Date.now();
  const actionable = new Set(['pending', 'sent', 'revised', 'needs_pricing']);
  const expired = [];

  for (const q of quotes) {
    if (q.tier !== 2 || !actionable.has(q.status)) continue;
    if (q.valid_until && new Date(q.valid_until).getTime() < now) {
      q.status = 'expired';
      q.updated_at = new Date().toISOString();
      expired.push(q);
    }
  }

  if (expired.length > 0) persist();
  return expired;
}

/** All quotes for a specific customer number under a client, newest first. */
function getQuotesForCustomer(clientId, customerNumber) {
  return quotes
    .filter((q) => q.client_id === clientId && q.customer_number === customerNumber)
    .slice()
    .reverse();
}

/** Monthly analytics summary for a client's Tier 2 quotes. */
function getQuoteAnalytics(clientId) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const clientQuotes = quotes.filter((q) => q.client_id === clientId && q.tier === 2);
  const thisMonth = clientQuotes.filter((q) => new Date(q.created_at).getTime() >= monthStart);

  const totalValue = thisMonth.reduce((s, q) => s + (Number(q.total) || 0), 0);
  const accepted = thisMonth.filter((q) => ['won', 'accepted'].includes(q.status)).length;
  const pending = thisMonth.filter((q) => ['pending', 'sent', 'revised'].includes(q.status)).length;
  const declined = thisMonth.filter((q) => ['rejected', 'declined', 'lost'].includes(q.status)).length;
  const expired = thisMonth.filter((q) => q.status === 'expired').length;
  const conversionRate = thisMonth.length > 0 ? Math.round((accepted / thisMonth.length) * 100) : 0;

  return { total_quotes: thisMonth.length, total_value: totalValue, accepted, pending, declined, expired, conversion_rate: conversionRate };
}

/** Expired quotes that haven't yet had the owner notified. */
function getQuotesNeedingExpiryNotification() {
  return quotes.filter((q) => q.tier === 2 && q.status === 'expired' && !q.expiry_owner_notified);
}

/** Mark that the owner has been notified of this quote's expiry. */
function markExpiryOwnerNotified(id) {
  const quote = getQuoteById(id);
  if (!quote) return undefined;
  quote.expiry_owner_notified = true;
  persist();
  return quote;
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
const QUOTE_REQUEST_INSTRUCTIONS = `QUOTE REQUESTS: If the customer asks for a price, quote, or estimate, you are Zara — a knowledgeable signage sales consultant. Guide them through a natural, conversational quote process. Ask ONE or TWO questions at a time maximum — never fire off a long list. Be friendly, helpful, and knowledgeable about signage.

Work through these details in natural conversational flow (do not ask all at once):
1. TYPE of signage — lightbox, fabricated letters, flat cut letters, pylon sign, billboard, vehicle wrap, banner, window vinyl, or other. If they're unsure, help them identify it with a question or two.
2. SIZE — width x height in mm or metres. If they don't know, ask for the approximate size or available wall/space dimensions.
3. MATERIAL — aluminium, PVC, acrylic, steel, or vinyl. If unsure, ask whether it's for indoor or outdoor use and whether illumination is needed — this will guide the material choice.
4. ILLUMINATION — required or not. If yes: LED front lit, back lit, halo lit, or none.
5. QUANTITY — how many units do they need.
6. INSTALLATION — supply only, or supply and install? If install: ask for the address and mounting surface/height.
7. DESIGN & ARTWORK — ask the following in one conversational message:
   a) What text/content must appear on the sign? (business name, tagline, phone number, website, slogan — whatever they want displayed)
   b) Do they have a logo or brand artwork? If yes, ask them to please send it now in this chat (WhatsApp supports image and PDF uploads). Explain it will be included in the sign mockup we prepare for them.
   c) If they don't have a logo or need design help from scratch, note that — the design team will be in touch.
8. TIMELINE — when do they need it by? Is there an event date or deadline?
9. CONTACT DETAILS — their name, and email address (you already have their WhatsApp number, so do NOT ask for a phone number).

CRITICAL PRICING RULE: NEVER state, mention, hint at, or reference ANY price, cost, total, rand amount, or estimate on WhatsApp — not even approximate ranges. All pricing is communicated exclusively via a formal PDF quote sent after owner review. If asked how much it costs, tell them the formal quote will cover everything and will be sent shortly.

Never guess or assume details — if an answer is vague, probe gently with a follow-up. Once you have captured all nine points, summarise everything back to the customer clearly for confirmation before logging the request. e.g. "Great, let me just confirm what I've got: [summary]. Does that all look right?"

Only after the customer confirms, append this exact block to the very end of your reply, on its own line, with nothing after it (the customer will never see this — it is removed before the message is sent):
[[QUOTE_REQUEST]]{"name":"...","contact_number":"","email":"...","item_description":"...","size":"...","material":"...","illumination":"...","quantity":"...","installation":"...","design_status":"...","timeline":"...","line_items":[]}[[/QUOTE_REQUEST]]

Do not include this block until EVERY field has been confirmed. Only include it ONCE per distinct request — if you already submitted this exact block earlier in the conversation and the customer is now just saying thanks, goodbye, or asking something unrelated, do NOT include it again. Otherwise, continue the conversation normally.`

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

  return `QUOTE REQUESTS: If the customer asks for a price, quote, or estimate, gather the details you need through natural, sales-savvy conversation. Lead with the most important questions first â€” what they need, size/specs, and quantity â€” and collect their name last once the essentials are confirmed. Do NOT ask for a phone number; you already have their contact via this chat.

Collect these details (in the order that makes sense for the conversation):
- what they need (the specific product/service â€” type, material, intended use)
- the size or specifications
- the quantity
- their name (collect this last)

You have access to this price list:
${priceListText}

CRITICAL PRICING RULE: NEVER state, mention, hint at, or reference ANY price, cost, total, rand amount, or estimate on WhatsApp — not even approximate ranges. All pricing is communicated exclusively via a formal PDF quote sent after owner review. If asked how much it costs, tell them the formal quote will cover everything and will be sent shortly. This rule applies at all times, even after collecting all details.

Once you have ALL FOUR details, use the price list internally to build the line items â€” but DO NOT state any price or estimate to the customer. Instead, confirm the details back to them and let them know a formal quote will be prepared and sent to them shortly, e.g. "Perfect â€” I've captured all the details. Our team will review and send you a formal quote as soon as possible." Give a warm, natural close. Do not mention prices, totals, or estimates at all. Then append this exact block to the very end of your reply, on its own line, with nothing after it (the customer will never see this â€” it is removed before the message is sent):
[[QUOTE_REQUEST]]{"name":"...","contact_number":"","email":"...","item_description":"...","size":"...","material":"...","illumination":"...","quantity":"...","installation":"...","design_status":"...","timeline":"...","line_items":[{"item":"<exact item name from the price list>","quantity":<number>}]}[[/QUOTE_REQUEST]]

If nothing on the price list matches what they need, use "line_items":[] and let the team price it manually. Do not include this block until every field has been provided. Only include it ONCE per distinct request â€” if you already submitted this exact block earlier in the conversation and the customer is now just saying thanks, goodbye, or asking something unrelated, do NOT include it again. Otherwise, continue the conversation normally.`;
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
  revised: 'being revised by our team â€” an updated quote is coming',
  rejected: 'being reviewed manually by our team â€” someone will follow up',
  declined: 'declined â€” please reach out if you change your mind',
  accepted: 'accepted â€” thank you for your business',
  quoted: 'quoted and awaiting your decision',
  won: 'confirmed â€” thank you for your business',
  lost: 'closed out',
  expired: 'expired â€” please reach out for a new quote',
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
  recalculateRevisedItems,
  saveRevision,
  expireOverdueQuotes,
  getQuotesForCustomer,
  getQuoteAnalytics,
  getQuotesNeedingExpiryNotification,
  markExpiryOwnerNotified,
  getPdfFilePath,
  savePdfFile,
  readPdfFile,
  deletePdfFile,
  QUOTE_VALIDITY_DAYS,
};


