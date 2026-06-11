# Suggested pricing tiers

These are **starting-point suggestions** for ZJAI Technologies to price the
platform for clients. Adjust based on your costs (Claude API usage, WhatsApp
Business API conversation fees from Meta) and market.

---

## Tiers

| | **Starter** | **Growth** | **Enterprise** |
| --- | --- | --- | --- |
| **Price** | $49/month | $199/month | Custom (from $499/month) |
| **WhatsApp numbers** | 1 | up to 5 | unlimited |
| **Messages / month** | 1,000 | 10,000 (shared across numbers) | custom / volume-based |
| **Claude API key** | Platform key (shared) | Platform key or own key | Own key (recommended) |
| **Conversation memory** | 10 messages (default) | configurable | configurable |
| **Custom system prompt / personality** | ✅ | ✅ | ✅ + per-number variants |
| **Admin panel access** | ✅ | ✅ | ✅ + multiple staff logins* |
| **Message logs & dashboard** | 30-day history | full history | full history + export |
| **Support** | Email, 48h response | Email + chat, 24h response | Priority / SLA-backed |
| **Custom domain for webhook** | — | — | ✅ |
| **Onboarding** | Self-serve ([ONBOARDING.md](ONBOARDING.md)) | Assisted setup | White-glove setup |

\* The current admin panel has a single shared admin login
(`ADMIN_USER`/`ADMIN_PASS`); per-staff accounts would be a custom Enterprise
add-on requiring development work.

---

## How tiers map to the platform

- **`monthly_message_limit`** on each client (set via Add/Edit Client) is a
  soft tracking number for billing — it's **not currently enforced** by the
  bot (messages aren't blocked once exceeded). Use the **Dashboard** and
  per-client **Logs** to monitor actual usage against the plan and follow up
  with clients who exceed it.
- **`use_platform_key`** lets Starter/Growth clients run on ZJAI's shared
  Claude API key — simplifies onboarding, but usage costs come out of ZJAI's
  Anthropic account. Track this closely; consider requiring Enterprise (and
  high-volume Growth) clients to bring their own key.
- Each client = one entry in `clients.json`, one WhatsApp `phone_number_id`.
  "WhatsApp numbers" in the table above = number of client entries a
  customer's plan allows.

---

## Cost considerations (for setting your margins)

Two variable costs scale with usage:

1. **Claude API (Anthropic).** Roughly proportional to conversation length ×
   message volume. A typical exchange (system prompt + ~10 messages of
   history + reply) is on the order of a few thousand tokens. Check current
   pricing at https://www.anthropic.com/pricing and estimate:
   ```
   monthly Claude cost ≈ messages/month × avg tokens/message × price per token
   ```
   At 1,000 messages/month this is typically a few dollars; at 10,000+ it
   becomes a meaningful line item — factor it into Growth/Enterprise pricing
   or pass it through via "bring your own key."

2. **WhatsApp Business API conversation fees (Meta).** Meta charges per
   *conversation* (a 24h window), not per message, with rates that vary by
   country and conversation category (service vs. marketing). Check
   https://developers.facebook.com/docs/whatsapp/pricing for current rates.
   The first 1,000 conversations/month per WhatsApp Business Account are
   typically free.

Fixed costs (Railway + Vercel hosting) are low and largely flat — both have
usable free tiers, with Railway's usage-based plan typically a few
dollars/month per service at this traffic level.

---

## Add-ons / one-off fees (suggested)

| Item | Suggested price |
| --- | --- |
| Additional WhatsApp number (beyond plan limit) | $25/month each |
| Custom domain setup (see [DNS_SETUP.md](DNS_SETUP.md)) | $50 one-time, or included in Enterprise |
| Custom system prompt rewrite / tuning session | $75 one-time |
| Priority onboarding (same-day setup) | $99 one-time |

---

## Notes

- These numbers are a **starting point** — validate against your actual
  Claude + WhatsApp costs for your client mix before committing to public
  pricing.
- Annual billing at a discount (e.g. 2 months free) is a common SaaS pattern
  worth considering once you have a few paying clients.
