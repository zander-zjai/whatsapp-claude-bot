'use strict';

/**
 * Classify a signage description into one of the supported categories and
 * decide whether it can be composited instantly (flat signage) or must be
 * deferred to a manual design task (fabricated letters, or anything we can't
 * confidently place on a reference image).
 *
 * Keyword matching is deliberately simple and deterministic — it runs on the
 * quote's item_description + material text, which Zara collects verbatim.
 */

// Checked in priority order — the first category whose keywords appear wins.
// Fabricated is checked before flat_cut so "fabricated letters" doesn't get
// mis-classified as flat letters.
const CATEGORY_KEYWORDS = [
  ['fabricated_letters', [
    'fabricated', 'channel letter', '3d letter', 'three dimensional letter',
    'built-up', 'built up', 'box letter', 'metal letter', 'stainless letter',
    'chrome letter', 'illuminated letter', 'halo lit', 'halo-lit',
  ]],
  ['window_vinyl', [
    'window vinyl', 'window graphic', 'window decal', 'window sticker',
    'frosted vinyl', 'frosted glass', 'window signage', 'cut vinyl on glass',
  ]],
  ['flat_cut_letters', [
    'flat cut', 'flat-cut', 'cut letter', 'flat letter', 'acrylic letter',
    'perspex letter', 'laser cut letter', 'flat cut letters',
  ]],
  ['lightbox', [
    'lightbox', 'light box', 'light-box', 'illuminated box', 'led box',
  ]],
  ['pvc', [
    'pvc', 'foamex', 'forex', 'foam board', 'rigid sign', 'flat panel sign',
    'composite panel', 'chromadek', 'aluminium sign board',
  ]],
  ['banner', [
    'banner', 'pull-up', 'pullup', 'pull up', 'roll-up', 'rollup',
    'vinyl banner', 'pvc banner', 'mesh banner',
  ]],
];

const FLAT_CATEGORIES = ['lightbox', 'pvc', 'banner', 'window_vinyl', 'flat_cut_letters'];

/**
 * @returns {{ category: string|null, deferred: boolean, reason: string }}
 *   category  — one of the keys above, or null if nothing matched
 *   deferred  — true when it needs a manual mockup (fabricated / unknown)
 */
function classify(text) {
  const lower = String(text || '').toLowerCase();

  let matched = null;
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) {
      matched = category;
      break;
    }
  }

  if (matched === 'fabricated_letters') {
    return { category: 'fabricated_letters', deferred: true, reason: 'fabricated' };
  }
  if (matched && FLAT_CATEGORIES.includes(matched)) {
    return { category: matched, deferred: false, reason: 'flat' };
  }
  // Nothing recognised — safer to defer than to composite onto a wrong reference.
  return { category: null, deferred: true, reason: 'unknown' };
}

function isFlat(category) {
  return FLAT_CATEGORIES.includes(category);
}

module.exports = { classify, isFlat, FLAT_CATEGORIES, CATEGORY_KEYWORDS };
