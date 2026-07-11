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
    revision_count: 0,
    versions: [],
    created_at: now,
    updated_at: now,
    ...entry,
  };
  // Snapshot the initial version
  if (record.image_path || record.description) {
    record.versions = [
      {
        version: 1,
        image_path: record.image_path || null,
        description: record.description || '',
        revision_instructions: null,
        created_at: now,
      },
    ];
  }
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

/**
 * Apply a revision: archive the current image into versions[], update the
 * active image_path and description, and increment revision_count.
 */
function applyRevision(id, { newImagePath, newDescription, revisionInstructions }) {
  const mockup = getMockupById(id);
  if (!mockup) return undefined;

  const now = new Date().toISOString();
  const nextVersion = (mockup.versions || []).length + 1;

  if (!Array.isArray(mockup.versions)) mockup.versions = [];

  mockup.versions.push({
    version: nextVersion,
    image_path: newImagePath || null,
    description: newDescription || mockup.description,
    revision_instructions: revisionInstructions || null,
    created_at: now,
  });

  mockup.image_path = newImagePath || mockup.image_path;
  mockup.description = newDescription || mockup.description;
  mockup.revision_count = (mockup.revision_count || 0) + 1;
  mockup.updated_at = now;

  persist();
  return mockup;
}

module.exports = {
  load,
  addMockup,
  getMockupsForClient,
  getMockupById,
  setMockupStatus,
  applyRevision,
  persist,
};
