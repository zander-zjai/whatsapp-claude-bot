'use strict';

const { logError } = require('./logger');

// ------------------------------------------------------------------
// Every WhatsApp reply gets a hidden lead-temperature tag appended, the
// same way quoteManager appends [[QUOTE_REQUEST]]. Lets the owner scan
// Conversations in the portal and call back hot leads first instead of
// reading every transcript.
// ------------------------------------------------------------------

const LEAD_TAG_INSTRUCTIONS = `LEAD TAGGING: After every reply, silently assess how "hot" this lead is based on the conversation so far:
- "hot": they asked about price/cost/quote AND mentioned urgency (e.g. "asap", "urgent", "today", "need it by", a deadline)
- "warm": they asked about price/cost/quote, OR mentioned urgency, but not both
- "cold": general browsing/info questions, no pricing or urgency signal yet

Append this exact block to the very end of your reply, on its own line, with nothing after it (the customer will never see this — it is removed before the message is sent):
[[LEAD_TAG]]{"temperature":"hot|warm|cold","reason":"<one short phrase, e.g. 'asked price + needs it today'>"}[[/LEAD_TAG]]

Always include this block, on every reply, even if nothing has changed since the last message.`;

const LEAD_TAG_REGEX = /\[\[LEAD_TAG\]\]([\s\S]*?)\[\[\/LEAD_TAG\]\]/;
const VALID_TEMPERATURES = ['hot', 'warm', 'cold'];

/**
 * Strip a [[LEAD_TAG]]{...}[[/LEAD_TAG]] marker out of Claude's reply, if
 * present, and parse the JSON payload.
 *
 * @returns {{ text: string, tag: {temperature: string, reason: string}|null }}
 */
function extractLeadTag(replyText) {
  const source = String(replyText || '');
  const match = source.match(LEAD_TAG_REGEX);
  if (!match) return { text: source, tag: null };

  let tag = null;
  try {
    const parsed = JSON.parse(match[1]);
    const temperature = VALID_TEMPERATURES.includes(parsed.temperature) ? parsed.temperature : null;
    if (temperature) {
      tag = { temperature, reason: String(parsed.reason || '').trim() };
    }
  } catch (err) {
    logError('Failed to parse [[LEAD_TAG]] marker:', err.message);
  }

  const text = source.replace(LEAD_TAG_REGEX, '').trim();
  return { text, tag };
}

module.exports = { LEAD_TAG_INSTRUCTIONS, extractLeadTag };
