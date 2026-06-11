'use strict';

// Tiny timestamped logger so every line is consistent and greppable.
// Format: [2026-06-10T12:34:56.789Z] [LEVEL] message ...

function ts() {
  return new Date().toISOString();
}

function log(...args) {
  console.log(`[${ts()}] [INFO]`, ...args);
}

function logError(...args) {
  console.error(`[${ts()}] [ERROR]`, ...args);
}

module.exports = { log, logError };
