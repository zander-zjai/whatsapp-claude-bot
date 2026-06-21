'use strict';
// no-op: deliberate redeploy to verify price-list/settings persistence (2026-06-21)

const fs = require('fs');
const path = require('path');

// All persistent JSON data (clients.json, logs.json, settings.json) lives
// under DATA_DIR. Defaults to the backend project root for local dev.
// In production (Railway), set DATA_DIR to a mounted volume path (e.g.
// "/data") so client/log/settings data survives redeploys.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function dataPath(filename) {
  return path.join(DATA_DIR, filename);
}

/**
 * Read + parse a JSON file from DATA_DIR. If it doesn't exist yet, it is
 * created with `defaultData` so a fresh deploy (empty volume) boots cleanly.
 */
function readJSON(filename, defaultData) {
  const filePath = dataPath(filename);

  if (!fs.existsSync(filePath)) {
    writeJSON(filename, defaultData);
    return defaultData;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Write JSON to DATA_DIR atomically: write to a temp file then rename.
 * Renames are atomic on the same filesystem, so a crash mid-write can
 * never leave clients.json/logs.json/settings.json truncated or corrupted.
 */
function writeJSON(filename, data) {
  const filePath = dataPath(filename);
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

module.exports = { DATA_DIR, dataPath, readJSON, writeJSON };
