'use strict';

const settingsManager = require('./settingsManager');

// ------------------------------------------------------------------
// In-memory conversation history.
//
//   store = {
//     "<clientId>:<userNumber>": {
//       messages: [ { role: 'user'|'assistant', content: '...' }, ... ],
//       lastActivity: <epoch ms>
//     }
//   }
//
// - Keeps the last N messages per user per client, where N comes from
//   settings.max_conversation_memory (Settings page), default below.
// - Resets a conversation after RESET_AFTER_MS of inactivity.
// NOTE: This is process memory only. Restarting the server clears it,
// and it does not scale across multiple instances. Swap for Redis /
// a database if you need persistence or horizontal scaling.
// ------------------------------------------------------------------

const DEFAULT_MAX_MESSAGES = 10;
const RESET_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours

const store = new Map();

function getMaxMessages() {
  const configured = settingsManager.getSettings().max_conversation_memory;
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_MESSAGES;
}

function keyFor(clientId, userNumber) {
  return `${clientId}:${userNumber}`;
}

/**
 * Return the conversation history (array of Claude-format messages) for a
 * user, resetting it first if it has been inactive for over 24 hours.
 */
function getHistory(clientId, userNumber) {
  const key = keyFor(clientId, userNumber);
  const entry = store.get(key);

  if (!entry) return [];

  if (Date.now() - entry.lastActivity > RESET_AFTER_MS) {
    store.delete(key);
    return [];
  }

  return entry.messages;
}

/**
 * Append a single message ({ role, content }) to a user's history,
 * trimming to the most recent MAX_MESSAGES and refreshing the activity
 * timestamp.
 */
function addMessage(clientId, userNumber, role, content) {
  const key = keyFor(clientId, userNumber);
  let entry = store.get(key);

  // If the existing entry is stale, start fresh.
  if (entry && Date.now() - entry.lastActivity > RESET_AFTER_MS) {
    entry = undefined;
  }

  if (!entry) {
    entry = { messages: [], lastActivity: Date.now() };
    store.set(key, entry);
  }

  entry.messages.push({ role, content });

  // Keep only the most recent N messages (N from settings).
  const maxMessages = getMaxMessages();
  if (entry.messages.length > maxMessages) {
    entry.messages = entry.messages.slice(-maxMessages);
  }

  entry.lastActivity = Date.now();
}

/** Number of conversations currently held in memory (for diagnostics). */
function activeConversationCount() {
  return store.size;
}

/** Drop all stored conversations for a given client (e.g. on delete). */
function clearForClient(clientId) {
  for (const key of store.keys()) {
    if (key.startsWith(`${clientId}:`)) {
      store.delete(key);
    }
  }
}

module.exports = {
  getHistory,
  addMessage,
  activeConversationCount,
  clearForClient,
  RESET_AFTER_MS,
};
