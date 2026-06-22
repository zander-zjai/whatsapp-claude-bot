'use strict';

const { normalizeNumber } = require('./phone');

// If a customer's message contains any of these (case-insensitive), Zara
// hands off to a human: replies with a connect-you-with-someone message and
// notifies the business owner. Deliberately limited to explicit requests for
// a person — words like "urgent" are too common in everyday phrasing (e.g.
// signage customers calling routine jobs "urgent") to be a reliable signal,
// and would otherwise block Zara from giving normal quotes/replies.
const URGENT_KEYWORDS = ['speak to a person', 'speak to someone', 'talk to a person', 'talk to someone', 'speak to a human', 'talk to a human'];

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

// "#assign <booking_id> <team member name>" — assigns a booked calendar
// event to a team member. The name is free text (can contain spaces), so
// it gets its own regex rather than reusing COMMAND_REGEX's single-token arg.
const ASSIGN_REGEX = /^#assign\s+(\S+)\s+(.+)$/i;

/**
 * Parse an owner command out of a WhatsApp message.
 *
 * @returns {{ command: 'takeover'|'release'|'approve'|'reject', number: string|null }
 *   | { command: 'assign', bookingId: string, teamMemberName: string }
 *   | null} null if the text isn't a recognized command.
 */
function parseOwnerCommand(text) {
  const trimmed = String(text || '').trim();

  const assignMatch = trimmed.match(ASSIGN_REGEX);
  if (assignMatch) {
    return { command: 'assign', bookingId: assignMatch[1], teamMemberName: assignMatch[2].trim() };
  }

  const match = trimmed.match(COMMAND_REGEX);
  if (!match) return null;
  return { command: match[1].toLowerCase(), number: match[2] || null };
}

module.exports = { isUrgentMessage, isFromOwner, parseOwnerCommand, URGENT_KEYWORDS };
