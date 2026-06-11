# ZJAI Technologies — WhatsApp Claude Bot Platform

[![Deploy](https://github.com/<your-org>/<your-repo>/actions/workflows/deploy.yml/badge.svg)](https://github.com/<your-org>/<your-repo>/actions/workflows/deploy.yml)
[![Backend status](https://img.shields.io/uptimerobot/status/m000000000-0000000000000000000000000?label=backend)](https://stats.uptimerobot.com/)

> Replace `<your-org>/<your-repo>` and the UptimeRobot monitor ID above once
> the GitHub repo and monitor exist — see [DEPLOYMENT.md](DEPLOYMENT.md) and
> the [Monitoring & alerts](#monitoring--alerts) section.

A production-ready, **multi-client** WhatsApp chatbot platform with a web-based
admin panel.

- **`/backend`** — Node.js/Express server. Receives WhatsApp messages via Meta's
  webhook, sends them to the **Anthropic Claude API**, and replies to the
  customer. Each client has their own WhatsApp number, Claude key, and bot
  personality. Logs every message to `logs.json`.
- **`/admin-panel`** — React (Vite) + Tailwind dashboard for ZJAI Technologies
  staff to add/edit/activate/deactivate clients, view message logs, monitor
  usage, and configure platform-wide settings — **no code or config file
  editing required**.

### Documentation

| Doc | Purpose |
| --- | --- |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Step-by-step: zero to live (Railway + Vercel) in ~30 minutes |
| [DNS_SETUP.md](DNS_SETUP.md) | Point custom domains at the backend/admin panel |
| [ONBOARDING.md](ONBOARDING.md) | Add a new client in ~5 minutes |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Webhook, Claude, login, and Railway issues |
| [SECURITY.md](SECURITY.md) | Production security checklist |
| [PRICING.md](PRICING.md) | Suggested pricing tiers |

---

## Features

**Backend**
- `GET/POST /webhook` — Meta verification, signature validation (`X-Hub-Signature-256`), and incoming WhatsApp messages
- Multi-client routing by `phone_number_id`, each with its own token, Claude key, and system prompt
- Claude integration (`claude-sonnet-4-20250514`) with per-client system prompts
- Conversation memory (configurable length, default 10 messages, auto-reset after 24h)
- Per-message logging to `logs.json` (timestamp, customer, message, reply, response time, status)
- Graceful fallback message if Claude fails; non-text messages ignored silently
- `GET /health` — status, uptime, active/total client counts, active conversations (for uptime monitors)
- Production hardening: Helmet security headers, CORS allow-list, rate limiting, daily-rotated error logs, graceful shutdown

**Admin Panel**
- JWT-protected login (8h expiry, rate-limited)
- Dashboard: active clients, messages today/this month, server status, 7-day per-client message chart
- Clients table: business type, WhatsApp number ID, active toggle, messages today, date added
- Add/Edit client forms (business info, WhatsApp + Claude config, bot personality, system prompt)
- Per-client message logs with masked phone numbers, search, and date-range filtering
- Settings: platform Claude API key, webhook base URL, fallback message, conversation memory length, admin password change
- Recent server errors viewable via `GET /admin/errors`
- Error boundary for graceful recovery from unexpected UI errors

---

## File structure

```
whatsapp-claude-bot/
├── .github/workflows/deploy.yml  # CI: lint/test on PR, deploy on push to main
├── .gitignore
├── DEPLOYMENT.md / DNS_SETUP.md / ONBOARDING.md / TROUBLESHOOTING.md / SECURITY.md / PRICING.md
│
├── backend/
│   ├── server.js            # main entry point (Express app, routes, security middleware)
│   ├── backup.js             # daily backup script (clients.json/logs.json -> backups/)
│   ├── railway.json           # Railway build/deploy config (Nixpacks)
│   ├── Procfile               # process command for Railway
│   ├── clients.json          # client configuration (managed via admin panel, gitignored)
│   ├── clients.example.json   # template for clients.json
│   ├── logs.json             # per-message logs (auto-created, gitignored)
│   ├── settings.json         # platform settings (auto-created, gitignored)
│   ├── .env / .env.example / .env.production.example
│   ├── package.json
│   └── src/
│       ├── webhook.js        # webhook verification + signature check + message pipeline
│       ├── claude.js         # Claude API integration
│       ├── whatsapp.js       # WhatsApp send-message function
│       ├── clientManager.js  # client CRUD, load/match by phone_number_id
│       ├── memory.js         # conversation history management
│       ├── logsManager.js    # logs.json read/write/query/stats
│       ├── settingsManager.js# settings.json read/write
│       ├── auth.js           # admin login + JWT middleware (8h expiry)
│       ├── adminRoutes.js    # /admin/* API for the admin panel (incl. /admin/errors)
│       ├── fileStore.js      # DATA_DIR-aware JSON read/write (atomic writes)
│       ├── errorLogger.js    # daily-rotated error logs (7-day retention)
│       ├── phone.js          # phone number masking for logs
│       └── logger.js         # tiny timestamped logger
│
└── admin-panel/
    ├── index.html
    ├── package.json
    ├── tailwind.config.js
    ├── vercel.json
    ├── .env / .env.example / .env.production.example
    └── src/
        ├── pages/             # Login, Dashboard, Clients, AddClient, EditClient, ClientLogs, Settings
        ├── components/        # Sidebar, Header, Layout, ClientForm, ClientTable, MessageChart, ErrorBoundary, ...
        ├── api/                # axios client + endpoint helpers
        ├── context/AuthContext.jsx
        ├── App.jsx
        └── main.jsx
```

---

## Quick start — run both apps together

You'll need **two terminals** (one for the backend API, one for the admin panel).

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env`:

```env
VERIFY_TOKEN=my_super_secret_verify_token_change_me
PORT=3000

# Admin panel login
ADMIN_USER=zjai_admin
ADMIN_PASS=your_secure_password
JWT_SECRET=replace_with_a_long_random_string   # generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Origins allowed to call this API (comma-separated; the admin panel's dev URL)
ALLOWED_ORIGINS=http://localhost:5173

# Optional in development. In production, set this to your Meta App's
# "App Secret" to verify the X-Hub-Signature-256 header on /webhook.
APP_SECRET=

# Optional. Directory for clients.json/logs.json/settings.json. Defaults to
# the backend folder. On Railway, point this at a mounted volume (e.g. /data).
DATA_DIR=
```

Start it:

```bash
npm start
```

You should see:

```
WhatsApp Claude bot listening on port 3000
Health check:  http://localhost:3000/health
Admin API:     http://localhost:3000/admin
```

### 2. Admin panel

```bash
cd admin-panel
npm install
cp .env.example .env
```

`admin-panel/.env` just needs to point at the backend:

```env
VITE_API_URL=http://localhost:3000
```

Start it:

```bash
npm run dev
```

Open the printed URL (usually `http://localhost:5173`), log in with the
`ADMIN_USER` / `ADMIN_PASS` you set in `backend/.env`, and you're in.

---

## Adding a new client (via the admin panel)

> For the production checklist (what to collect from the client, connecting
> their Meta app, testing), see [ONBOARDING.md](ONBOARDING.md).

1. Log in, click **➕ Add New Client** in the sidebar.
2. Fill in:
   - **Business Name, Business Type, Contact Person/Email/Phone**
   - **WhatsApp Phone Number ID** and **WhatsApp API Token** — from the Meta
     Developer Portal (see step "Connect the webhook" below)
   - **Claude API Key** — from console.anthropic.com, or toggle **"Use platform
     Claude API key"** to use the shared key configured in **Settings**
   - **Bot Personality / Bot Name / Custom System Prompt** — the prompt should
     describe the business and include something like *"Always reply in the
     same language the customer uses."*
   - **Monthly Message Limit** and **Active** toggle
3. Click **Add Client**. You'll see a success screen with the generated
   **webhook URL** and a setup checklist:
   - ✅ Client added to system
   - ✅ Webhook URL generated
   - ⬜ Connect webhook in Meta Developer Portal
   - ⬜ Test with a WhatsApp message

This writes the new client straight into `backend/clients.json` — no manual
file editing needed. Use the **Clients** page to edit, activate/deactivate
(toggle switch), delete, or view message logs for any client.

---

## Run locally with ngrok (for WhatsApp testing)

Meta requires a **public HTTPS** URL for the webhook.

1. With the backend running on port 3000, in a second terminal:
   ```bash
   ngrok http 3000
   ```
2. Copy the HTTPS forwarding URL, e.g. `https://a1b2c3d4.ngrok-free.app`.
   Your webhook URL is that **+ `/webhook`**:
   ```
   https://a1b2c3d4.ngrok-free.app/webhook
   ```
3. (Optional) Set this as the **Webhook Base URL** in the admin panel's
   **Settings** page so newly-added clients show the correct webhook URL.
4. Verify the server is healthy: `curl http://localhost:3000/health`

---

## Connect the webhook in the Meta Developer Portal

1. Go to https://developers.facebook.com → your App → **WhatsApp → Configuration**.
2. Under **Webhook**, click **Edit** and enter:
   - **Callback URL**: your public webhook URL (e.g. `https://.../webhook`)
   - **Verify token**: the exact same string as `VERIFY_TOKEN` in `backend/.env`
3. Click **Verify and Save**. Meta calls `GET /webhook`; you should see
   `Webhook verified successfully by Meta` in the backend logs.
4. Under **Webhook fields**, click **Manage** and **Subscribe** to `messages`.
5. Get your credentials from **WhatsApp → API Setup**:
   - **Phone number ID** → paste into the client's **WhatsApp Phone Number ID** field
   - **Access token** → paste into the client's **WhatsApp API Token** field
     (the temporary token expires in 24h; create a permanent **System User**
     token under **Business Settings → System Users** for production).
6. Send a WhatsApp message to your business number. Watch the backend logs:
   ```
   [Acme Plumbing] Incoming message <- 15551234567: "hi"
   [Acme Plumbing] Outgoing reply -> 15551234567: "Hello! How can I help..."
   ```

> **Testing tip:** In a fresh sandbox, you can only message numbers added under
> **API Setup → "To"** recipients until your number is verified and out of
> development mode.

---

## Deploying

> **For the full guided walkthrough (Railway + Vercel, ~30 minutes, zero to
> live), see [DEPLOYMENT.md](DEPLOYMENT.md).** The summary below is just an
> overview of each option.

### Backend — Railway.app (recommended)

1. Push the repo to GitHub, with Railway's root directory set to `backend`
   (or deploy just the `backend/` folder). `railway.json` and `Procfile` are
   already set up for Nixpacks (`node server.js`, auto-restart on failure).
2. On https://railway.app → **New Project → Deploy from GitHub repo**.
3. Add environment variables from
   [`backend/.env.production.example`](backend/.env.production.example):
   `VERIFY_TOKEN`, `APP_SECRET`, `ADMIN_USER`, `ADMIN_PASS`, `JWT_SECRET`,
   `ALLOWED_ORIGINS` (your deployed admin panel's URL), `DATA_DIR=/data`.
   Railway sets `PORT` automatically.
4. Attach a **volume** mounted at `/data` so `clients.json`, `logs.json`,
   `settings.json`, backups, and error logs persist across redeploys.
5. Railway gives you a public URL like `https://your-app.up.railway.app`. Your
   webhook URL is `https://your-app.up.railway.app/webhook`.

Full step-by-step: [DEPLOYMENT.md](DEPLOYMENT.md). Custom domain
(`api.zjaitechnologies.com`): [DNS_SETUP.md](DNS_SETUP.md).

### Backend — VPS (Ubuntu) with PM2

```bash
git clone <your-repo> whatsapp-claude-bot
cd whatsapp-claude-bot/backend
npm install --omit=dev
nano .env   # production values

sudo npm install -g pm2
pm2 start server.js --name whatsapp-claude-bot
pm2 save
pm2 startup
```

Put **Nginx + a real domain + HTTPS (Let's Encrypt)** in front so Meta can reach
`https://yourdomain.com/webhook`:

```nginx
server {
  server_name yourdomain.com;
  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
  # Add TLS via: sudo certbot --nginx -d yourdomain.com
}
```

### Admin panel — Vercel (recommended)

```bash
npm install -g vercel
cd admin-panel
vercel --prod
```

`vercel.json` is already configured (Vite framework, `dist/` output, SPA
rewrites). Set `VITE_API_URL` (build-time env var) in **Vercel → Settings →
Environment Variables** to your deployed backend's URL, then redeploy. Add
the admin panel's deployed URL to the backend's `ALLOWED_ORIGINS` and
redeploy the backend too.

Full step-by-step: [DEPLOYMENT.md](DEPLOYMENT.md). Custom domain
(`admin.zjaitechnologies.com`): [DNS_SETUP.md](DNS_SETUP.md).

### Admin panel — other static hosting

```bash
cd admin-panel
npm run build
```

This produces `admin-panel/dist/` — a static site. Deploy it to Netlify,
Railway (static service), or Nginx instead of Vercel if preferred. Same
`VITE_API_URL` / `ALLOWED_ORIGINS` requirements apply.

---

## API reference

| Method   | Path                       | Auth        | Purpose                                  |
| -------- | -------------------------- | ----------- | ----------------------------------------- |
| `GET`    | `/webhook`                 | Meta verify | Webhook verification challenge            |
| `POST`   | `/webhook`                 | —           | Receive WhatsApp messages                 |
| `GET`    | `/health`                  | —           | `{ status, uptime, active_clients, ... }` |
| `POST`   | `/admin/login`             | —           | `{ username, password }` → `{ token }`    |
| `GET`    | `/admin/clients`           | JWT         | List all clients (+ messages today)       |
| `GET`    | `/admin/clients/:id`       | JWT         | Get one client (for Edit form)            |
| `POST`   | `/admin/clients`           | JWT         | Add a new client                          |
| `PUT`    | `/admin/clients/:id`       | JWT         | Update a client                           |
| `DELETE` | `/admin/clients/:id`       | JWT         | Delete a client                           |
| `GET`    | `/admin/clients/:id/logs`  | JWT         | Message logs (`?search=&date_from=&date_to=&limit=`) |
| `GET`    | `/admin/stats`             | JWT         | Dashboard stats + 7-day chart data        |
| `GET`    | `/admin/settings`          | JWT         | Get platform settings                     |
| `PUT`    | `/admin/settings`          | JWT         | Update settings / change admin password   |
| `GET`    | `/admin/errors`            | JWT         | Recent server errors (`?limit=`, last 7 days) |

JWT auth: send `Authorization: Bearer <token>` (token from `/admin/login`,
valid 8h). `POST /admin/login` is rate-limited to 5 attempts / 15 min.

---

## How conversation memory works

- Stored **in process memory** keyed by `clientId:userNumber`.
- Keeps the last **N** messages (user + assistant combined) per conversation,
  where N = **Max Conversation Memory** in Settings (default 10).
- A conversation **resets after 24 hours** of inactivity.
- Memory is cleared on server restart and is **not shared across instances**.
  For production persistence/scaling, replace `backend/src/memory.js` with
  Redis or a database.

## How logging works

- Every processed message (success or failure) is appended to
  `backend/logs.json` with the customer number, message, bot reply, response
  time, and status.
- Capped at the most recent 5,000 entries.
- The admin panel's **Logs** page (per client) reads from this file via
  `GET /admin/clients/:id/logs`.

---

## Monitoring & alerts

[UptimeRobot](https://uptimerobot.com) (free) can watch `GET /health` and
alert you if the backend goes down:

1. Sign up at https://uptimerobot.com (free plan: up to 50 monitors, 5-minute
   checks).
2. **+ Add New Monitor**:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** ZJAI Backend
   - **URL:** `https://<your-backend>/health` (e.g.
     `https://api.zjaitechnologies.com/health` or your `*.up.railway.app`
     URL)
   - **Monitoring Interval:** 5 minutes
3. Under **Alert Contacts**, add your email (added by default) — you'll get
   an email if `/health` stops returning `200` or times out.
4. **Optional: Telegram alerts.**
   - In UptimeRobot: **My Settings → Alert Contacts → Add Alert Contact →
     Telegram**, follow the prompt to link the **UptimeRobot bot** to your
     Telegram account/chat.
   - Add this new contact to your monitor's **Alert Contacts To Notify**.
5. Once added, copy the monitor's **status badge URL** (My Settings → Public
   Status Pages, or the monitor's settings → "Status Page") and use it for
   the badge at the top of this README — replace the placeholder
   `m000000000-...` ID.

UptimeRobot hitting `/health` every 5 minutes also keeps the response
warm — useful on hosting tiers that spin down idle services.

---

## Notes & limitations

- **Only text messages** are handled by the webhook. Images, audio, stickers,
  etc. are ignored.
- `clients.json`, `logs.json`, and `settings.json` hold secrets/PII in
  plaintext — keep them out of version control (already in `.gitignore`) and
  lock down access to `DATA_DIR` in production. See [SECURITY.md](SECURITY.md)
  for the full production security checklist.
- The `POST /webhook` handler returns `200` to Meta immediately and processes
  the message asynchronously, so Meta won't retry on slow Claude responses.
- The admin panel stores its JWT in `localStorage` — fine for an internal
  single-admin tool, but if you add multiple admin accounts later, consider
  shorter token expiry and refresh tokens.

---

## License

MIT
