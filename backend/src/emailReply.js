'use strict';

const { getAnthropicClient, resolveApiKey, MODEL } = require('./claude');
const usageManager = require('./usageManager');
const quoteManager = require('./quoteManager');

const MAX_TOKENS = 1024;

/**
 * Build the system prompt for an email reply. Deliberately simpler than the
 * WhatsApp prompt in claude.js — no quote-marker/booking pipeline (that's
 * tied to WhatsApp's conversational state machine). Email replies just need
 * a professional tone and price-list awareness; quote creation from email
 * can be added later by reusing the same [[QUOTE_REQUEST]] marker pattern
 * if there's demand for it.
 */
function buildEmailSystemPrompt(client, options = {}) {
  const parts = [
    client.system_prompt,
    `You are replying to a customer email on behalf of ${client.name}.${
      options.fromName ? ` The customer's name is ${options.fromName}.` : ''
    } Write a complete, professional email reply: no chat-style abbreviations, a clear greeting, and a sign-off. Keep it concise — a few short paragraphs at most. Do not include a subject line in your reply; just write the email body. This may be one message in an ongoing back-and-forth — use the prior messages below for context (e.g. don't re-ask for details the customer already gave).`,
  ];

  if (client.quote_requests_enabled) {
    parts.push(quoteManager.buildQuoteInstructions(client));
  } else if (Array.isArray(client.price_list) && client.price_list.length > 0) {
    const priceListText = client.price_list
      .map((p) => `- ${p.item} (${p.unit}): R${Number(p.price).toFixed(2)}`)
      .join('\n');
    parts.push(
      `If the customer asks about pricing, use this price list to answer or estimate:\n${priceListText}\n\nMake clear any estimate is rough and the team will follow up with a final confirmed quote.`
    );
  }

  return parts.join('\n\n');
}

/**
 * @param {object} client
 * @param {Array} history - Prior messages [{ role, content }, ...], already
 *   including the new user turn (mirrors claude.js's getClaudeReply).
 * @param {{ fromName: string|null }} [options]
 * @returns {Promise<string>} The reply body text (no subject line).
 */
async function generateEmailReply(client, history, options = {}) {
  const anthropic = getAnthropicClient(resolveApiKey(client));

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildEmailSystemPrompt(client, options),
    messages: history,
  });

  if (response.usage) {
    usageManager.recordUsage(client.id, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });
  }

  const text = (response.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  if (!text) {
    throw new Error('Claude returned an empty email reply');
  }

  return text;
}

module.exports = { generateEmailReply, buildEmailSystemPrompt };
