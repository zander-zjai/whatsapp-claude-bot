'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { readJSON, writeJSON, dataPath } = require('./fileStore');
const { logError } = require('./logger');

const ATTACHMENTS_FILE = 'attachments.json';
const MEDIA_DIR = 'media';
const GRAPH_API_VERSION = 'v18.0';

// Hard cap so attachments.json doesn't grow forever. Oldest entries are dropped
// (the files themselves are left on disk — same no-cleanup tradeoff as quote PDFs).
const MAX_ATTACHMENTS = 2000;

let attachments = [];

/** Load attachments.json into memory, creating an empty file if missing. */
function load() {
  const parsed = readJSON(ATTACHMENTS_FILE, { attachments: [] });
  attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
  return attachments;
}

function persist() {
  writeJSON(ATTACHMENTS_FILE, { attachments });
}

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

function extensionForMime(mimeType) {
  return EXT_BY_MIME[mimeType] || 'bin';
}

/**
 * Download a WhatsApp media object (two-step Graph API fetch: resolve the
 * media id to a short-lived URL, then fetch the bytes) and save it under
 * dataPath('media/<client_id>/<uuid>.<ext>'). WhatsApp's media URLs expire
 * within minutes, so this must be called immediately on message receipt —
 * never lazily later.
 *
 * @returns {Promise<{ filePath: string, mimeType: string }>}
 */
async function downloadAndStoreMedia(client, mediaId, mimeType) {
  const metaRes = await axios.get(`https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${client.whatsapp_token}` },
    timeout: 15000,
  });

  const mediaUrl = metaRes.data.url;
  const resolvedMimeType = metaRes.data.mime_type || mimeType;

  const fileRes = await axios.get(mediaUrl, {
    headers: { Authorization: `Bearer ${client.whatsapp_token}` },
    responseType: 'arraybuffer',
    timeout: 30000,
  });

  const dir = dataPath(path.join(MEDIA_DIR, client.id));
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${crypto.randomUUID()}.${extensionForMime(resolvedMimeType)}`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, fileRes.data);

  return { filePath, mimeType: resolvedMimeType };
}

/**
 * Record metadata for a downloaded attachment.
 *
 * @param {object} entry
 * @param {string} entry.client_id
 * @param {string} entry.customer_number
 * @param {string} entry.file_path - Absolute path returned by downloadAndStoreMedia.
 * @param {string} entry.mime_type
 * @param {string} [entry.caption]
 */
function recordAttachment(entry) {
  const record = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    caption: '',
    ...entry,
  };

  attachments.push(record);

  if (attachments.length > MAX_ATTACHMENTS) {
    attachments = attachments.slice(-MAX_ATTACHMENTS);
  }

  persist();
  return record;
}

/**
 * Attachments from a specific customer within [sinceISO, untilISO] —
 * the window used to associate media with a specific quote, since
 * attachments aren't otherwise linked to any one quote/conversation.
 */
function getAttachmentsForCustomerInWindow(clientId, customerNumber, sinceISO, untilISO) {
  const since = new Date(sinceISO).getTime();
  const until = new Date(untilISO).getTime();

  return attachments.filter((a) => {
    if (a.client_id !== clientId || a.customer_number !== customerNumber) return false;
    const t = new Date(a.created_at).getTime();
    return t >= since && t <= until;
  });
}

/** Find a single attachment by id, or undefined if it doesn't exist. */
function getAttachmentById(id) {
  return attachments.find((a) => a.id === id);
}

/** Download a media object and record its metadata in one call. Logs and re-throws on failure. */
async function captureInboundMedia(client, { customerNumber, mediaId, mimeType, caption }) {
  try {
    const { filePath, mimeType: resolvedMimeType } = await downloadAndStoreMedia(client, mediaId, mimeType);
    return recordAttachment({
      client_id: client.id,
      customer_number: customerNumber,
      file_path: filePath,
      mime_type: resolvedMimeType,
      caption: caption || '',
    });
  } catch (err) {
    logError(`[${client.name}] Failed to capture inbound media:`, err.message);
    throw err;
  }
}

module.exports = {
  load,
  captureInboundMedia,
  getAttachmentsForCustomerInWindow,
  getAttachmentById,
};
