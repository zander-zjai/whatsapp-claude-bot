'use strict';

const axios = require('axios');
const FormData = require('form-data');
const { log } = require('./logger');

const GRAPH_API_VERSION = 'v18.0';

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

  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${client.whatsapp_token}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

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

  const response = await axios.post(url, form, {
    headers: {
      Authorization: `Bearer ${client.whatsapp_token}`,
      ...form.getHeaders(),
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 30000,
  });

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

  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${client.whatsapp_token}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  log(`[${client.name}] Outgoing document -> ${to}: "${filename}"`);
  return response.data;
}

module.exports = { sendWhatsAppMessage, sendWhatsAppDocument };
