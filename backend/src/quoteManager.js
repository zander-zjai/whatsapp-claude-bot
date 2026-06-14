'use strict';

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./fileStore');
const { logError } = require('./logger');

const QUOTES_FILE = 'quotes.json';

// Hard cap so quotes.json doesn't grow forever. Oldest entries are dropped.
const MAX_QUOTES = 1000;

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
 * Store a new quote request.
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

/** Drop all stored quote requests for a client (e.g. on delete). */
function clearForClient(clientId) {
  quotes = quotes.filter((q) => q.client_id !== clientId);
  persist();
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

Do not include this block until every field has been provided. Otherwise, continue the conversation normally.`;

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
    };
  } catch (err) {
    logError('Failed to parse [[QUOTE_REQUEST]] marker:', err.message);
  }

  const text = source.replace(QUOTE_MARKER_REGEX, '').trim();
  return { text, quote };
}

module.exports = {
  load,
  addQuote,
  getQuotesForClient,
  getAllQuotes,
  clearForClient,
  extractQuoteRequest,
  QUOTE_REQUEST_INSTRUCTIONS,
};
