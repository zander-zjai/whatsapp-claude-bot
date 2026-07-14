'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dataPath } = require('./fileStore');

// sharp is a native module; load it lazily so a load/binary problem can only
// affect mockup compositing, never crash the whole server at boot.
let _sharp = null;
function sharp(...args) {
  if (!_sharp) _sharp = require('sharp');
  return _sharp(...args);
}

/**
 * Composites a customer's logo (or generated text) onto a reference signage
 * photo at an admin-configured "logo zone", producing an accurate, instant
 * mockup. This replaces AI image generation for flat signage.
 *
 * Coordinate model: the logo zone is stored as FRACTIONS (0..1) of the
 * reference image's natural dimensions, so it's independent of how big the
 * image was displayed when the admin positioned it. Revisions nudge the logo
 * with `offset` (fractional dx/dy) and resize it with `scale`.
 */

const DEFAULT_ZONE = { x: 0.25, y: 0.38, width: 0.5, height: 0.24 };

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build an SVG rendering the given text centred in a box of zoneW×zoneH,
 * auto-sizing the font so it fits. Used when the customer gave sign text but
 * no logo image.
 */
function buildTextSvg(text, zoneW, zoneH, color) {
  const clean = escapeXml(text).slice(0, 60);
  // Rough fit: font height ~70% of zone height, but shrink if the line is long.
  const byHeight = zoneH * 0.7;
  const byWidth = (zoneW * 1.7) / Math.max(clean.length, 1); // ~0.6 aspect per glyph
  const fontSize = Math.max(12, Math.min(byHeight, byWidth));
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${zoneW}" height="${zoneH}">
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="700"
        font-size="${fontSize}" fill="${color}">${clean}</text>
    </svg>`
  );
}

/**
 * Composite a logo/text onto a reference image.
 * @param {object} opts
 * @param {string} opts.referencePath  absolute path to the reference PNG/JPG
 * @param {Buffer} [opts.logoBuffer]   the customer's logo image bytes
 * @param {string} [opts.text]         fallback text if there is no logo
 * @param {object} opts.zone           { x, y, width, height } fractions 0..1
 * @param {object} [opts.offset]       { x, y } fractional nudge (revisions)
 * @param {number} [opts.scale]        multiplier on the logo size (revisions)
 * @returns {Promise<Buffer>} composited PNG bytes
 */
async function composite({ referencePath, logoBuffer = null, text = '', zone, offset = { x: 0, y: 0 }, scale = 1 }) {
  const z = zone || DEFAULT_ZONE;
  const base = sharp(referencePath);
  const meta = await base.metadata();
  const W = meta.width;
  const H = meta.height;

  // Zone in absolute px, scaled around its centre.
  const zoneW0 = z.width * W;
  const zoneH0 = z.height * H;
  const zoneW = clamp(zoneW0 * scale, 8, W);
  const zoneH = clamp(zoneH0 * scale, 8, H);
  const centreX = (z.x + z.width / 2 + offset.x) * W;
  const centreY = (z.y + z.height / 2 + offset.y) * H;

  let overlay;
  if (logoBuffer) {
    // Fit the logo inside the (scaled) zone, preserving aspect ratio and
    // transparency.
    overlay = await sharp(logoBuffer)
      .resize({
        width: Math.round(zoneW),
        height: Math.round(zoneH),
        fit: 'inside',
        withoutEnlargement: false,
      })
      .png()
      .toBuffer();
  } else {
    overlay = await sharp(buildTextSvg(text, Math.round(zoneW), Math.round(zoneH), '#111111'))
      .png()
      .toBuffer();
  }

  const ovMeta = await sharp(overlay).metadata();
  const left = Math.round(clamp(centreX - ovMeta.width / 2, 0, W - ovMeta.width));
  const top = Math.round(clamp(centreY - ovMeta.height / 2, 0, H - ovMeta.height));

  return base
    .composite([{ input: overlay, left, top }])
    .png()
    .toBuffer();
}

/** Persist composited PNG bytes to the mockups data dir; returns the path. */
function saveMockupImage(clientId, buffer) {
  const dir = dataPath(path.join('mockups', clientId));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${crypto.randomUUID()}.png`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

module.exports = { composite, saveMockupImage, DEFAULT_ZONE };
