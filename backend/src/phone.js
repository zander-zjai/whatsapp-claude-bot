'use strict';

/**
 * Mask a phone number for logs/console output, keeping the first 5 and
 * last 2 digits (e.g. "+27821234567" -> "+2782***67").
 */
function maskPhone(number) {
  if (!number) return '';
  const cleaned = String(number).replace(/\s+/g, '');
  if (cleaned.length <= 6) return cleaned;
  return `${cleaned.slice(0, 5)}***${cleaned.slice(-2)}`;
}

module.exports = { maskPhone };
