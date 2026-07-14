'use strict';

const crypto = require('crypto');
const { log, logError } = require('./logger');
const errorLogger = require('./errorLogger');
const clientManager = require('./clientManager');
const memory = require('./memory');
const { getClaudeReply } = require('./claude');
const { sendWhatsAppMessage, sendWhatsAppImage } = require('./whatsapp');
const settingsManager = require('./settingsManager');
const logsManager = require('./logsManager');
const { maskPhone, normalizeNumber } = require('./phone');
const conversationManager = require('./conversationManager');
const quoteManager = require('./quoteManager');
const quoteActions = require('./quoteActions');
const bookingManager = require('./bookingManager');
const bookingsManager = require('./bookingsManager');
const googleCalendarClient = require('./googleCalendarClient');
const mediaManager = require('./mediaManager');
const leadTagger = require('./leadTagger');
const pdfGenerator = require('./pdfGenerator');
const businessHours = require('./businessHours');
const handover = require('./handover');
const emailNotifier = require('./emailNotifier');
const mockupManager = require('./mockupManager');
const fs = require('fs');
const path = require('path');
const { dataPath } = require('./fileStore');

const URGENT_REPLY = 'Let me connect you with someone.';

/**
 * GET /webhook
 * Meta's verification handshake. Meta sends hub.mode, hub.verify_token and
 * hub.challenge. If the token matches our VERIFY_TOKEN, echo the challenge.
 */
function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    log('Webhook verified successfully by Meta');
    return res.status(200).send(challenge);
  }

  logError('Webhook verification failed (bad mode or verify token)');
  return res.sendStatus(403);
}

/**
 * Express middleware: verifies the `X-Hub-Signature-256` header Meta sends
 * on every webhook POST, proving the request actually came from Meta and
 * wasn't tampered with in transit.
 *
 * Requires `req.rawBody` (the raw request body Buffer) to be populated by
 * the express.json() `verify` option in server.js.
 *
 * If APP_SECRET is not configured, verification is skipped (useful for
 * local development) and a warning is logged once at startup instead.
 */
