'use strict';

const { readJSON, writeJSON } = require('./fileStore');

const FILE = 'callback-done.json';

let done = new Set();

function load() {
  const parsed = readJSON(FILE, { done: [] });
  done = new Set(Array.isArray(parsed.done) ? parsed.done : []);
}

function persist() {
  writeJSON(FILE, { done: [...done] });
}

function markDone(callId) {
  done.add(String(callId));
  persist();
}

function isDone(callId) {
  return done.has(String(callId));
}

module.exports = { load, markDone, isDone };
