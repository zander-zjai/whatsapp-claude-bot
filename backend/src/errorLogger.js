'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./fileStore');

const ERROR_LOG_DIR = path.join(DATA_DIR, 'error-logs');
const RETENTION_DAYS = 7;

if (!fs.existsSync(ERROR_LOG_DIR)) {
  fs.mkdirSync(ERROR_LOG_DIR, { recursive: true });
}

function fileForDate(date) {
  return path.join(ERROR_LOG_DIR, `errors-${date.toISOString().slice(0, 10)}.log`);
}

/**
 * Append one error entry (as a JSON line) to today's error log file.
 * `err` may be an Error, or any value passed to a rejection handler.
 */
function logErrorToFile(message, err) {
  const entry = {
    timestamp: new Date().toISOString(),
    message,
    error: err instanceof Error ? err.message : err !== undefined ? String(err) : undefined,
    stack: err instanceof Error ? err.stack : undefined,
  };

  fs.appendFileSync(fileForDate(new Date()), `${JSON.stringify(entry)}\n`, 'utf8');
}

/**
 * Read recent error entries (most recent first) across the retained log
 * files, up to `limit` entries.
 */
function getRecentErrors(limit = 100) {
  if (!fs.existsSync(ERROR_LOG_DIR)) return [];

  const files = fs
    .readdirSync(ERROR_LOG_DIR)
    .filter((f) => /^errors-\d{4}-\d{2}-\d{2}\.log$/.test(f))
    .sort()
    .reverse(); // newest date first

  const entries = [];
  for (const file of files) {
    const lines = fs
      .readFileSync(path.join(ERROR_LOG_DIR, file), 'utf8')
      .split('\n')
      .filter(Boolean)
      .reverse(); // newest line first within the file

    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
      if (entries.length >= limit) break;
    }
    if (entries.length >= limit) break;
  }

  return entries;
}

/** Delete error log files older than RETENTION_DAYS. Safe to call often. */
function cleanupOldLogs() {
  if (!fs.existsSync(ERROR_LOG_DIR)) return;

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  for (const file of fs.readdirSync(ERROR_LOG_DIR)) {
    const match = file.match(/^errors-(\d{4}-\d{2}-\d{2})\.log$/);
    if (!match) continue;

    const fileDate = new Date(`${match[1]}T00:00:00.000Z`).getTime();
    if (fileDate < cutoff) {
      fs.unlinkSync(path.join(ERROR_LOG_DIR, file));
    }
  }
}

module.exports = { logErrorToFile, getRecentErrors, cleanupOldLogs, ERROR_LOG_DIR };