function verifyMetaSignature(req, res, next) {
  const appSecret = process.env.APP_SECRET;
  if (!appSecret) {
    return next();
  }

  const signatureHeader = req.get('x-hub-signature-256') || '';
  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', appSecret)
    .update(req.rawBody || Buffer.alloc(0))
    .digest('hex')}`;

  const provided = Buffer.from(signatureHeader);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    logError('Webhook signature verification failed (invalid X-Hub-Signature-256)');
    return res.sendStatus(401);
  }

  return next();
}

/**
 * Pull the relevant fields out of a WhatsApp webhook payload.
 * Returns null when the payload is not an inbound text message we handle
 * (e.g. delivery/read status updates, or non-text message types).
 */
function parseIncomingMessage(body) {
  try {
    const entry = body.entry && body.entry[0];
    const change = entry && entry.changes && entry.changes[0];
    const value = change && change.value;

    if (!value) return null;

    // Status callbacks (sent/delivered/read) have `statuses`, not `messages`.
    const message = value.messages && value.messages[0];
    if (!message) return null;

    const phoneNumberId = value.metadata && value.metadata.phone_number_id;
    const from = message.from; // customer's WhatsApp number

    // TEMP DIAGNOSTIC (remove once the phone_number_id routing issue is
    // resolved): log the full metadata block so we can see display_phone_number
    // alongside phone_number_id when Meta's webhook reports an unexpected ID.
    log(`[diagnostic] webhook metadata: ${JSON.stringify(value.metadata)}`);

    // Images/documents (e.g. design files) are captured as attachments
    // rather than passed to Claude â€” see processMessage's media branch.
    if (message.type === 'image' || message.type === 'document') {
      const media = message[message.type];
      return {
        ignored: false,
        isMedia: true,
        mediaType: message.type,
        mediaId: media && media.id,
        mimeType: media && media.mime_type,
        caption: media && media.caption,
        from,
        phoneNumberId,
        messageId: message.id,
      };
    }

    // Only handle text messages beyond this point. Ignore everything else silently.
    if (message.type !== 'text') {
      return { ignored: true, type: message.type, from, phoneNumberId };
    }

    return {
      ignored: false,
      from,
      phoneNumberId,
      text: message.text && message.text.body,
      messageId: message.id,
    };
  } catch (err) {
    logError('Failed to parse incoming webhook payload:', err.message);
    return null;
  }
}

/**
 * POST /webhook
 * Main message handler. Responds 200 to Meta immediately, then processes
 * the message asynchronously (Meta retries if we are slow or error out).
 */
function handleWebhook(req, res) {
  // Always acknowledge fast so Meta doesn't retry the delivery.
  res.sendStatus(200);

  const parsed = parseIncomingMessage(req.body);

  if (!parsed) {
    // Not a message we care about (status update / unparseable). Ignore.
    return;
  }

  if (parsed.ignored) {
    log(
      `Unhandled message type ("${parsed.type}") from ${parsed.from} â€” sending generic fallback reply`
    );
    processUnhandledMessage(parsed).catch((err) => {
      logError('Unhandled error while processing unrecognized message type:', err);
    });
    return;
  }

  if (parsed.isMedia) {
    processInboundMedia(parsed).catch((err) => {
      logError('Unhandled error while processing inbound media:', err);
    });
    return;
  }

  // Process in the background; never block the HTTP response on Claude.
  processMessage(parsed).catch((err) => {
    logError('Unhandled error while processing message:', err);
  });
}

const NO_CAPTION_REPLY = "Got it, thanks! I've got your image/file â€” someone from our team will take a look. Let me know if there's anything else I can help with in the meantime.";
const UNHANDLED_TYPE_REPLY = "I've got your message â€” I can't quite open that type of file here, but let me know in writing what you need and I'll help, or someone from our team will follow up.";

// Claude vision supports these image types directly; documents (PDFs etc.)
// stay on the caption-only fallback path since they aren't image input.
const VISION_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Safety net for any message type we don't have specific handling for
 * (audio notes, stickers, location pins, contacts, etc.) â€” Zara must never
 * go silent on an inbound message, regardless of type.
 */
async function processUnhandledMessage({ from, phoneNumberId, type }) {
  const client = clientManager.getClientByPhoneNumberId(phoneNumberId);
  if (!client) {
    logError(`No active client matched phone_number_id="${phoneNumberId}". Unhandled message (type="${type}") from ${maskPhone(from)} dropped.`);
    return;
  }

  const sent = await sendReply(client, from, UNHANDLED_TYPE_REPLY);
  logsManager.addLog({
    client_id: client.id,
    client_name: client.name,
    customer_number: from,
    customer_message: `(sent an unsupported message type: ${type})`,
    bot_reply: UNHANDLED_TYPE_REPLY,
    response_time_ms: 0,
    status: sent ? 'success' : 'failed',
  });
}

/**
 * Download and store an inbound image/document (e.g. a design file the
 * customer sent), associated with their number for later lookup by a
 * quote's Attachments tab. Zara must never go silent on this:
 *  - Images (jpeg/png/webp) go through real Claude vision, so she can
 *    actually see and reason about logos/designs/reference photos.
 *  - Documents (PDFs etc.) aren't vision input â€” a caption routes through
 *    the normal Claude pipeline with a note that she can't see the file
 *    itself; no caption gets a generic acknowledgment reply.
 */
async function processInboundMedia({ from, phoneNumberId, mediaId, mimeType, caption, mediaType }) {
  const client = clientManager.getClientByPhoneNumberId(phoneNumberId);
  if (!client) {
    logError(`No active client matched phone_number_id="${phoneNumberId}". Media from ${maskPhone(from)} dropped.`);
    return;
  }

  log(`[${client.name}] Incoming media <- ${maskPhone(from)} (mime=${mimeType})`);

  // Best-effort: a storage failure should never block the customer-facing
  // reply below.
  let captured = null;
  try {
    captured = await mediaManager.captureInboundMedia(client, { customerNumber: from, mediaId, mimeType, caption });
  } catch (err) {
    errorLogger.logErrorToFile(`[${client.name}] Failed to capture inbound media`, err);
  }

  const trimmedCaption = String(caption || '').trim();
  const canSeeImage = mediaType === 'image' && captured && VISION_MIME_TYPES.has(captured.mime_type);

  if (canSeeImage) {
    await processMessage({
      from,
      phoneNumberId,
      text: trimmedCaption || "Here's an image â€” take a look and let me know what you think.",
      imageBase64: captured.base64,
      imageMimeType: captured.mime_type,
      attachmentId: captured.id,
    });
    return;
  }

  if (trimmedCaption) {
    await processMessage({
      from,
      phoneNumberId,
      text: trimmedCaption,
      hasAttachment: true,
      attachmentId: captured ? captured.id : null,
    });
    return;
  }

  const sent = await sendReply(client, from, NO_CAPTION_REPLY);
  logsManager.addLog({
    client_id: client.id,
    client_name: client.name,
    customer_number: from,
    customer_message: `(sent a ${mimeType || 'file'} attachment, no caption)`,
    bot_reply: NO_CAPTION_REPLY,
    response_time_ms: 0,
    status: sent ? 'success' : 'failed',
    attachment_id: captured ? captured.id : null,
  });
}

/**
 * Send a WhatsApp message to the client's configured owner, if any.
 * Best-effort: failures are logged but never thrown, so an owner
 * notification can never break the customer-facing reply.
 */
async function notifyOwner(client, text, { email = false, emailSubject } = {}) {
  for (const ownerNumber of handover.getOwnerNumbers(client)) {
    try {
      await sendWhatsAppMessage(client, normalizeNumber(ownerNumber), text);
    } catch (err) {
      const detail = err.response ? JSON.stringify(err.response.data) : err.message;
      logError(`[${client.name}] Failed to notify owner (${maskPhone(ownerNumber)}):`, detail);
      errorLogger.logErrorToFile(`[${client.name}] Failed to notify owner (${maskPhone(ownerNumber)}): ${detail}`, err);
    }
  }

  // Email leg is independent of the WhatsApp send above â€” if Robin's 24h
  // WhatsApp window is closed, the email should still go through.
  if (email) {
    await emailNotifier.sendOwnerEmail(client, emailSubject || `${client.name} â€” ZJAI notification`, text);
  }
}

/**
 * Send a reply to the customer, logging (but not throwing on) failures.
 * Returns true on success, false on failure.
 */
async function sendReply(client, to, text) {
  try {
    await sendWhatsAppMessage(client, to, text);
    return true;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    logError(`[${client.name}] Failed to send WhatsApp reply:`, detail);
    errorLogger.logErrorToFile(`[${client.name}] Failed to send WhatsApp reply: ${detail}`, err);
    return false;
  }
}

/**
 * Handle a message from the client's configured owner number.
 *
 * @returns {Promise<boolean>} true if the message was a recognized
 *   #takeover/#release command (handled here, stop processing); false if
 *   it should fall through to normal customer handling.
 */
async function handleOwnerCommand(client, from, text) {
  const command = handover.parseOwnerCommand(text);
  if (!command) return false;

  if (command.command === 'approve' || command.command === 'reject') {
    await handleQuoteDecision(client, command.command);
    return true;
  }

  if (command.command === 'assign') {
    await handleBookingAssignment(client, command.bookingId, command.teamMemberName);
    return true;
  }

  const target = command.number
    ? conversationManager.findConversationByNumber(client.id, command.number)
    : conversationManager.findMostRecent(client.id);

  if (!target) {
    await notifyOwner(
      client,
      command.number
        ? `No conversation found for ${command.number}.`
        : 'No active conversations yet.'
    );
    return true;
  }

  const active = command.command === 'takeover';
  conversationManager.setHandover(client.id, target.customer_number, active);

  const label = target.customer_name
    ? `${target.customer_name} (${target.customer_number})`
    : target.customer_number;

  await notifyOwner(
    client,
    active
      ? `You're now handling the conversation with ${label}. Zara will stay quiet until you send #release.`
      : `Zara is back in control of the conversation with ${label}.`
  );

  return true;
}

