'use strict';

const { normalizeNumber } = require('./phone');

// If a customer's message contains any of these (case-insensitive), Zara
// hands off to a human: replies with a connect-you-with-someone message and
// notifies the business owner.
const URGENT_KEYWORDS = ['speak to a person', 'talk to someone', 'human', 'urgent'];

/** True if the message contains any of the urgent/human-handoff keywords. */
function isUrgentMessage(text) {
  const lower = String(text || '').toLowerCase();
  return URGENT_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/** True if an incoming message's sender is this client's configured owner. */
function isFromOwner(client, from) {
  if (!client || !client.owner_phone) return false;
  return normalizeNumber(from) === normalizeNumber(client.owner_phone);
}

// "#takeover", "#release", optionally followed by a customer number, e.g.
// "#takeover +27821234567". "#approve"/"#reject" act on the most recent
// pending Tier 2 quote and don't take a number argument.
const COMMAND_REGEX = /^#(takeover|release|approve|reject)\b\s*(\S+)?/i;

/**
 * Parse an owner command out of a WhatsApp message.
 *
 * @returns {{ command: 'takeover'|'release'|'approve'|'reject', number: string|null }|null}
 *   null if the text isn't a recognized command.
 */
function parseOwnerCommand(text) {
  const match = String(text || '').trim().match(COMMAND_REGEX);
  if (!match) return null;
  return { command: match[1].toLowerCase(), number: match[2] || null };
}

module.exports = { isUrgentMessage, isFromOwner, parseOwnerCommand, URGENT_KEYWORDS };
