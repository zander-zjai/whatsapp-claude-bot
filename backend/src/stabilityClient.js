'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const { dataPath } = require('./fileStore');

const CORE_URL = 'https://api.stability.ai/v2beta/stable-image/generate/core';
const SD3_URL = 'https://api.stability.ai/v2beta/stable-image/generate/sd3';

/**
 * Generate a sign image via Stability AI.
 * Text-to-image uses the core endpoint. When a reference image is provided
 * (customer logo or a previous mockup version), the SD3 image-to-image
 * endpoint is used instead — core does not accept image/strength params.
 *
 * @returns {Buffer} PNG bytes
 */
async function generateSignImage({ prompt, referenceImagePath = null, referenceMimeType = 'image/png', strength = 0.5 }) {
  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) {
    const err = new Error('STABILITY_API_KEY not configured');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }

  const form = new FormData();
  form.append('prompt', prompt);
  form.append('output_format', 'png');

  let url = CORE_URL;
  if (referenceImagePath && fs.existsSync(referenceImagePath)) {
    url = SD3_URL;
    form.append('mode', 'image-to-image');
    form.append('image', fs.readFileSync(referenceImagePath), {
      filename: 'reference.png',
      contentType: referenceMimeType || 'image/png',
    });
    form.append('strength', String(strength));
  } else {
    form.append('aspect_ratio', '16:9');
  }

  const resp = await axios.post(url, form, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'image/*', ...form.getHeaders() },
    responseType: 'arraybuffer',
    timeout: 90000,
  });
  return Buffer.from(resp.data);
}

/** Persist generated PNG bytes to the mockups data dir and return the path. */
function saveMockupImage(clientId, buffer) {
  const dir = dataPath(path.join('mockups', clientId));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${crypto.randomUUID()}.png`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

module.exports = { generateSignImage, saveMockupImage };