/** WhatsApp notification sent to the owner when a customer needs human help. */
function buildUrgentNotification(client, from, text, conv) {
  const label = conv && conv.customer_name ? `${conv.customer_name} (${from})` : from;
  return (
    `Heads up - ${label} needs human help:\n"${text}"\n\n` +
    `Reply #takeover ${from} to take over this conversation, or #takeover to grab the most recent one.`
  );
}

function quotesPortalLink() {
  return `${settingsManager.getSettings().client_portal_url}/client/quotes`;
}

/** Owner notification (WhatsApp + email) sent when Zara collects a full quote request. */
function buildQuoteNotification(quote, from, score) {
  return (
    `New quote request â€” ${score.temperature.toUpperCase()} â€” ${quote.name}, ${quote.contact_number}, ` +
    `${quote.item_description} (size: ${quote.size}, qty: ${quote.quantity}). (WhatsApp: ${from})\n` +
    `Approve in portal: ${quotesPortalLink()}`
  );
}

/** Owner notification (WhatsApp + email) sent when a Tier 2 PDF quote is ready for review. */
function buildPdfQuoteNotification(record, score) {
  if (record.status === 'needs_pricing') {
    return (
      `New quote request â€” ${score.temperature.toUpperCase()} â€” ${record.name}, ${record.contact_number}, ` +
      `${record.item_description || 'their request'} â€” didn't match anything on your price list, no PDF generated. ` +
      `Please price it manually and follow up directly. View in portal: ${quotesPortalLink()}`
    );
  }
  return (
    `New quote request â€” ${score.temperature.toUpperCase()} â€” ${record.name}, ${record.contact_number}, ` +
    `${record.item_description}, ${pdfGenerator.formatCurrency(record.total)}. ` +
    `Approve in portal: ${quotesPortalLink()}`
  );
}

