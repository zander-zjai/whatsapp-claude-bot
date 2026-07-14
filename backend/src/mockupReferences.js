'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readJSON, writeJSON, dataPath } = require('./fileStore');
const { DEFAULT_ZONE } = require('./mockupCompositor');

/**
 * Admin-managed library of reference signage photos. Each reference belongs to
 * a category (lightbox, pvc, banner, window_vinyl, flat_cut_letters) and
 * carries a logo zone (where a customer's logo/text gets composited).
 * Managed from the ZJAI admin panel; shared across all clients.
 */

const REFERENCES_FILE = 'mockup_references.json';

const CATEGORIES = [
  { id: 'lightbox', label: 'Lightbox' },
  { id: 'pvc', label: 'PVC Sign' },
  { id: 'banner', label: 'Banner' },
  { id: 'window_vinyl', label: 'Window Vinyl' },
  { id: 'flat_cut_letters', label: 'Flat Cut Letters' },
];
const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

let references = [];

function load() {
  const parsed = readJSON(REFERENCES_FILE, { references: [] });
  references = Array.isArray(parsed.references) ? parsed.references : [];
  return references;
}

function persist() {
  writeJSON(REFERENCES_FILE, { references });
}

function list() {
  return references.slice();
}

function listByCategory(category) {
  return references.filter((r) => r.category === category);
}

function getById(id) {
  return references.find((r) => r.id === id);
}

function refDir() {
  const dir = dataPath('references');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Add a reference image. `buffer` is the raw image bytes (decoded from the
 * base64 the admin uploaded). Stored as-is on the data volume.
 */
function add({ category, name, buffer, mimeType }) {
  if (!CATEGORY_IDS.includes(category)) {
    const err = new Error(`Unknown category: ${category}`);
    err.statusCode = 400;
    throw err;
  }
  const id = crypto.randomUUID();
  const ext = (mimeType && mimeType.includes('jpeg')) ? 'jpg' : 'png';
  const filePath = path.join(refDir(), `${id}.${ext}`);
  fs.writeFileSync(filePath, buffer);

  const record = {
    id,
    category,
    name: name || 'Untitled reference',
    image_path: filePath,
    mime_type: mimeType || 'image/png',
    logo_zone: { ...DEFAULT_ZONE },
    created_at: new Date().toISOString(),
  };
  references.push(record);
  persist();
  return record;
}

function update(id, { name, logo_zone: logoZone }) {
  const ref = getById(id);
  if (!ref) return undefined;
  if (typeof name === 'string' && name.trim()) ref.name = name.trim();
  if (logoZone && typeof logoZone === 'object') {
    const { x, y, width, height } = logoZone;
    ref.logo_zone = {
      x: Math.max(0, Math.min(1, Number(x))),
      y: Math.max(0, Math.min(1, Number(y))),
      width: Math.max(0.02, Math.min(1, Number(width))),
      height: Math.max(0.02, Math.min(1, Number(height))),
    };
  }
  persist();
  return ref;
}

function remove(id) {
  const ref = getById(id);
  if (!ref) return false;
  try { if (ref.image_path && fs.existsSync(ref.image_path)) fs.unlinkSync(ref.image_path); } catch { /* ignore */ }
  references = references.filter((r) => r.id !== id);
  persist();
  return true;
}

/**
 * Pick the best reference for a category. For now: the most recently added
 * one (admins add the preferred image last). Returns undefined if the
 * category has no references yet.
 */
function pickBest(category) {
  const inCat = listByCategory(category);
  if (inCat.length === 0) return undefined;
  return inCat.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
}

module.exports = {
  load, list, listByCategory, getById, add, update, remove, pickBest,
  CATEGORIES, CATEGORY_IDS,
};
