'use strict';

const { getAnthropicClient, resolveApiKey, MODEL } = require('./claude');
const usageManager = require('./usageManager');

const MAX_TOKENS = 1024;

/**
 * Build the system prompt for an email reply. Deliberately simpler than the
 * WhatsApp prompt in claude.js — no quote-marker/booking pipeline (that's
 * tied to WhatsApp's conversational state machine). Email replies just need
 * a professional tone and price-list awareness; quote creation from email
 * can be added later by reusing the same [[QUOTE_REQUEST]] marker pattern
 * if there's demand for it.
 */
function buildEmailSystemPrompt(client) {
  const parts = [
    client.system_prompt,
    `You are replying to a customer email on behalf of ${client.name}. Write a complete, professional email reply: no chat-style abbreviations, a clear greeting using the sender's name if known, and a sign-off. Keep it concise — a few short paragraphs at most. Do not include a subject line in your reply; just write the email body.`,
  ];

  if (Array.isArray(client.price_list) && client.price_list.length > 0) {
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
 * @param {{ fromName: string|null, subject: string, bodyText: string }} email
 * @returns {Promise<string>} The reply body text (no subject line).
 */
async function generateEmailReply(client, email) {
  const anthropic = getAnthropicClient(resolveApiKey(client));

  const userTurn = [
    email.fromName ? `From: ${email.fromName}` : null,
    `Subject: ${email.subject || '(no subject)'}`,
    '',
    email.bodyText || '(empty email body)',
  ]
    .filter((line) => line !== null)
    .join('\n');

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildEmailSystemPrompt(client),
    messages: [{ role: 'user', content: userTurn }],
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
