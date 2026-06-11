'use strict';

const axios = require('axios');
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

module.exports = { sendWhatsAppMessage };
