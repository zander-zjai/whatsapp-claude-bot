'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { log, logError } = require('./logger');
const settingsManager = require('./settingsManager');

const MODEL = 'claude-sonnet-4-20250514';
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
 * Send the conversation to Claude and return the assistant's text reply.
 *
 * @param {object}  client   - The matched client config (system_prompt, claude_api_key, name).
 * @param {Array}   history  - Prior messages [{ role, content }, ...] (already includes the new user msg).
 * @returns {Promise<string>} Claude's text response.
 */
async function getClaudeReply(client, history) {
  const anthropic = getAnthropicClient(resolveApiKey(client));

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: client.system_prompt,
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
