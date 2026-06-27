'use strict';

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./fileStore');

const EMAIL_LOGS_FILE = 'email-logs.json';

// Hard cap so email-logs.json doesn't grow forever. Oldest entries dropped.
const MAX_LOGS = 5000;

let logs = [];

function load() {
  const parsed = readJSON(EMAIL_LOGS_FILE, { logs: [] });
  logs = Array.isArray(parsed.logs) ? parsed.logs : [];
  return logs;
}

function persist() {
  writeJSON(EMAIL_LOGS_FILE, { logs });
}

/**
 * @param {object} entry
 * @param {string} entry.client_id
 * @param {string} entry.from_address
 * @param {string} entry.from_name
 * @param {string} entry.subject
 * @param {string} entry.customer_message
 * @param {string} entry.reply_text
 */
function addLog(entry) {
  const record = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...entry };
  logs.push(record);
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(-MAX_LOGS);
  }
  persist();
  return record;
}

/** Email exchanges for a single client, most-recent-first. */
function getLogsForClient(clientId, { limit = 100 } = {}) {
  return logs
    .filter((l) => l.client_id === clientId)
    .slice()
    .reverse()
    .slice(0, limit);
}

function getTodayCountForClient(clientId) {
  const todayStr = new Date().toISOString().slice(0, 10);
  return logs.filter((l) => l.client_id === clientId && l.timestamp.slice(0, 10) === todayStr).length;
}

module.exports = { load, addLog, getLogsForClient, getTodayCountForClient };
