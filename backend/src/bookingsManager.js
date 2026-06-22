'use strict';

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./fileStore');

const BOOKINGS_FILE = 'bookings.json';

// Hard cap so bookings.json doesn't grow forever. Oldest entries are dropped.
const MAX_BOOKINGS = 1000;

let bookings = [];

/** Load bookings.json into memory, creating an empty file if missing. */
function load() {
  const parsed = readJSON(BOOKINGS_FILE, { bookings: [] });
  bookings = Array.isArray(parsed.bookings) ? parsed.bookings : [];
  return bookings;
}

function persist() {
  writeJSON(BOOKINGS_FILE, { bookings });
}

/**
 * Store a newly-created calendar booking. Starts unassigned — Robin (or
 * another owner) assigns a team member afterward via #assign.
 *
 * @param {object} entry
 * @param {string} entry.client_id
 * @param {string} entry.client_name
 * @param {string} entry.customer_number
 * @param {string} entry.name
 * @param {string} entry.contact_number
 * @param {string} entry.date
 * @param {string} entry.time
 * @param {string} entry.calendar_event_id
 */
function addBooking(entry) {
  const record = {
    id: crypto.randomUUID(),
    status: 'unassigned',
    assigned_to: null,
    created_at: new Date().toISOString(),
    ...entry,
  };

  bookings.push(record);

  if (bookings.length > MAX_BOOKINGS) {
    bookings = bookings.slice(-MAX_BOOKINGS);
  }

  persist();
  return record;
}

/** Find a single booking by id, or undefined if it doesn't exist. */
function getBookingById(id) {
  return bookings.find((b) => b.id === id);
}

/** Bookings for a single client, most-recent-first. */
function getBookingsForClient(clientId, { limit = 100 } = {}) {
  return bookings
    .filter((b) => b.client_id === clientId)
    .slice()
    .reverse()
    .slice(0, limit);
}

/** Assign a team member to a booking. Returns the updated record, or undefined if no match. */
function assignBooking(id, teamMemberName) {
  const booking = getBookingById(id);
  if (!booking) return undefined;
  booking.status = 'assigned';
  booking.assigned_to = teamMemberName;
  booking.updated_at = new Date().toISOString();
  persist();
  return booking;
}

module.exports = {
  load,
  addBooking,
  getBookingById,
  getBookingsForClient,
  assignBooking,
};
