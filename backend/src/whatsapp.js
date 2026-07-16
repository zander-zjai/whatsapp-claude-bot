'use strict';

const axios = require('axios');
const FormData = require('form-data');
const { log } = require('./logger');

const GRAPH_API_VERSION = 'v18.0';

// Transient network faults that are worth retrying. A single ECONNRESET on
// Meta's API used to silently drop a customer reply entirely.
const RETRYABLE_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'EPIPE', 'ENOTFOUND', 'ECONNREFUSED',
]);

function isRetryable(err) {
  if (err.code && RETRYABLE_CODES.has(err.code)) return true;
  if (err.message && /socket hang up|network error|timeout/i.test(err.message)) return true;
  const status = err.response && err.response.status;
  // 429/5xx are transient; 4xx (bad token, malformed number) never are —
  // retrying those just delays the failure.
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Run a Graph API call, retrying transient network/5xx failures with
 * exponential backoff. Non-transient errors (4xx) throw immediately.
 */
async function withRetry(fn, label, attempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === attempts || !isRetryable(err)) throw err;
      const delayMs = 600 * 2 ** (attempt - 1); // 600ms, 1.2s
      const reason = err.code || (err.response && err.response.status) || err.message;
      log(`[whatsapp] ${label} failed (${reason}) — retrying in ${delayMs}ms (attempt ${attempt + 1}/${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

/**
 * Send a plain text WhatsApp message via the WhatsApp Business Cloud API.
 *
 * @param {object} client - Matched client config (phone_number_id, whatsapp_token, name).
 * @param {string} to     - Recipient WhatsApp number (the customer's number).
 * @param {string} text   - Message body to send.
 * @returns {Promise<object>} The Graph API response data.
 */
async function sendWhatsAppMessage(client, to, text) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${client.phone_number_id}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text },
  };

  const response = await withRetry(
    () => axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${client.whatsapp_token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }),
    'send text reply'
  );

  log(`[${client.name}] Outgoing reply -> ${to}: "${text}"`);
  return response.data;
}

/**
 * Upload a file to the WhatsApp Cloud API media endpoint.
 *
 * @param {object} client - Matched client config (phone_number_id, whatsapp_token).
 * @param {Buffer} buffer - File contents.
 * @param {string} filename - Filename to upload as.
 * @returns {Promise<string>} The uploaded media id.
 */
async function uploadMedia(client, buffer, filename) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${client.phone_number_id}/media`;

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', buffer, { filename, contentType: 'application/pdf' });

  const response = await withRetry(
    () => axios.post(url, form, {
      headers: {
        Authorization: `Bearer ${client.whatsapp_token}`,
        ...form.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 30000,
    }),
    'upload document media'
  );

  return response.data.id;
}

/**
 * Send a document (e.g. a PDF quote) to a customer via the WhatsApp Cloud API.
 *
 * @param {object} client - Matched client config (phone_number_id, whatsapp_token, name).
 * @param {string} to - Recipient WhatsApp number.
 * @param {Buffer} buffer - Document contents (PDF).
 * @param {string} filename - Filename shown to the recipient.
 * @param {string} caption - Caption text shown with the document.
 * @returns {Promise<object>} The Graph API response data.
 */
async function sendWhatsAppDocument(client, to, buffer, filename, caption) {
  const mediaId = await uploadMedia(client, buffer, filename);
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${client.phone_number_id}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'document',
    document: { id: mediaId, filename, caption },
  };

  const response = await withRetry(
    () => axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${client.whatsapp_token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }),
    'send document'
  );

  log(`[${client.name}] Outgoing document -> ${to}: "${filename}"`);
  return response.data;
}

/**
 * Upload an image buffer to the WhatsApp Cloud API media endpoint.
 *
 * @param {object} client - Matched client config (phone_number_id, whatsapp_token).
 * @param {Buffer} buffer - Image file contents.
 * @param {string} filename - Filename to upload as.
 * @returns {Promise<string>} The uploaded media id.
 */
async function uploadImageMedia(client, buffer, filename) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${client.phone_number_id}/media`;

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', buffer, { filename, contentType: 'image/png' });

  const response = await withRetry(
    () => axios.post(url, form, {
      headers: {
        Authorization: `Bearer ${client.whatsapp_token}`,
        ...form.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 30000,
    }),
    'upload image media'
  );

  return response.data.id;
}

/**
 * Send an image to a customer via the WhatsApp Cloud API.
 *
 * @param {object} client - Matched client config (phone_number_id, whatsapp_token, name).
 * @param {string} to - Recipient WhatsApp number.
 * @param {Buffer} buffer - Image file contents (PNG).
 * @param {string} filename - Filename.
 * @param {string} caption - Caption text shown with the image.
 * @returns {Promise<object>} The Graph API response data.
 */
async function sendWhatsAppImage(client, to, buffer, filename, caption) {
  const mediaId = await uploadImageMedia(client, buffer, filename);
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${client.phone_number_id}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'image',
    image: { id: mediaId, caption },
  };

  const response = await withRetry(
    () => axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${client.whatsapp_token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }),
    'send image'
  );

  log(`[${client.name}] Outgoing image -> ${to}: "${filename}"`);
  return response.data;
}

module.exports = { sendWhatsAppMessage, sendWhatsAppDocument, sendWhatsAppImage };

