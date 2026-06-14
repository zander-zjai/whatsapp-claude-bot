'use strict';

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Current { day (0=Sun..6=Sat), hour, minute } in the given IANA timezone. */
function getNowParts(timezone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'UTC',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = {};
  for (const part of formatter.formatToParts(new Date())) {
    parts[part.type] = part.value;
  }

  return {
    day: WEEKDAY_INDEX[parts.weekday],
    hour: Number(parts.hour) % 24, // midnight can render as "24" with hour12: false
    minute: Number(parts.minute),
  };
}

function parseTimeToMinutes(time) {
  const [hours, minutes] = String(time || '0:0').split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

/**
 * Returns true if `client` is currently within its configured business
 * hours. Clients without business_hours.enabled are always "open" (no
 * restriction applied).
 */
function isWithinBusinessHours(client) {
  const bh = client && client.business_hours;
  if (!bh || !bh.enabled) return true;

  const { day, hour, minute } = getNowParts(bh.timezone);
  if (!Array.isArray(bh.days) || !bh.days.includes(day)) return false;

  const nowMinutes = hour * 60 + minute;
  const openMinutes = parseTimeToMinutes(bh.open);
  const closeMinutes = parseTimeToMinutes(bh.close);

  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

/** Compress a list of weekday indices into ranges, e.g. [1,2,3,4,5] -> "Mon-Fri". */
function formatDayRanges(days) {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';

  const ranges = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i <= sorted.length; i++) {
    const day = sorted[i];
    if (day === end + 1) {
      end = day;
      continue;
    }
    ranges.push(start === end ? WEEKDAY_SHORT[start] : `${WEEKDAY_SHORT[start]}-${WEEKDAY_SHORT[end]}`);
    start = day;
    end = day;
  }

  return ranges.join(', ');
}

/** Human-readable summary of business hours, e.g. "Mon-Fri 08:00-17:00". */
function formatHoursSummary(businessHours) {
  if (!businessHours) return '';
  const days = formatDayRanges(businessHours.days || []);
  if (!days || !businessHours.open || !businessHours.close) return '';
  return `${days} ${businessHours.open}-${businessHours.close}`;
}

/** The auto-reply sent to customers who message outside business hours. */
function getClosedMessage(client) {
  const bh = (client && client.business_hours) || {};
  const summary = formatHoursSummary(bh);
  return `We are closed, our hours are ${summary || 'limited'}. We will get back to you tomorrow.`;
}

module.exports = { isWithinBusinessHours, getClosedMessage, formatHoursSummary };
