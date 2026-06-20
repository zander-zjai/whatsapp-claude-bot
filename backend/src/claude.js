'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { log, logError } = require('./logger');
const settingsManager = require('./settingsManager');
const quoteManager = require('./quoteManager');
const leadTagger = require('./leadTagger');

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

  parts.push(leadTagger.LEAD_TAG_INSTRUCTIONS);

  return parts.join('\n\n');
}

/**
 * Send the conversation to Claude and return the assistant's text reply.
 *
 * @param {object}  client   - The matched client config (system_prompt, claude_api_key, name).
 * @param {Array}   history  - Prior messages [{ role, content }, ...] (already includes the new user msg).
 * @param {object}  [options] - See buildSystemPrompt.
 * @returns {Promise<string>} Claude's text response.
 */
async function getClaudeReply(client, history, options = {}) {
  const anthropic = getAnthropicClient(resolveApiKey(client));

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(client, options),
    messages: history,
  });

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
