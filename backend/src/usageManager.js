'use strict';

const { readJSON, writeJSON } = require('./fileStore');

const USAGE_FILE = 'usage.json';

// Sonnet pricing (per Anthropic's published rates, unchanged across recent
// Sonnet versions incl. 4.5/4.6) — update here if pricing changes.
const USD_PER_MILLION_INPUT_TOKENS = 3;
const USD_PER_MILLION_OUTPUT_TOKENS = 15;

// Fixed manual rate — intentionally not a live FX lookup. Update by hand.
const ZAR_PER_USD = 18.5;

let usage = [];

/** Load usage.json into memory, creating an empty file if missing. */
function load() {
  const parsed = readJSON(USAGE_FILE, { usage: [] });
  usage = Array.isArray(parsed.usage) ? parsed.usage : [];
  return usage;
}

function persist() {
  writeJSON(USAGE_FILE, { usage });
}

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function estimateCostUsd(inputTokens, outputTokens) {
  return (inputTokens / 1_000_000) * USD_PER_MILLION_INPUT_TOKENS + (outputTokens / 1_000_000) * USD_PER_MILLION_OUTPUT_TOKENS;
}

/** Find (or create) this client's record for the given calendar month. */
function getOrCreateRecord(clientId, month) {
  let record = usage.find((u) => u.client_id === clientId && u.month === month);
  if (!record) {
    record = { client_id: clientId, month, message_count: 0, input_tokens: 0, output_tokens: 0 };
    usage.push(record);
  }
  return record;
}

/**
 * Record one Claude API call's token usage against a client's current
 * calendar month. Called immediately after every getClaudeReply() call.
 */
function recordUsage(clientId, { inputTokens = 0, outputTokens = 0 } = {}) {
  const record = getOrCreateRecord(clientId, monthKey());
  record.message_count += 1;
  record.input_tokens += inputTokens;
  record.output_tokens += outputTokens;
  persist();
  return record;
}

/** This client's usage for the current calendar month, with cost estimates. */
function getMonthlyUsageForClient(clientId) {
  const record = usage.find((u) => u.client_id === clientId && u.month === monthKey()) || {
    client_id: clientId,
    month: monthKey(),
    message_count: 0,
    input_tokens: 0,
    output_tokens: 0,
  };

  const estimated_cost_usd = estimateCostUsd(record.input_tokens, record.output_tokens);

  return {
    ...record,
    estimated_cost_usd,
    estimated_cost_zar: estimated_cost_usd * ZAR_PER_USD,
  };
}

/** Total estimated spend (USD/ZAR) across every client for the current calendar month. */
function getMonthlySummary() {
  const month = monthKey();
  const records = usage.filter((u) => u.month === month);

  const totals = records.reduce(
    (acc, r) => {
      acc.message_count += r.message_count;
      acc.input_tokens += r.input_tokens;
      acc.output_tokens += r.output_tokens;
      return acc;
    },
    { message_count: 0, input_tokens: 0, output_tokens: 0 }
  );

  const estimated_cost_usd = estimateCostUsd(totals.input_tokens, totals.output_tokens);

  return {
    ...totals,
    estimated_cost_usd,
    estimated_cost_zar: estimated_cost_usd * ZAR_PER_USD,
  };
}

module.exports = {
  load,
  recordUsage,
  getMonthlyUsageForClient,
  getMonthlySummary,
  ZAR_PER_USD,
};