/**
 * Tier 2 flow: calculate the total from the client's price list, generate
 * the branded PDF, store it as a pending quote, and notify the owner for
 * approval. The PDF is NOT sent to the customer yet.
 *
 * If nothing on the price list matched (total is 0), the quote is marked
 * "needs_pricing" instead of "pending" â€” this isn't an approvable state
 * (the portal's Approve/Reject only render for status "pending"), so a
 * zero-rand quote can never be one-click approved and sent to a customer.
 * No PDF is generated for it either, since there's nothing real to show.
 */
async function handleTier2Quote(client, from, quote, { items, total, marginPercent, marginId }, score) {
  const needsPricing = total <= 0;

  const record = quoteManager.addPdfQuote({
    client_id: client.id,
    client_name: client.name,
    customer_number: from,
    name: quote.name,
    contact_number: quote.contact_number || from,
    item_description: quote.item_description,
    size: quote.size,
    quantity: quote.quantity,
    line_items: items,
    total,
    margin_percent: marginPercent || 0,
    margin_id: marginId || null,
    status: needsPricing ? 'needs_pricing' : 'pending',
  });

  if (!needsPricing) {
    try {
      const pdfBuffer = await pdfGenerator.generateQuotePdf(client, record);
      quoteManager.savePdfFile(record.id, pdfBuffer);
    } catch (err) {
      logError(`[${client.name}] Failed to generate quote PDF:`, err.message);
      errorLogger.logErrorToFile(`[${client.name}] Failed to generate quote PDF`, err);
    }
  }

  await notifyOwner(client, buildPdfQuoteNotification(record, score), {
    email: true,
    emailSubject: `New quote request â€” ${score.temperature.toUpperCase()}`,
  });
}

/**
 * Build start/end ISO datetime strings (with explicit +02:00 offset) for a
 * booking, from a "YYYY-MM-DD" date + "HH:MM" time + duration. South Africa
 * has no DST, so a fixed +02:00 offset is always correct here.
 */
function buildBookingWindow(date, time, durationMinutes) {
  const startISO = `${date}T${time}:00+02:00`;
  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) return null;

  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const shiftedEnd = new Date(end.getTime() + 2 * 60 * 60 * 1000);
  const endISO = `${shiftedEnd.toISOString().slice(0, 19)}+02:00`;

  return { startISO, endISO };
}

/**
 * Handle a [[BOOKING_REQUEST]] extracted from Claude's reply: check the
 * client's Google Calendar for availability, create the event if free, and
 * notify the customer + owner. Never throws â€” all failures are logged and
 * degrade to a customer-facing fallback message.
 */
