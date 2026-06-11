# Troubleshooting

## Viewing live logs on Railway

```bash
railway logs
```

Or in the dashboard: your project → your service → **Deployments** → click
the active deployment → **View Logs**. Logs include every `log()`/`logError()`
line from the backend (incoming/outgoing messages with masked phone numbers,
startup checks, errors).

For errors specifically, the admin panel-protected endpoint
`GET /admin/errors?limit=100` returns the last 7 days of entries from
`DATA_DIR/error-logs/errors-YYYY-MM-DD.log` (timestamp, message, stack trace)
— useful when you can't easily grep through Railway's log stream.

---

## Webhook not receiving messages

1. **Check Meta shows the webhook as verified.**
   Meta App Dashboard → **WhatsApp → Configuration** → the Callback URL
   should show no error icon. If verification fails:
   - Confirm the **Callback URL** is exactly `https://<your-backend>/webhook`
     (not `/webhooks`, no trailing content).
   - Confirm the **Verify token** matches `VERIFY_TOKEN` in Railway exactly
     (case-sensitive, no extra whitespace).
   - `railway logs` should show `Webhook verified successfully by Meta` when
     you click "Verify and Save". If you instead see `Webhook verification
     failed`, the token doesn't match.

2. **Confirm `messages` is subscribed.**
   Same Configuration page → **Webhook fields** → **Manage** → `messages`
   must have a checkmark. This is easy to miss — verification can succeed
   while the subscription is still off.

3. **Confirm the backend is reachable and responding 200.**
   ```bash
   curl https://<your-backend>/health
   ```
   If this fails or times out, the problem is the deployment, not the
   webhook config — check `railway logs` for crash loops.

4. **POST returns 401.**
   This means `verifyMetaSignature` rejected the request — `APP_SECRET` in
   Railway doesn't match the Meta App's **App Secret** (App Dashboard →
   Settings → Basic). Copy it again carefully (it's shown masked by default;
   click "Show").

5. **Check the sender is allowed.**
   In Meta's sandbox/dev mode, you can only message numbers added under
   **API Setup → "To"** recipients until the number is verified and the app
   is out of development mode.

6. **No client matched.**
   `railway logs` shows `No active client matched phone_number_id="..."`.
   The `phone_number_id` in the admin panel client config doesn't match the
   one Meta sent. Get the correct ID from **WhatsApp → API Setup → Phone
   number ID** and update the client (Clients → Edit).

---

## Claude not responding (or sending the fallback message)

The fallback message (Settings → "Fallback Message", default *"Sorry, I'm
unavailable right now..."*) is sent whenever the Claude API call throws.

1. Check `GET /admin/errors` (or `railway logs`) for `Claude API error:
   ...`. Common causes:
   - **`401 Unauthorized`** — the client's `claude_api_key` (or the platform
     key in Settings, if "Use platform Claude API key" is on) is invalid or
     revoked. Generate a new one at https://console.anthropic.com.
   - **`429` / rate limit / credit balance** — the Anthropic account has hit
     its rate limit or run out of credits. Check
     https://console.anthropic.com → **Plans & Billing**.
   - **Timeout / network error** — transient; if it persists, check
     Anthropic's status page.

2. **Client is paused.** If `active: false`, the webhook handler still
   receives the message but `clientManager.getClientByPhoneNumberId()` only
   matches **active** clients — a paused client's messages are silently
   dropped (logged as "No active client matched..."). Toggle **Active** back
   on in the Clients page.

3. **Wrong system prompt / model behavior, not an error.** This isn't a bug
   — edit the client's **Custom System Prompt** (Clients → Edit) to adjust
   tone, scope, or language instructions, and test again. Changes apply to
   the *next* incoming message immediately (no restart needed).

4. **Conversation memory seems "stuck" or stale.** Memory resets after 24h
   of inactivity per customer, or immediately if you delete and re-add the
   client. There's no manual "clear memory for one customer" button currently
   — restarting the backend (`railway redeploy`) clears all in-memory
   conversation history platform-wide.

---

## Admin panel login issues

- **"Invalid username or password"**
  - Confirm `ADMIN_USER` / `ADMIN_PASS` in Railway match what you're typing.
  - If the password was changed via **Settings → Change Password**, it's now
    stored as a hash in `settings.json` (`DATA_DIR`) and **overrides**
    `ADMIN_PASS` from the environment. If you've lost the new password and
    need to reset it: delete the `admin_user`/`admin_pass_hash` fields from
    `settings.json` on the Railway volume (or delete the file — it'll be
    recreated with defaults) to fall back to the env var values, then
    redeploy.

- **"Too many login attempts. Please try again in 15 minutes."**
  This is the login rate limiter (5 failed attempts / 15 min per IP) — see
  [SECURITY.md](SECURITY.md#3-admin-login-is-rate-limited-5-attempts--15-min-lockout).
  Wait 15 minutes, or double-check you have the right credentials before
  retrying.

- **Login succeeds but every page shows a network/CORS error.**
  - Open the browser console. A CORS error
    (`No 'Access-Control-Allow-Origin' header...`) means the admin panel's
    origin isn't in the backend's `ALLOWED_ORIGINS`. Add it in Railway
    (e.g. `https://admin.zjaitechnologies.com` or the `*.vercel.app` preview
    URL you're testing from) and redeploy.
  - A `VITE_API_URL` pointing at the wrong backend (e.g. still
    `http://localhost:3000` after deploying) — check Vercel → Settings →
    Environment Variables, fix, and redeploy (`vercel --prod`).

- **Logged out unexpectedly after ~8 hours.**
  This is expected — JWTs expire after 8h
  ([SECURITY.md](SECURITY.md#2-admin-sessions-expire-after-8-hours)). Just
  log in again.

---

## Restarting the Railway server

- **Via dashboard:** your service → **Deployments** → ⋮ on the latest
  deployment → **Restart**.
- **Via CLI:** trigger a new deploy, which restarts the process:
  ```bash
  railway up
  ```
- **Automatic restarts:** `railway.json` sets
  `restartPolicyType: ON_FAILURE` with up to 3 retries — if the process
  crashes (e.g. `uncaughtException`), Railway restarts it automatically.
  Repeated crash-looping usually means a missing required env var
  (`VERIFY_TOKEN`, `JWT_SECRET`, `ADMIN_USER`/`ADMIN_PASS` are checked at
  startup and logged as errors, though the server still starts so `/health`
  stays up for monitoring).

**What survives a restart:** anything in `DATA_DIR` (the attached volume) —
`clients.json`, `logs.json`, `settings.json`, backups, error logs.
**What doesn't:** in-memory conversation history (`memory.js`) — customers'
next message starts a fresh conversation context.

---

## Scheduling backups on Railway

`backend/backup.js` (`npm run backup`) copies `clients.json` and `logs.json`
into `DATA_DIR/backups/` and prunes anything older than 30 days.

Railway's **Cron Jobs** (a separate service type) can run this on a schedule:

1. Railway dashboard → your project → **+ New → Cron Job**.
2. **Source:** same repo, root directory `backend`.
3. **Schedule:** `0 3 * * *` (daily at 03:00 UTC).
4. **Command:** `node backup.js`
5. Set the same `DATA_DIR` variable (and attach the **same volume**, mounted
   at the same path) so the cron job sees the live data files.

Verify it ran: check the cron job's logs, or look for new files under
`backups/` (you can `railway run ls /data/backups` to inspect the volume from
your local CLI, attached to the service's environment).
