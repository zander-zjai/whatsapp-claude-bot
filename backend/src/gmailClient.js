'use strict';

const { google } = require('googleapis');
const settingsManager = require('./settingsManager');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

function getRedirectUri() {
  return `${settingsManager.getSettings().webhook_base_url}/admin/oauth/gmail/callback`;
}

function getOAuthClient() {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GMAIL_OAUTH_CLIENT_ID / GMAIL_OAUTH_CLIENT_SECRET are not set');
  }
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

/** @param {string} clientRecordId - used as the OAuth `state` param so the callback knows which client to attach the token to. */
function buildAuthUrl(clientRecordId) {
  const oauth2Client = getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: clientRecordId,
  });
}

/** Exchange an OAuth `code` for tokens, and look up the authorized Gmail address. */
async function exchangeCodeForTokens(code) {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'Google did not return a refresh token. Revoke prior access at https://myaccount.google.com/permissions and try connecting again (Google only issues a refresh token on first consent).'
    );
  }
  oauth2Client.setCredentials(tokens);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return { refreshToken: tokens.refresh_token, emailAddress: profile.data.emailAddress };
}

/** Build an authenticated Gmail API client for a stored client record. */
function gmailClientFor(client) {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: client.gmail_refresh_token });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * List unread message ids addressed to this client's monitored address.
 * `email_address` may be an alias on the OAuth-authorized account (e.g. a
 * Workspace alias), so we filter by recipient rather than trusting the
 * whole inbox belongs to this client.
 */
async function listUnreadForClient(client) {
  const gmail = gmailClientFor(client);
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: `to:${client.email_address} is:unread in:inbox`,
    maxResults: 10,
  });
  return res.data.messages || [];
}

function decodeBase64Url(data) {
  return Buffer.from(data, 'base64').toString('utf8');
}

/** Extract a plain-text body from a Gmail message payload (walks multipart/alternative for text/plain, falls back to text/html stripped of tags). */
function extractBodyText(payload) {
  if (!payload) return '';

  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (Array.isArray(payload.parts)) {
    const plainPart = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (plainPart && plainPart.body && plainPart.body.data) {
      return decodeBase64Url(plainPart.body.data);
    }
    for (const part of payload.parts) {
      const nested = extractBodyText(part);
      if (nested) return nested;
    }
  }

  if (payload.mimeType === 'text/html' && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return '';
}

function getHeader(headers, name) {
  const found = (headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found ? found.value : '';
}

/** Fetch and parse a single message into the fields the poller/Claude need. */
async function getMessage(client, messageId) {
  const gmail = gmailClientFor(client);
  const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  const headers = res.data.payload && res.data.payload.headers;

  const fromHeader = getHeader(headers, 'From');
  const fromMatch = fromHeader.match(/^(.*?)\s*<(.+)>$/);
  const fromName = fromMatch ? fromMatch[1].replace(/"/g, '').trim() || null : null;
  const fromAddress = fromMatch ? fromMatch[2] : fromHeader.trim();

  return {
    id: res.data.id,
    threadId: res.data.threadId,
    fromName,
    fromAddress,
    subject: getHeader(headers, 'Subject'),
    messageIdHeader: getHeader(headers, 'Message-ID'),
    references: getHeader(headers, 'References'),
    bodyText: extractBodyText(res.data.payload),
  };
}

function buildRawEmail({ from, to, subject, bodyText, inReplyTo, references }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  lines.push('', bodyText);

  const raw = lines.join('\r\n');
  return Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Send a reply in the same thread, From the client's monitored alias address. */
async function sendReply(client, { threadId, to, subject, bodyText, inReplyTo, references }) {
  const gmail = gmailClientFor(client);
  const raw = buildRawEmail({
    from: client.email_address,
    to,
    subject: subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`,
    bodyText,
    inReplyTo,
    references,
  });

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId },
  });
}

async function markAsRead(client, messageId) {
  const gmail = gmailClientFor(client);
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
}

module.exports = {
  buildAuthUrl,
  exchangeCodeForTokens,
  listUnreadForClient,
  getMessage,
  sendReply,
  markAsRead,
};
