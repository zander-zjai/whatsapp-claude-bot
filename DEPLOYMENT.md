# Deployment guide — zero to live in ~30 minutes

This walks through deploying the **backend to Railway** and the **admin panel
to Vercel**, end to end. Follow it top to bottom on a fresh checkout.

> Already deployed and just want to add a client? See
> [ONBOARDING.md](ONBOARDING.md). Hit a problem? See
> [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## Before you start

You'll need accounts for:

- **GitHub** — hosts the repo Railway/Vercel deploy from
- **Railway** — https://railway.app (free tier works to start)
- **Vercel** — https://vercel.com (free "Hobby" tier works)
- **Anthropic** — https://console.anthropic.com (Claude API key, at least one
  per client unless they use a shared platform key)
- **Meta for Developers** — https://developers.facebook.com (WhatsApp
  Business API access, per client)

And locally:

```bash
node -v   # 18.x
npm -v
git --version
```

---

## Step 1 — Push the code to GitHub (≈5 min)

```bash
cd whatsapp-claude-bot
git init
git add .
git commit -m "Initial commit"
```

Create a new **empty** repo on GitHub (no README/license — this repo already
has them), then:

```bash
git remote add origin https://github.com/<your-org>/<your-repo>.git
git branch -M main
git push -u origin main
```

`.gitignore` already excludes `node_modules/`, `.env*`, `clients.json`,
`logs.json`, `settings.json`, `dist/`, etc. — verify `git status` doesn't show
any of those before pushing.

---

## Step 2 — Deploy the backend to Railway (≈10 min)

```bash
npm install -g @railway/cli
railway login
```

From the repo root:

```bash
cd backend
railway init
```

Choose **"Empty Project"** and give it a name (e.g. `zjai-bot`).

### 2a. Set environment variables

Open the project in the Railway dashboard (`railway open`) → your service →
**Variables**, and add everything from
[`backend/.env.production.example`](backend/.env.production.example):

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `VERIFY_TOKEN` | `zjai_webhook_verify_2026` (or your own — must match Meta config) |
| `APP_SECRET` | your Meta App's **App Secret** |
| `ADMIN_USER` | `zjai_admin` (or your own) |
| `ADMIN_PASS` | a strong, freshly-generated password |
| `JWT_SECRET` | a freshly-generated 64-char hex string |
| `ALLOWED_ORIGINS` | leave blank for now — set after Step 3 |
| `DATA_DIR` | `/data` |

Generate secrets locally:

```bash
node -e "console.log(require('crypto').randomBytes(18).toString('base64'))"   # ADMIN_PASS
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # JWT_SECRET
```

Railway sets `PORT` automatically — don't set it yourself.

### 2b. Add a persistent volume (so client data survives redeploys)

In the Railway dashboard: your service → **Settings → Volumes → New Volume**.
- **Mount path:** `/data`

This is what `DATA_DIR=/data` points at — `clients.json`, `logs.json`,
`settings.json`, `backups/`, and `error-logs/` all live here.

### 2c. Deploy

```bash
railway up
```

Railway builds with Nixpacks (using `railway.json` / `Procfile` already in
`backend/`) and starts `node server.js`.

### 2d. Get your public URL

In the dashboard: your service → **Settings → Networking → Generate Domain**.
You'll get something like:

```
https://zjai-bot.up.railway.app
```

Verify it's live:

```bash
curl https://zjai-bot.up.railway.app/health
```

You should see `{"status":"online","company":"ZJAI Technologies",...}`.

---

## Step 3 — Deploy the admin panel to Vercel (≈5 min)

```bash
npm install -g vercel
vercel login
cd ../admin-panel
vercel --prod
```

Answer the prompts:
- **Set up and deploy?** Yes
- **Link to existing project?** No (first time)
- **Project name:** `zjai-admin` (or your own)
- **Directory:** `./` (you're already in `admin-panel/`)
- Vercel detects `vercel.json` (Vite framework, `dist/` output) automatically.

### 3a. Set the API URL

In the Vercel dashboard: your project → **Settings → Environment Variables**:

| Name | Value | Environment |
| --- | --- | --- |
| `VITE_API_URL` | `https://zjai-bot.up.railway.app` (your Railway URL from Step 2d) | Production |

Redeploy so the build picks up the new env var:

```bash
vercel --prod
```

### 3b. Get your public URL

Vercel prints a URL like:

```
https://zjai-admin.vercel.app
```

---

## Step 4 — Connect the two apps (≈2 min)

Now that both URLs exist, go back to **Railway → Variables** and set:

```
ALLOWED_ORIGINS=https://zjai-admin.vercel.app
```

Railway redeploys automatically when you save a variable. Then open
`https://zjai-admin.vercel.app`, log in with `ADMIN_USER` / `ADMIN_PASS`, and
confirm the **Dashboard** loads (it calls `/admin/stats` and `/health` on
your Railway backend).

---

## Step 5 — Configure the WhatsApp webhook in Meta (≈5 min)

1. Go to https://developers.facebook.com → your App → **WhatsApp →
   Configuration**.
2. **Callback URL:** `https://zjai-bot.up.railway.app/webhook`
3. **Verify token:** the exact value of `VERIFY_TOKEN` from Step 2a.
4. Click **Verify and Save** — Railway logs should show `Webhook verified
   successfully by Meta` (`railway logs`).
5. Under **Webhook fields**, click **Manage** and subscribe to `messages`.
6. Add at least one client via the admin panel (see
   [ONBOARDING.md](ONBOARDING.md)) using this app's **Phone number ID** and
   **access token**.
7. Send a WhatsApp message to the test number and confirm you get a reply.

---

## Optional next steps

- **Custom domains** (`api.zjaitechnologies.com`,
  `admin.zjaitechnologies.com`) — see [DNS_SETUP.md](DNS_SETUP.md). Once set
  up, update `ALLOWED_ORIGINS`, `VITE_API_URL`, and the Meta webhook URL to
  the new domains.
- **Uptime monitoring** — see the "Monitoring & alerts" section in
  [README.md](README.md#monitoring--alerts).
- **CI/CD** — `.github/workflows/deploy.yml` auto-deploys on push to `main`.
  Add these GitHub repo secrets (**Settings → Secrets and variables →
  Actions**):
  - `RAILWAY_TOKEN` — Railway → Account Settings → Tokens (project token)
  - `RAILWAY_SERVICE` — your Railway service name (e.g. `zjai-bot`)
  - `VERCEL_TOKEN` — Vercel → Account Settings → Tokens
  - `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` — run `vercel link` inside
    `admin-panel/` once locally, then read them from
    `admin-panel/.vercel/project.json`
- **Daily backups** — `backend/backup.js` (`npm run backup`). See
  [TROUBLESHOOTING.md](TROUBLESHOOTING.md#scheduling-backups-on-railway) for
  how to schedule it.

---

## Verification checklist

- [ ] `GET https://<your-backend>/health` returns `status: "online"`
- [ ] Admin panel loads at your Vercel URL and login succeeds
- [ ] Dashboard shows server status "Online"
- [ ] At least one client added with a real `phone_number_id` + WhatsApp
      token
- [ ] Meta webhook shows "Verified" with no errors
- [ ] A test WhatsApp message gets a Claude-generated reply
- [ ] `ALLOWED_ORIGINS` does **not** contain `*`
- [ ] `DATA_DIR=/data` with a Railway volume attached (data survives a
      redeploy — test with `railway up` again)
