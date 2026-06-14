# Onboarding a new client (≈5 minutes)

Once the platform is live (see [DEPLOYMENT.md](DEPLOYMENT.md)), adding a new
WhatsApp client is entirely done through the admin panel — **no code or
config file changes needed**.

---

## What you need from the client first

Each client needs their own **Meta WhatsApp Business app**. Either help them
create one, or have them send you:

1. **WhatsApp Phone Number ID** — Meta App Dashboard → **WhatsApp → API
   Setup**.
2. **WhatsApp API access token** — same page. The default token expires in
   24h; for production, create a permanent **System User** token under
   **Business Settings → System Users** with `whatsapp_business_messaging`
   permission.
3. **Claude API key** (optional) — from https://console.anthropic.com. If
   they don't have one, toggle **"Use platform Claude API key"** in the form
   to use the shared key configured in the admin panel's **Settings** page.
4. Basic business info: name, type, contact person/email/phone.
5. A short description of how the bot should behave (tone, what it should
   help with, anything it should never say).
6. (Optional) The **owner's WhatsApp number** — lets them send
   `#takeover`/`#release` and receive handover/quote notifications. This
   should be a different number from the bot's own WhatsApp Business number.
7. (Optional) **Business hours** — timezone, open/close time, and open days,
   if they want an automatic "we're closed" reply outside those hours.
8. Whether they want Zara to **collect quote requests** (name, contact,
   item, size, quantity) and notify them by WhatsApp — and which **Quoting
   Tier**:
   - **Tier 1 (Quote Assist)** — owner gets a summary and quotes manually.
   - **Tier 2 (Auto PDF Quote)** — needs a **price list** (item/unit/price),
     a **brand color**, an optional **logo URL**, and optional **quote
     terms**. Zara calculates a total and generates a branded PDF; the owner
     replies `#approve`/`#reject` before it's sent to the customer.

---

## 1. Add the client in the admin panel

1. Log in at your admin panel URL (e.g.
   `https://admin.zjaitechnologies.com`).
2. Click **➕ Add New Client** in the sidebar.
3. Fill in the form:

   **Business Information**
   - Business Name, Business Type, Contact Person / Email / Phone

   **WhatsApp Configuration**
   - **WhatsApp Phone Number ID** and **WhatsApp API Token** from step 1/2
     above.

   **Claude Configuration**
   - Either paste a **Claude API Key** (`sk-ant-...`), or toggle **"Use
     platform Claude API key"**.

   **Bot Personality**
   - **Bot Personality** (Friendly / Professional / Casual / etc.) and
     **Bot Name**.
   - **Monthly Message Limit** — for your own tracking/billing
     (see [PRICING.md](PRICING.md)); the bot doesn't currently hard-stop at
     this limit.
   - **Custom System Prompt** — describe the business and what the bot
     should do. Always include something like:
     > "Always reply in the same language the customer uses."

   **Owner & Handover**
   - **Owner WhatsApp Number** — if provided, this number can send
     `#takeover` / `#release` to silence/reactivate Zara for a conversation,
     and receives WhatsApp notifications for urgent messages and quote
     requests.

   **Business Hours**
   - Toggle on and set timezone, open/close time, and open days if the bot
     should send a "we're closed" auto-reply outside those hours. Leave off
     for 24/7 bots.

   **Quote Requests**
   - Toggle on if Zara should collect quote details and notify the owner.
   - Choose the **Quoting Tier**:
     - **Tier 1 — Quote Assist**: owner gets a WhatsApp summary and quotes
       manually.
     - **Tier 2 — Auto PDF Quote**: also set a **brand color**, optional
       **logo URL**, a **price list** (item / unit / price rows), and
       optional **quote terms**. Zara calculates a total and generates a
       branded PDF for owner approval (`#approve`/`#reject`). If the price
       list is left empty, the client falls back to Tier 1 behaviour.

   **Status**
   - Leave **Active** on so the bot responds immediately.

4. Click **Add Client**.

You'll see a success screen with the client's **webhook URL** (it's the same
`https://<your-backend>/webhook` for every client — routing happens by
`phone_number_id`) and a checklist:

- ✅ Client added to system
- ✅ Webhook URL generated
- ⬜ Connect webhook in Meta Developer Portal
- ⬜ Test with a WhatsApp message

---

## 2. Connect the webhook in the client's Meta app

If this client has **their own Meta App** (most do), their app needs to be
pointed at your shared backend:

1. https://developers.facebook.com → their App → **WhatsApp →
   Configuration**.
2. **Callback URL:** your backend's webhook URL, e.g.
   `https://api.zjaitechnologies.com/webhook`.
3. **Verify token:** your platform's `VERIFY_TOKEN` (same value for every
   client — it's a property of your backend, not the client).
4. **Verify and Save**. Check `railway logs` for `Webhook verified
   successfully by Meta`.
5. Under **Webhook fields**, click **Manage** → subscribe to **`messages`**.

> If a client is on a **shared Meta app** you manage (less common), you can
> skip this — the webhook is already configured and just needs the new
> `phone_number_id` to route correctly, which the admin panel handles
> automatically.

---

## 3. Test

1. From a phone, send a WhatsApp message to the client's business number.
2. Within a few seconds you should get a Claude-generated reply matching the
   system prompt/personality you configured.
3. In the admin panel, go to **Clients → (client) → Logs** and confirm the
   message appears with `status: success`.
4. Check the **Dashboard** — "Messages Today" should increment and the
   7-day chart should show this client.
5. If an **Owner WhatsApp Number** is set:
   - Send a message containing "urgent" or "human" from a test number —
     you should get the "Let me connect you with someone" reply, and the
     owner number should receive a notification.
   - From the owner's number, send `#takeover` — further messages from that
     test number should get no reply (check **Conversations** in the admin
     panel shows "Handover"). Send `#release` to hand it back to Zara.
6. If **Business Hours** are enabled, message outside those hours and
   confirm the "We are closed..." reply.
7. If **Quote Requests** are enabled, ask for a quote and provide all the
   details Zara asks for — confirm it appears on the **Quote Requests** page.
   - **Tier 1**: the owner gets a WhatsApp summary.
   - **Tier 2**: the owner gets a "New quote ready for approval" notification
     with the calculated total. Reply `#approve` — the customer should
     receive a branded PDF quote via WhatsApp, and the quote's status should
     move to `sent` (downloadable from the **Quote Requests** page). Reply
     `#reject` instead to confirm the quote is marked `rejected` and no PDF
     is sent to the customer.

If something doesn't work, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## Editing or pausing a client later

- **Clients** page → toggle the **Active** switch to instantly pause/resume
  the bot for that client (no redeploy needed).
- Click a client's row → **Edit** to update their system prompt, Claude key,
  bot name, etc.
- Click **🗑** to permanently delete a client and clear their conversation
  memory.
