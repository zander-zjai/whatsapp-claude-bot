'use strict';

const { readJSON, writeJSON } = require('./fileStore');

const SETTINGS_FILE = 'settings.json';

const DEFAULT_SETTINGS = {
  platform_claude_api_key: '',
  webhook_base_url: 'https://whatsapp-claude-bot-production-bed5.up.railway.app',
  client_portal_url: 'https://zjai-admin.vercel.app',
  fallback_message: "Sorry, I'm unavailable right now. Please try again shortly.",
  max_conversation_memory: 10,
  // Optional admin credential override. When null, server.js falls back to
  // ADMIN_USER / ADMIN_PASS from .env. Set via PUT /admin/settings (password
  // change form) and stored as a bcrypt hash, never plaintext.
  admin_user: null,
  admin_pass_hash: null,
};

let settings = { ...DEFAULT_SETTINGS };

/**
 * Load settings.json into memory, creating it with defaults if missing.
 * Any fields absent from the file fall back to DEFAULT_SETTINGS so new
 * settings introduced later don't break existing installs.
 */
function loadSettings() {
  const parsed = readJSON(SETTINGS_FILE, DEFAULT_SETTINGS);
  settings = { ...DEFAULT_SETTINGS, ...parsed };
  return settings;
}

/** Return the current settings object (in-memory). */
function getSettings() {
  return settings;
}

/**
 * Merge `updates` into the current settings and persist to disk.
 * Returns the updated settings object.
 */
function updateSettings(updates) {
  settings = { ...settings, ...updates };
  persist();
  return settings;
}

function persist() {
  writeJSON(SETTINGS_FILE, settings);
}

module.exports = {
  loadSettings,
  getSettings,
  updateSettings,
  DEFAULT_SETTINGS,
};
