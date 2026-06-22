'use strict';

const { google } = require('googleapis');

// Same googleapis-wrapping logic as zjai-vapi-webhook/lib/googleCalendarClient.js
// — ported here verbatim rather than shared via import, since this is a
// separate deployed service. Keep both in sync if the contract ever changes.

const TIMEZONE = 'Africa/Johannesburg';

// Cached per refresh_token so repeated calls in the same process don't
// rebuild the OAuth2 client each time.
const authClientsByToken = new Map();

function getAuthClient({ clientId, clientSecret, refreshToken }) {
  if (!authClientsByToken.has(refreshToken)) {
    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    authClientsByToken.set(refreshToken, auth);
  }
  return authClientsByToken.get(refreshToken);
}

/**
 * Query Google Calendar freebusy for the given window.
 * @returns {Promise<{ busy: boolean }>}
 */
async function checkAvailability({ clientId, clientSecret, refreshToken, calendarId, startISO, endISO }) {
  const auth = getAuthClient({ clientId, clientSecret, refreshToken });
  const calendar = google.calendar({ version: 'v3', auth });

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: startISO,
      timeMax: endISO,
      items: [{ id: calendarId }],
    },
  });

  const busyPeriods = response.data.calendars?.[calendarId]?.busy || [];
  return { busy: busyPeriods.length > 0 };
}

/**
 * Create a calendar event.
 * @returns {Promise<{ id: string, htmlLink: string }>}
 */
async function createEvent({ clientId, clientSecret, refreshToken, calendarId, summary, description, startISO, endISO, timeZone }) {
  const auth = getAuthClient({ clientId, clientSecret, refreshToken });
  const calendar = google.calendar({ version: 'v3', auth });

  const response = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary,
      description,
      start: { dateTime: startISO, timeZone: timeZone || TIMEZONE },
      end: { dateTime: endISO, timeZone: timeZone || TIMEZONE },
    },
  });

  return { id: response.data.id, htmlLink: response.data.htmlLink };
}

/**
 * Patch an existing event's color and/or description — used to mark a
 * booking "assigned" to a team member after the fact (colorId is a Google
 * Calendar event color, '1'-'11').
 */
async function updateEvent({ clientId, clientSecret, refreshToken, calendarId, eventId, colorId, description }) {
  const auth = getAuthClient({ clientId, clientSecret, refreshToken });
  const calendar = google.calendar({ version: 'v3', auth });

  const requestBody = {};
  if (colorId !== undefined) requestBody.colorId = colorId;
  if (description !== undefined) requestBody.description = description;

  const response = await calendar.events.patch({ calendarId, eventId, requestBody });
  return { id: response.data.id, htmlLink: response.data.htmlLink };
}

module.exports = { checkAvailability, createEvent, updateEvent, TIMEZONE };
