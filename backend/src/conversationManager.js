'use strict';

const { readJSON, writeJSON } = require('./fileStore');
const { normalizeNumber } = require('./phone');

const CONVERSATIONS_FILE = 'conversations.json';

// ------------------------------------------------------------------
// Per-conversation state (one entry per client + customer number):
//
//   conversations["<clientId>:<customerNumber>"] = {
//     client_id, customer_number,
//     customer_name: string|null,       // self-introduced name, once learned
//     handover_active: boolean,         // owner has taken over (#takeover)
//     awaiting_human: boolean,          // urgent keyword seen, owner notified,
//                                        // but no #takeover yet
//     last_message_at: ISO string|null,
//     last_message_preview: string,
//     updated_at: ISO string,
//   }
//
// Persisted to conversations.json so handover status and customer names
// survive restarts/redeploys.
// ------------------------------------------------------------------

let conversations = {};

/** Load conversations.json into memory, creating it if missing. */
function load() {
  const parsed = readJSON(CONVERSATIONS_FILE, { conversations: {} });
  conversations =
    parsed && typeof parsed.conversations === 'object' && parsed.conversations !== null
      ? parsed.conversations
      : {};
  return conversations;
}

function persist() {
  writeJSON(CONVERSATIONS_FILE, { conversations });
}

function keyFor(clientId, customerNumber) {
  return `${clientId}:${customerNumber}`;
}

/** Get (creating if needed) the conversation record for a client + customer. */
function getConversation(clientId, customerNumber) {
  const key = keyFor(clientId, customerNumber);
  if (!conversations[key]) {
    conversations[key] = {
      client_id: clientId,
      customer_number: customerNumber,
      customer_name: null,
      handover_active: false,
      awaiting_human: false,
      last_message_at: null,
      last_message_preview: '',
      lead_temperature: null,
      lead_reason: '',
      updated_at: new Date().toISOString(),
    };
  }
  return conversations[key];
}

/** Update the conversation's lead-temperature tag (hot/warm/cold) + reason. */
function setLeadTag(clientId, customerNumber, tag) {
  const conv = getConversation(clientId, customerNumber);
  if (!tag) return conv;
  conv.lead_temperature = tag.temperature;
  conv.lead_reason = tag.reason || '';
  conv.updated_at = new Date().toISOString();
  persist();
  return conv;
}

/** Record an incoming customer message (updates last-seen metadata). */
function recordCustomerMessage(clientId, customerNumber, text) {
  const conv = getConversation(clientId, customerNumber);
  const now = new Date().toISOString();
  conv.last_message_at = now;
  conv.last_message_preview = String(text || '').slice(0, 200);
  conv.updated_at = now;
  persist();
  return conv;
}

/**
 * Turn handover on/off for a conversation. Either action (#takeover or
 * #release) means the owner has addressed the situation, so it also clears
 * awaiting_human.
 */
function setHandover(clientId, customerNumber, active) {
  const conv = getConversation(clientId, customerNumber);
  conv.handover_active = Boolean(active);
  conv.awaiting_human = false;
  conv.updated_at = new Date().toISOString();
  persist();
  return conv;
}

function setAwaitingHuman(clientId, customerNumber, awaiting) {
  const conv = getConversation(clientId, customerNumber);
  conv.awaiting_human = Boolean(awaiting);
  conv.updated_at = new Date().toISOString();
  persist();
  return conv;
}

/** Store the customer's name the first time we learn it (never overwrite). */
function setCustomerName(clientId, customerNumber, name) {
  const conv = getConversation(clientId, customerNumber);
  if (!conv.customer_name && name) {
    conv.customer_name = name;
    conv.updated_at = new Date().toISOString();
    persist();
  }
  return conv;
}

/**
 * Find a client's conversation by customer number, matching regardless of
 * "+"/spacing differences (e.g. the owner typing "#takeover +27821234567").
 */
function findConversationByNumber(clientId, customerNumber) {
  const target = normalizeNumber(customerNumber);
  return Object.values(conversations).find(
    (c) => c.client_id === clientId && normalizeNumber(c.customer_number) === target
  );
}

/** The most recently active conversation for a client ("#takeover" with no number). */
function findMostRecent(clientId) {
  const candidates = Object.values(conversations).filter(
    (c) => c.client_id === clientId && c.last_message_at
  );
  if (candidates.length === 0) return undefined;
  return candidates.reduce((latest, c) =>
    new Date(c.updated_at) > new Date(latest.updated_at) ? c : latest
  );
}

/** All conversations for a client, most recently active first. */
function getConversationsForClient(clientId) {
  return Object.values(conversations)
    .filter((c) => c.client_id === clientId)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

/** All conversations across every client, most recently active first. */
function getAllConversations() {
  return Object.values(conversations).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

/** Drop all stored conversation state for a client (e.g. on delete). */
function clearForClient(clientId) {
  for (const key of Object.keys(conversations)) {
    if (conversations[key].client_id === clientId) {
      delete conversations[key];
    }
  }
  persist();
}

// Heuristic: pull a self-introduced first name out of a customer's message,
// e.g. "Hi, my name is Thabo" / "I'm Sarah" / "This is John speaking".
const NAME_INTRO_REGEX = /\b(?:my name is|i am|i'm|this is|name's)\s+([A-Za-z][A-Za-z'-]{1,24})\b/i;

/** Returns a capitalized first name if the message introduces one, else null. */
function extractIntroducedName(text) {
  const match = String(text || '').match(NAME_INTRO_REGEX);
  if (!match) return null;
  const name = match[1];
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

module.exports = {
  load,
  getConversation,
  recordCustomerMessage,
  setHandover,
  setAwaitingHuman,
  setCustomerName,
  setLeadTag,
  findConversationByNumber,
  findMostRecent,
  getConversationsForClient,
  getAllConversations,
  clearForClient,
  extractIntroducedName,
};
