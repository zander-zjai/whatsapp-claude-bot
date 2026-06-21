'use strict';

// ------------------------------------------------------------------
// Deterministic lead scoring, computed once a quote request has been
// captured (not asked of Claude per-reply). Built from concrete signals
// rather than tone-of-voice words like "urgent" — those are noisy in a
// signage business where almost every customer describes their job that
// way regardless of real intent.
//
// Strong signals used:
//  - quote total (the single best signal — money on the table)
//  - a specific date/deadline mentioned (verifiable, unlike "urgent")
//  - dimension/quantity specificity (vague "how much for a banner" vs an
//    exact size+quantity correlates with shopping-around vs ready-to-buy)
//  - repeat customer (a prior quote that was actually sent/won is worth
//    more attention than a cold inquiry, regardless of phrasing)
//
// Full contact info isn't scored separately: the quote-collection flow
// already requires name + contact number + specifics before a [[QUOTE_
// REQUEST]] marker is ever emitted, so it's a precondition, not a signal.
//
// scoreLead() is the shared tiering core — the JARVIS call-log service
// (zjai-vapi-webhook, a separate deployed repo) ports this same function
// verbatim as lib/leadScorer.js so a WhatsApp lead and a phone-call lead
// are judged by identical hot/warm/cold rules. Keep both in sync.
// ------------------------------------------------------------------

const HOT_TOTAL_THRESHOLD = 5000;

// Verifiable date/deadline language — weekday names, "by/before <day>",
// "this/next week", "tomorrow", or an explicit calendar date. Deliberately
// excludes bare "urgent"/"asap" (see comment above).
const DATE_REGEX =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|this week|next week|by \d|before \d|\d{1,2}[/-]\d{1,2}|\d{1,2}(st|nd|rd|th)\b|january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

// A real dimension or quantity, not just "a banner" / "some stickers" —
// e.g. "200x200mm", "2m x 1m", "4", "10 units".
const SPECIFIC_REGEX = /\d/;

/**
 * Core tiering logic, shared (in spirit — ported, not imported, since the
 * call-log service is a separate deployed repo) with JARVIS's leadScorer.
 *
 * @param {object} params
 * @param {number} [params.total] - Quote/order total in Rand, 0 if none.
 * @param {boolean} [params.hasDate] - A verifiable date/deadline was given.
 * @param {boolean} [params.isSpecific] - An exact size/quantity was given.
 * @param {boolean} [params.isRepeatCustomer] - Prior quote that was sent/won.
 * @returns {{ temperature: 'hot'|'warm'|'cold', reason: string }}
 */
function scoreLead({ total = 0, hasDate = false, isSpecific = false, isRepeatCustomer = false }) {
  const reasons = [];
  let temperature;

  if (total >= HOT_TOTAL_THRESHOLD) {
    temperature = 'hot';
    reasons.push(`quote of R${total.toFixed(0)}`);
  } else if (hasDate && isSpecific) {
    temperature = 'hot';
    reasons.push('specific date + exact size/quantity given');
  } else if (total > 0 || hasDate || isSpecific) {
    temperature = 'warm';
    if (total > 0) reasons.push(`quote of R${total.toFixed(0)}`);
    if (hasDate) reasons.push('mentioned a date');
    if (isSpecific) reasons.push('gave specific size/quantity');
  } else {
    temperature = 'cold';
    reasons.push('vague request, no date or specifics yet');
  }

  if (isRepeatCustomer && temperature !== 'hot') {
    temperature = temperature === 'cold' ? 'warm' : 'hot';
    reasons.push('repeat customer');
  }

  return { temperature, reason: reasons.join(' + ') };
}

/**
 * WhatsApp-side wrapper: derives hasDate/isSpecific from the quote's raw
 * text fields via regex, then runs the shared scoreLead() tiering.
 *
 * @param {object} params
 * @param {number} [params.total] - Calculated quote total (Tier 2 only; 0/undefined for Tier 1).
 * @param {string} [params.size] - The size/specs field from the quote request.
 * @param {string} [params.quantity] - The quantity field from the quote request.
 * @param {string} [params.itemDescription] - What they're asking for.
 * @param {boolean} [params.isRepeatCustomer] - Has a prior quote that was sent/won for this number.
 * @returns {{ temperature: 'hot'|'warm'|'cold', reason: string }}
 */
function scoreQuote({ total = 0, size = '', quantity = '', itemDescription = '', isRepeatCustomer = false }) {
  const combinedText = `${size} ${quantity} ${itemDescription}`;
  const hasDate = DATE_REGEX.test(combinedText);
  const isSpecific = SPECIFIC_REGEX.test(size) || SPECIFIC_REGEX.test(quantity);

  return scoreLead({ total, hasDate, isSpecific, isRepeatCustomer });
}

module.exports = { scoreQuote, scoreLead, HOT_TOTAL_THRESHOLD };
