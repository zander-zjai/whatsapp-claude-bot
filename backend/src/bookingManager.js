'use strict';

const { logError } = require('./logger');

// ------------------------------------------------------------------
// Booking-collection prompt + reply parsing. Mirrors quoteManager.js's
// [[QUOTE_REQUEST]] marker pattern: when a client has
// google_calendar_enabled, this block is appended to their system prompt.
// Once Claude has an exact date/time plus the customer's name and contact
// number, it emits a hidden [[BOOKING_REQUEST]]...[[/BOOKING_REQUEST]] JSON
// block at the end of its reply, which extractBookingRequest() below strips
// out before the message is sent to the customer.
// ------------------------------------------------------------------
const BOOKING_INSTRUCTIONS = `APPOINTMENT BOOKING: If the customer wants to book an appointment or consultation, collect the following through natural conversation — ask for whatever is still missing, one or two questions at a time:
- their name
- a contact number
- an EXACT date and time they want (e.g. "Tuesday 25 June at 2pm" — not "sometime next week" or "in the afternoon". If they're vague, ask them to confirm a specific date and time before continuing — you cannot book a vague time.)

Once you have all three, confirm the date and time back to them in your reply, then append this exact block to the very end of your reply, on its own line, with nothing after it (the customer will never see this — it is removed before the message is sent):
[[BOOKING_REQUEST]]{"name":"...","contact_number":"...","date":"YYYY-MM-DD","time":"HH:MM","duration_minutes":30,"notes":"..."}[[/BOOKING_REQUEST]]

Do not include this block until you have an exact date and time plus their name and contact number. Only include it ONCE per distinct booking — if you already submitted this exact block earlier in the conversation and the customer is now just saying thanks or asking something unrelated, do NOT include it again. Otherwise, continue the conversation normally.`;

/** Only returns booking instructions if the client has calendar booking enabled. */
function buildBookingInstructions(client) {
  return client && client.google_calendar_enabled ? BOOKING_INSTRUCTIONS : null;
}

const BOOKING_MARKER_REGEX = /\[\[BOOKING_REQUEST\]\]([\s\S]*?)\[\[\/BOOKING_REQUEST\]\]/;

/**
 * Strip a [[BOOKING_REQUEST]]{...}[[/BOOKING_REQUEST]] marker out of
 * Claude's reply, if present, and parse the JSON payload.
 *
 * @returns {{ text: string, booking: object|null }}
 */
function extractBookingRequest(replyText) {
  const source = String(replyText || '');
  const match = source.match(BOOKING_MARKER_REGEX);
  if (!match) return { text: source, booking: null };

  let booking = null;
  try {
    const parsed = JSON.parse(match[1]);
    booking = {
      name: String(parsed.name || '').trim(),
      contact_number: String(parsed.contact_number || '').trim(),
      date: String(parsed.date || '').trim(),
      time: String(parsed.time || '').trim(),
      duration_minutes: Number(parsed.duration_minutes) || 30,
      notes: String(parsed.notes || '').trim(),
    };
  } catch (err) {
    logError('Failed to parse [[BOOKING_REQUEST]] marker:', err.message);
  }

  const text = source.replace(BOOKING_MARKER_REGEX, '').trim();
  return { text, booking };
}

module.exports = {
  BOOKING_INSTRUCTIONS,
  buildBookingInstructions,
  extractBookingRequest,
};
