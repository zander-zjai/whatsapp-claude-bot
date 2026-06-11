'use strict';

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./fileStore');

const LOGS_FILE = 'logs.json';

// Hard cap so logs.json doesn't grow forever on a long-running server.
// Oldest entries are dropped once this is exceeded.
const MAX_LOGS = 5000;

let logs = [];

/** Load logs.json into memory, creating an empty file if missing. */
function loadLogs() {
  const parsed = readJSON(LOGS_FILE, { logs: [] });
  logs = Array.isArray(parsed.logs) ? parsed.logs : [];
  return logs;
}

function persist() {
  writeJSON(LOGS_FILE, { logs });
}

/**
 * Append one message log entry and persist to disk.
 *
 * @param {object} entry
 * @param {string} entry.client_id
 * @param {string} entry.client_name
 * @param {string} entry.customer_number
 * @param {string} entry.customer_message
 * @param {string} entry.bot_reply
 * @param {number} entry.response_time_ms
 * @param {'success'|'failed'} entry.status
 */
function addLog(entry) {
  const record = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  };

  logs.push(record);

  if (logs.length > MAX_LOGS) {
    logs = logs.slice(-MAX_LOGS);
  }

  persist();
  return record;
}

/**
 * Return logs for a single client, most-recent-first, optionally filtered
 * by a free-text search (matches customer number, message, or reply) and/or
 * an inclusive date range (YYYY-MM-DD strings, compared on the date portion
 * of the timestamp).
 */
function getLogsForClient(clientId, { search, dateFrom, dateTo, limit = 100 } = {}) {
  let filtered = logs.filter((l) => l.client_id === clientId);

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (l) =>
        (l.customer_number || '').toLowerCase().includes(q) ||
        (l.customer_message || '').toLowerCase().includes(q) ||
        (l.bot_reply || '').toLowerCase().includes(q)
    );
  }

  if (dateFrom) {
    filtered = filtered.filter((l) => l.timestamp.slice(0, 10) >= dateFrom);
  }

  if (dateTo) {
    filtered = filtered.filter((l) => l.timestamp.slice(0, 10) <= dateTo);
  }

  return filtered
    .slice()
    .reverse() // most recent first
    .slice(0, limit);
}

function isToday(isoTimestamp) {
  const today = new Date().toISOString().slice(0, 10);
  return isoTimestamp.slice(0, 10) === today;
}

function isThisMonth(isoTimestamp) {
  const nowMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  return isoTimestamp.slice(0, 7) === nowMonth;
}

/**
 * Aggregate stats for the dashboard:
 * - messages_today / messages_this_month (totals)
 * - messages_today_by_client: { client_id: count }
 * - chart_data: per-day message counts per client for the last 7 days
 */
function getStats() {
  const messagesToday = logs.filter((l) => isToday(l.timestamp));
  const messagesThisMonth = logs.filter((l) => isThisMonth(l.timestamp));

  const messagesTodayByClient = {};
  for (const l of messagesToday) {
    messagesTodayByClient[l.client_id] = (messagesTodayByClient[l.client_id] || 0) + 1;
  }

  // Build the last 7 calendar days (oldest -> newest), UTC-based.
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const chartData = days.map((date) => ({ date }));
  const dateIndex = new Map(chartData.map((row, idx) => [row.date, idx]));

  for (const l of logs) {
    const date = l.timestamp.slice(0, 10);
    const idx = dateIndex.get(date);
    if (idx === undefined) continue; // outside the 7-day window

    const row = chartData[idx];
    row[l.client_id] = (row[l.client_id] || 0) + 1;
  }

  return {
    messages_today: messagesToday.length,
    messages_this_month: messagesThisMonth.length,
    messages_today_by_client: messagesTodayByClient,
    chart_data: chartData,
  };
}

module.exports = {
  loadLogs,
  addLog,
  getLogsForClient,
  getStats,
};
