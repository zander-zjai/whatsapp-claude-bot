/** Mask a phone number, keeping the country code + first couple digits and the last 2 digits. */
export function maskPhoneNumber(number) {
  if (!number) return '';
  const cleaned = String(number).replace(/\s+/g, '');
  if (cleaned.length <= 6) return cleaned;
  const start = cleaned.slice(0, 5);
  const end = cleaned.slice(-2);
  return `${start}***${end}`;
}

/** Truncate text to `length` chars, appending an ellipsis if cut. */
export function truncate(text, length = 50) {
  if (!text) return '';
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

/** Format an ISO timestamp as a locale date+time string. */
export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

/** Format an ISO timestamp as a locale date string. */
export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

/** Build a wa.me deep link that opens a chat with this number on the owner's own WhatsApp. */
export function whatsappDeepLink(number) {
  if (!number) return null;
  const digitsOnly = String(number).replace(/[^\d]/g, '');
  if (!digitsOnly) return null;
  return `https://wa.me/${digitsOnly}`;
}