async function handleBookingRequest(client, from, booking) {
  const window = buildBookingWindow(booking.date, booking.time, booking.duration_minutes);

  if (!window) {
    logError(`[${client.name}] Booking request had an unparseable date/time: ${booking.date} ${booking.time}`);
    return;
  }

  const calendarCreds = {
    clientId: client.google_client_id,
    clientSecret: client.google_client_secret,
    refreshToken: client.google_refresh_token,
    calendarId: client.google_calendar_id || 'primary',
  };

  try {
    const { busy } = await googleCalendarClient.checkAvailability({
      ...calendarCreds,
      startISO: window.startISO,
      endISO: window.endISO,
    });

    if (busy) {
      await sendReply(
        client,
        from,
        `That time's actually taken â€” could you give me another day or time that works for you?`
      );
      return;
    }

    const event = await googleCalendarClient.createEvent({
      ...calendarCreds,
      summary: `${client.name} â€” ${booking.name} (unassigned)`,
      description: `Contact: ${booking.contact_number}${booking.notes ? `\nNotes: ${booking.notes}` : ''}`,
      startISO: window.startISO,
      endISO: window.endISO,
    });

    const record = bookingsManager.addBooking({
      client_id: client.id,
      client_name: client.name,
      customer_number: from,
      name: booking.name,
      contact_number: booking.contact_number,
      date: booking.date,
      time: booking.time,
      notes: booking.notes,
      calendar_event_id: event.id,
    });

    await sendReply(
      client,
      from,
      `You're booked in for ${booking.date} at ${booking.time}. See you then!`
    );

    const teamHint = Array.isArray(client.team_members) && client.team_members.length > 0
      ? ` Reply #assign ${record.id} <name> to assign it to ${client.team_members.map((m) => m.name).join('/')}.`
      : '';

    await notifyOwner(
      client,
      `New booking â€” ${booking.name}, ${booking.contact_number}, ${booking.date} ${booking.time}. Unassigned on the calendar.${teamHint}`,
      { email: true, emailSubject: `New booking â€” ${booking.name}` }
    );
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    logError(`[${client.name}] Google Calendar booking failed:`, detail);
    errorLogger.logErrorToFile(`[${client.name}] Google Calendar booking failed`, err);

    await sendReply(
      client,
      from,
      `Sorry, I couldn't get that booked just now â€” ${client.name} will confirm with you directly shortly.`
    );
    await notifyOwner(
      client,
      `Booking attempt failed for ${booking.name} (${booking.contact_number}), requested ${booking.date} ${booking.time} â€” calendar error, please follow up manually: ${detail}`
    );
  }
}

/**
 * Handle an owner's #approve/#reject reply for the most recent pending
 * Tier 2 quote. #approve sends the PDF to the customer; #reject leaves it
 * for the owner to handle manually.
 */
async function handleQuoteDecision(client, decision) {
  const pending = quoteManager.getMostRecentPendingQuote(client.id);
  if (!pending) {
    await notifyOwner(client, `No pending quotes to ${decision}.`);
    return;
  }

  if (decision === 'approve') {
    const result = await quoteActions.approveQuote(client, pending);
    if (result.ok) {
      await notifyOwner(client, `Quote sent to ${pending.name}.`);
    } else if (result.reason === 'pdf_missing') {
      await notifyOwner(
        client,
        `Could not find the PDF for ${pending.name}'s quote. Please follow up manually.`
      );
    } else {
      await notifyOwner(
        client,
        `Failed to send the quote to ${pending.name}. Please follow up manually.`
      );
    }
  } else {
    quoteActions.rejectQuote(pending);
    await notifyOwner(
      client,
      `Quote for ${pending.name} marked as rejected. Please follow up with them manually.`
    );
  }
}

/**
 * Handle an owner's #assign <booking_id> <team member name> command: look up
 * the booking and the matching team member (case-insensitive), recolor the
 * calendar event and update its description to reflect the assignment, and
 * mark the booking record assigned.
 */
async function handleBookingAssignment(client, bookingId, teamMemberName) {
  const booking = bookingsManager.getBookingById(bookingId);
  if (!booking || booking.client_id !== client.id) {
    await notifyOwner(client, `No booking found with id ${bookingId}.`);
    return;
  }

  const teamMembers = Array.isArray(client.team_members) ? client.team_members : [];
  const teamMember = teamMembers.find(
    (m) => m.name.toLowerCase() === teamMemberName.toLowerCase()
  );

  if (!teamMember) {
    const known = teamMembers.map((m) => m.name).join(', ') || '(none configured)';
    await notifyOwner(client, `"${teamMemberName}" isn't a known team member. Known: ${known}.`);
    return;
  }

  try {
    await googleCalendarClient.updateEvent({
      clientId: client.google_client_id,
      clientSecret: client.google_client_secret,
      refreshToken: client.google_refresh_token,
      calendarId: client.google_calendar_id || 'primary',
      eventId: booking.calendar_event_id,
      colorId: teamMember.color_id,
      description: `Contact: ${booking.contact_number}${booking.notes ? `\nNotes: ${booking.notes}` : ''}\nAssigned to: ${teamMember.name}`,
    });

    bookingsManager.assignBooking(bookingId, teamMember.name);

    await notifyOwner(client, `Booking for ${booking.name} assigned to ${teamMember.name}.`);
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    logError(`[${client.name}] Failed to assign booking ${bookingId}:`, detail);
    errorLogger.logErrorToFile(`[${client.name}] Failed to assign booking ${bookingId}`, err);
    await notifyOwner(client, `Couldn't update the calendar for that assignment â€” please update it manually in Google Calendar.`);
  }
}


