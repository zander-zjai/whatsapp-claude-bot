'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { log, logError } = require('./logger');
const settingsManager = require('./settingsManager');
const quoteManager = require('./quoteManager');
const bookingManager = require('./bookingManager');
const usageManager = require('./usageManager');

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 1024;

// Cache one Anthropic client per API key so we don't rebuild it per message.
const clientsByKey = new Map();

function getAnthropicClient(apiKey) {
  if (!clientsByKey.has(apiKey)) {
    clientsByKey.set(apiKey, new Anthropic({ apiKey }));
  }
  return clientsByKey.get(apiKey);
}

/**
 * Resolve which Claude API key to use for a client: their own key, unless
 * `use_platform_key` is set (or no client key is configured), in which case
 * fall back to the platform-wide key from the Settings page.
 */
function resolveApiKey(client) {
  if (!client.use_platform_key && client.claude_api_key) {
    return client.claude_api_key;
  }

  const platformKey = settingsManager.getSettings().platform_claude_api_key;
  if (!platformKey) {
    throw new Error(
      `No Claude API key available for client "${client.name}" (no client key, and no platform key configured in Settings)`
    );
  }
  return platformKey;
}

/**
 * Build the system prompt sent to Claude, layering returning-customer and
 * quote-request instructions on top of the client's base system_prompt.
 *
 * @param {object} client
 * @param {object} [options]
 * @param {string|null} [options.returningCustomerName] - Set if this customer
 *   has messaged before and previously gave their name.
 * @param {boolean} [options.quoteRequestsEnabled] - Append quote-collection
 *   instructions for this client.
 * @param {string|null} [options.quoteStatusSummary] - One-line description of
 *   this customer's most recent quote, so Claude can answer "what's the
 *   status of my quote?" directly instead of involving the owner.
 */
function buildSystemPrompt(client, options = {}) {
  const parts = [client.system_prompt];

  if (options.returningCustomerName) {
    parts.push(
      `This is a returning customer who previously introduced themselves as ${options.returningCustomerName}. Greet them by name.`
    );
  }

  if (options.quoteRequestsEnabled) {
    parts.push(quoteManager.buildQuoteInstructions(client));
  }

  const bookingInstructions = bookingManager.buildBookingInstructions(client);
  if (bookingInstructions) {
    parts.push(bookingInstructions);
  }

  if (options.hasAttachment) {
    parts.push(
      `The customer's latest message also included a document attachment (e.g. a PDF). You cannot see its contents, so acknowledge that you received it (e.g. "got your file") and answer any text question they asked alongside it. Let them know the team will review the attachment directly.`
    );
  }

  if (options.quoteStatusSummary) {
    parts.push(
      `QUOTE STATUS: ${options.quoteStatusSummary} If the customer asks about the status of their quote or order, answer directly using this information — you don't need to involve the owner.`
    );
  }

  return parts.join('\n\n');
}

/**
 * Send the conversation to Claude and return the assistant's text reply.
 *
 * @param {object}  client   - The matched client config (system_prompt, claude_api_key, name).
 * @param {Array}   history  - Prior messages [{ role, content }, ...] (already includes the new user msg).
 * @param {object}  [options] - See buildSystemPrompt.
 * @param {string}  [options.imageBase64] - Base64 image data for the current
 *   turn (vision). Swapped into the last user message's content as a
 *   multimodal block for this API call only — never written back into
 *   `history`/memory, so later turns stay plain text and don't keep
 *   re-billing image tokens on every follow-up message.
 * @param {string}  [options.imageMimeType] - Media type for imageBase64
 *   (image/jpeg, image/png, or image/webp).
 * @returns {Promise<string>} Claude's text response.
 */
async function getClaudeReply(client, history, options = {}) {
  const anthropic = getAnthropicClient(resolveApiKey(client));

  let messages = history;
  if (options.imageBase64) {
    messages = history.slice();
    const lastIndex = messages.length - 1;
    const last = messages[lastIndex];
    if (last && last.role === 'user') {
      messages[lastIndex] = {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: options.imageMimeType, data: options.imageBase64 },
          },
          { type: 'text', text: typeof last.content === 'string' ? last.content : '' },
        ],
      };
    }
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(client, options),
    messages,
  });

  if (response.usage) {
    usageManager.recordUsage(client.id, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });
  }

  // Concatenate all text blocks from the response.
  const text = (response.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  if (!text) {
    throw new Error('Claude returned an empty response');
  }

  return text;
}

module.exports = { getClaudeReply, MODEL };
