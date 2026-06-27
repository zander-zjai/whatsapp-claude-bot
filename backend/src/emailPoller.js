'use strict';

const clientManager = require('./clientManager');
const gmailClient = require('./gmailClient');
const { generateEmailReply } = require('./emailReply');
const { log, logError } = require('./logger');

const POLL_INTERVAL_MS = 2 * 60 * 1000;

let polling = false;

/** Process all unread mail for one client: generate + send a Claude reply, then mark read. */
async function processClient(client) {
  const unread = await gmailClient.listUnreadForClient(client);
  log(`[${client.name}] Email poll: ${unread.length} unread message(s) for ${client.email_address}`);
  if (unread.length === 0) return 0;

  let handled = 0;
  for (const { id } of unread) {
    try {
      const message = await gmailClient.getMessage(client, id);

      const replyText = await generateEmailReply(client, {
        fromName: message.fromName,
        subject: message.subject,
        bodyText: message.bodyText,
      });

      await gmailClient.sendReply(client, {
        threadId: message.threadId,
        to: message.fromAddress,
        subject: message.subject,
        bodyText: replyText,
        inReplyTo: message.messageIdHeader,
        references: message.references || message.messageIdHeader,
      });

      await gmailClient.markAsRead(client, id);
      handled += 1;
      log(`[${client.name}] Replied to email from ${message.fromAddress} (subject: "${message.subject}")`);
    } catch (err) {
      logError(`[${client.name}] Failed to process email ${id}:`, err.message);
    }
  }
  return handled;
}

/** Run one poll cycle across every client with email receptionist enabled. One client's failure never blocks the rest. */
async function pollAllClients() {
  const clients = clientManager
    .getActiveClients()
    .filter((c) => c.email_receptionist_enabled && c.gmail_refresh_token && c.email_address);

  const results = {};
  for (const client of clients) {
    try {
      results[client.id] = await processClient(client);
    } catch (err) {
      logError(`[${client.name}] Email poll failed:`, err.message);
      results[client.id] = 0;
    }
  }
  return results;
}

function startEmailPolling() {
  if (polling) return;
  polling = true;
  log(`Email polling started (every ${POLL_INTERVAL_MS / 1000}s)`);
  setInterval(() => {
    pollAllClients().catch((err) => logError('Email poll cycle failed:', err.message));
  }, POLL_INTERVAL_MS);
}

module.exports = { startEmailPolling, pollAllClients };
