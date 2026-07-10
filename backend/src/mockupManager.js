'use strict';

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./fileStore');

const MOCKUPS_FILE = 'mockups.json';
const MAX_MOCKUPS = 2000;

let mockups = [];

function load() {
  const parsed = readJSON(MOCKUPS_FILE, { mockups: [] });
  mockups = Array.isArray(parsed.mockups) ? parsed.mockups : [];
  return mockups;
}

function persist() {
  writeJSON(MOCKUPS_FILE, { mockups });
}

function addMockup(entry) {
  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    status: 'pending',
    created_at: now,
    updated_at: now,
    ...entry,
  };
  mockups.push(record);
  if (mockups.length > MAX_MOCKUPS) {
    mockups = mockups.slice(-MAX_MOCKUPS);
  }
  persist();
  return record;
}

function getMockupsForClient(clientId) {
  return mockups
    .filter((m) => m.client_id === clientId)
    .slice()
    .reverse();
}

function getMockupById(id) {
  return mockups.find((m) => m.id === id);
}

function setMockupStatus(id, status) {
  const mockup = getMockupById(id);
  if (!mockup) return undefined;
  mockup.status = status;
  mockup.updated_at = new Date().toISOString();
  persist();
  return mockup;
}

module.exports = {
  load,
  addMockup,
  getMockupsForClient,
  getMockupById,
  setMockupStatus,
  persist,
};