const MOCKUP_KEYWORDS = ['mockup', 'design preview', 'visualise', 'visualize', 'show me what', 'how would it look'];

/**
 * Check whether an inbound message is requesting a mockup/design preview.
 */
function isMockupRequest(text) {
  const lower = String(text || '').toLowerCase();
  return MOCKUP_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Find the most recent logo/artwork image the customer sent on WhatsApp.
 * Returns the attachment record (with file_path/mime_type) or null.
 */
function findCustomerLogo(clientId, from) {
  const since = new Date(0).toISOString();
  const until = new Date().toISOString();
  const images = mediaManager
    .getAttachmentsForCustomerInWindow(clientId, from, since, until)
    .filter((a) => a.mime_type && a.mime_type.startsWith('image/') && a.file_path && fs.existsSync(a.file_path));
  if (!images.length) return null;
  return images.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
}

/**
 * Extract likely on-sign text from a description (customer's business name /
 * sign copy) — used as a fallback overlay when no logo image was sent.
 */
function extractSignText(quote, description) {
  if (quote && quote.name) return quote.name;
  return String(description || '').split(/[.\n]/)[0].slice(0, 40);
}

/**
 * Build a mockup for a quote using logo compositing (flat signage) or, for
 * fabricated letters / unrecognised types, a deferred manual-design record.
 * This replaces the old AI-generation path.
 *
 * `signText` — text to composite if the customer sent no logo image.
 */
async function generateMockupForQuote(client, from, description, signText = '') {
  const signClassifier = require('./signClassifier');
  const mockupReferences = require('./mockupReferences');
  const compositor = require('./mockupCompositor');

  const conv = conversationManager.getConversation(client.id, from);
  const customerName = conv ? conv.customer_name : null;
  const { category, deferred } = signClassifier.classify(description);

  // Fabricated letters / unknown types → defer to a manual design task.
  if (deferred) {
    mockupManager.addMockup({
      client_id: client.id,
      customer_number: from,
      customer_name: customerName,
      description,
      sign_type: category || 'other',
      deferred: true,
      image_path: null,
      status: 'pending',
      deferred_note:
        'Professional design mockup will be provided after quote approval.',
    });
    log(`[${client.name}] Mockup deferred (manual design) for ${maskPhone(from)} — ${category || 'unknown type'}`);
    return;
  }

  // Flat signage → composite the customer's logo (or their sign text) onto the
  // best-matching reference image.
  const reference = mockupReferences.pickBest(category);
  if (!reference) {
    // No reference image configured for this category yet — defer so the owner
    // still gets a record and can add a reference / design manually.
    mockupManager.addMockup({
      client_id: client.id,
      customer_number: from,
      customer_name: customerName,
      description,
      sign_type: category,
      deferred: true,
      image_path: null,
      status: 'pending',
      deferred_note:
        `No ${category.replace(/_/g, ' ')} reference image is set up yet — add one under Mockup References, or provide a design manually.`,
    });
    logError(`[${client.name}] Mockup: no reference for category "${category}" — deferred.`);
    return;
  }

  const logo = findCustomerLogo(client.id, from);
  let imagePath = null;
  try {
    const buffer = await compositor.composite({
      referencePath: reference.image_path,
      logoBuffer: logo ? fs.readFileSync(logo.file_path) : null,
      text: logo ? '' : extractSignText(null, signText || description),
      zone: reference.logo_zone,
    });
    imagePath = compositor.saveMockupImage(client.id, buffer);
  } catch (err) {
    logError(`[${client.name}] Mockup: compositing failed:`, err.message);
  }

  mockupManager.addMockup({
    client_id: client.id,
    customer_number: from,
    customer_name: customerName,
    description,
    sign_type: category,
    deferred: false,
    reference_id: reference.id,
    logo_offset: { x: 0, y: 0 },
    logo_scale: 1,
    used_logo: !!logo,
    image_path: imagePath,
    status: 'pending',
  });
  log(`[${client.name}] Mockup composited (${category}, ${logo ? 'logo' : 'text'}) for ${maskPhone(from)}`);
}

/**
 * Keyword-triggered mockup request from the customer ("show me a mockup").
 * Uses the same compositing pipeline as the quote flow.
 */
async function handleMockupRequest(client, from, messageText) {
  await generateMockupForQuote(client, from, messageText, messageText);
}

async function processMessage({
  from,
  phoneNumberId,
  text,
  hasAttachment = false,
  imageBase64 = null,
  imageMimeType = null,
  attachmentId = null,
}) {
  const client = clientManager.getClientByPhoneNumberId(phoneNumberId);

  if (!client) {
    logError(
      `No active client matched phone_number_id="${phoneNumberId}". Message from ${maskPhone(from)} dropped.`
    );
    return;
  }

  log(`[${client.name}] Incoming message <- ${maskPhone(from)}: "${text}"`);

  // The owner messaging the bot's own number is a control command, not a
  // customer conversation - handle it separately and stop.
  if (handover.isFromOwner(client, from)) {
    const handled = await handleOwnerCommand(client, from, text);
    if (handled) return;
  }

  const startedAt = Date.now();

  conversationManager.recordCustomerMessage(client.id, from, text);
  const conv = conversationManager.getConversation(client.id, from);

  // Capture the name we already knew about *before* this message, so a
  // first-time introduction doesn't get treated as a "returning customer".
  const priorCustomerName = conv.customer_name;

  const introducedName = conversationManager.extractIntroducedName(text);
  if (introducedName) {
    conversationManager.setCustomerName(client.id, from, introducedName);
  }

  // The owner has taken this conversation over: Zara stays silent.
  if (conv.handover_active) {
    logsManager.addLog({
      client_id: client.id,
      client_name: client.name,
      customer_number: from,
      customer_message: text,
      bot_reply: '(handover active - no reply sent)',
      response_time_ms: Date.now() - startedAt,
      status: 'handover',
      attachment_id: attachmentId,
    });
    return;
  }

  // Urgent keyword - hand off to a human regardless of business hours.
  if (handover.isUrgentMessage(text)) {
    conversationManager.setAwaitingHuman(client.id, from, true);

    memory.addMessage(client.id, from, 'user', text);
    memory.addMessage(client.id, from, 'assistant', URGENT_REPLY);

    await sendReply(client, from, URGENT_REPLY);
    await notifyOwner(client, buildUrgentNotification(client, from, text, conv));

    logsManager.addLog({
      client_id: client.id,
      client_name: client.name,
      customer_number: from,
      customer_message: text,
      bot_reply: URGENT_REPLY,
      response_time_ms: Date.now() - startedAt,
      status: 'handover',
      attachment_id: attachmentId,
    });
    return;
  }

  // Mockup request â€” if enabled and triggered, short-circuit the normal Claude flow.
  if (client.mockup_generator_enabled && isMockupRequest(text)) {
    await handleMockupRequest(client, from, text, imageBase64, imageMimeType);
    logsManager.addLog({
      client_id: client.id,
      client_name: client.name,
      customer_number: from,
      customer_message: text,
      bot_reply: '(mockup request captured)',
      response_time_ms: Date.now() - startedAt,
      status: 'success',
      attachment_id: attachmentId,
    });
    return;
  }

  // Outside business hours - send the closed-hours auto-reply.
  if (!businessHours.isWithinBusinessHours(client)) {
    const reply = businessHours.getClosedMessage(client);

    memory.addMessage(client.id, from, 'user', text);
    memory.addMessage(client.id, from, 'assistant', reply);

    const sent = await sendReply(client, from, reply);

    logsManager.addLog({
      client_id: client.id,
      client_name: client.name,
      customer_number: from,
      customer_message: text,
      bot_reply: reply,
      response_time_ms: Date.now() - startedAt,
      status: sent ? 'success' : 'failed',
      attachment_id: attachmentId,
    });
    return;
  }

  // Normal flow: ask Claude for a reply.
  const isNewSession = memory.getHistory(client.id, from).length === 0;
  const returningCustomerName = isNewSession ? priorCustomerName : null;

  memory.addMessage(client.id, from, 'user', text);
  const history = memory.getHistory(client.id, from);

  let reply;
  let status = 'success';
  let quote = null;
  let booking = null;

  try {
    const rawReply = await getClaudeReply(client, history, {
      returningCustomerName,
      quoteRequestsEnabled: !!client.quote_requests_enabled,
      quoteStatusSummary: quoteManager.describeQuoteForCustomer(client.id, from),
      hasAttachment,
      imageBase64,
      imageMimeType,
    });

    const extracted = quoteManager.extractQuoteRequest(rawReply);
    reply = extracted.text;
    quote = extracted.quote;

    const bookingExtracted = bookingManager.extractBookingRequest(reply);
    reply = bookingExtracted.text;
    booking = bookingExtracted.booking;

    // Persist the cleaned reply (markers stripped) so it's part of the
    // next turn's context.
    memory.addMessage(client.id, from, 'assistant', reply);
  } catch (err) {
    logError(`[${client.name}] Claude API error:`, err.message);
    errorLogger.logErrorToFile(`[${client.name}] Claude API error`, err);
    reply = settingsManager.getSettings().fallback_message;
    status = 'failed';
  }

  const sent = await sendReply(client, from, reply);
  if (!sent) status = 'failed';

  if (quote && quoteManager.hasRecentDuplicateQuote(client.id, from, quote.item_description)) {
    log(`[${client.name}] Skipped duplicate quote request from ${maskPhone(from)} for "${quote.item_description}"`);
  } else if (quote) {
    const isPdf = quoteManager.isPdfQuoteEnabled(client);
    const { marginPercent, marginId } = clientManager.resolveMarginForCustomer(client, from);
    const calc = isPdf
      ? quoteManager.calculateQuoteTotal(client.price_list, quote.line_items, marginPercent)
      : { items: [], total: 0 };

    const isRepeatCustomer = quoteManager
      .getQuotesForClient(client.id)
      .some((q) => q.customer_number === from && ['sent', 'won'].includes(q.status));

    // Lead tier is computed up front, at quote-extraction time, so it can
    // ride along in the owner notification text below.
    const score = leadTagger.scoreQuote({
      total: calc.total,
      size: quote.size,
      quantity: quote.quantity,
      itemDescription: quote.item_description,
      isRepeatCustomer,
    });
    conversationManager.setLeadTag(client.id, from, score);

    if (isPdf) {
      await handleTier2Quote(client, from, quote, { ...calc, marginPercent, marginId }, score);
    } else {
      quoteManager.addQuote({
        client_id: client.id,
        client_name: client.name,
        customer_number: from,
        ...quote,
        contact_number: quote.contact_number || from,
      });
      await notifyOwner(client, buildQuoteNotification(quote, from, score), {
        email: true,
        emailSubject: `New quote request â€” ${score.temperature.toUpperCase()}`,
      });
    }

    // Auto-generate a mockup for every quote when mockup_generator_enabled is on.
    if (client.mockup_generator_enabled) {
      const mockupDesc = [
        quote.item_description,
        quote.size ? `Size: ${quote.size}` : '',
        quote.material ? `Material: ${quote.material}` : '',
        quote.illumination && quote.illumination !== 'none' ? `Illumination: ${quote.illumination}` : '',
        quote.quantity ? `Quantity: ${quote.quantity}` : '',
      ].filter(Boolean).join('. ');
      generateMockupForQuote(client, from, mockupDesc).catch((err) =>
        logError(`[${client.name}] Auto-mockup generation failed:`, err.message)
      );
    }
  }

  if (booking && client.google_calendar_enabled) {
    await handleBookingRequest(client, from, booking);
  }

  logsManager.addLog({
    client_id: client.id,
    client_name: client.name,
    customer_number: from,
    customer_message: text,
    bot_reply: reply,
    response_time_ms: Date.now() - startedAt,
    status,
    attachment_id: attachmentId,
  });
}

module.exports = {
  verifyWebhook,
  verifyMetaSignature,
  handleWebhook,
  parseIncomingMessage,
  notifyOwner,
};

