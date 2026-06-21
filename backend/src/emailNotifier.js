'use strict';

const { log, logError } = require('./logger');
const errorLogger = require('./errorLogger');

let sgMail = null;
let initAttempted = false;

function getClient() {
  if (initAttempted) return sgMail;
  initAttempted = true;

  if (!process.env.SENDGRID_API_KEY) return null;
  // eslint-disable-next-line global-require
  sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  return sgMail;
}

/**
 * Email the client's owner. Independent of any WhatsApp send — failures
 * here are logged but never thrown, so a WhatsApp notification still goes
 * out even if email is unconfigured or fails, and vice versa.
 */
async function sendOwnerEmail(client, subject, text) {
  if (!client.contact_email) return;

  const mail = getClient();
  const fromEmail = process.env.EMAIL_FROM;
  if (!mail || !fromEmail) {
    log(`[${client.name}] Skipping owner email (SENDGRID_API_KEY / EMAIL_FROM not set)`);
    return;
  }

  try {
    await mail.send({ to: client.contact_email, from: fromEmail, subject, text });
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.body) : err.message;
    logError(`[${client.name}] Failed to send owner email:`, detail);
    errorLogger.logErrorToFile(`[${client.name}] Failed to send owner email: ${detail}`, err);
  }
}

module.exports = { sendOwnerEmail };
