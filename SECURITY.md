# Security checklist — ZJAI WhatsApp Claude Bot

This document explains how each production security requirement is
implemented, where the relevant code lives, and what **you** still need to
configure when deploying. Treat it as a pre-launch checklist.

---

## 1. Secrets live in dashboards, never in code

- No secret values are committed to the repo. `backend/.env`,
  `backend/.env.production`, and `admin-panel/.env.production` are all in
  [`.gitignore`](.gitignore).
- `backend/.env.production.example` and `admin-panel/.env.production.example`
  are **templates** with placeholder values — copy the variable names, not
  the values.
- Real values are set in:
  - **Railway** → Project → Service → **Variables** (backend)
  - **Vercel** → Project → Settings → **Environment Variables** (admin panel)
- Rotate `JWT_SECRET`, `ADMIN_PASS`, and `APP_SECRET` immediately if they are
  ever exposed (committed by mistake, pasted in a support channel, etc.).

**Action before launch:** generate fresh values for `JWT_SECRET`,
`ADMIN_PASS`, and `VERIFY_TOKEN` — don't reuse the examples in
`.env.production.example`.

```bash
# Strong admin password
node -e "console.log(require('crypto').randomBytes(18).toString('base64'))"

# 64-character JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 2. Admin sessions expire after 8 hours

- `backend/src/auth.js` issues JWTs with `expiresIn: '8h'` (`TOKEN_EXPIRY`).
- After 8 hours the admin panel's API calls start returning `401`, the axios
  interceptor in `admin-panel/src/api/client.js` clears the stored token and
  fires `zjai:unauthorized`, and the user is redirected to `/login`.

---

## 3. Admin login is rate-limited (5 attempts / 15 min lockout)

- `POST /admin/login` is wrapped with a dedicated `express-rate-limit`
  limiter (`loginLimiter` in `backend/src/adminRoutes.js`):
  - **5 requests per 15 minutes per IP**
  - `skipSuccessfulRequests: true` — only failed attempts count, so a
    legitimate admin who mistypes once or twice isn't penalized once they
    log in successfully.
  - Returns `429 { "error": "Too many login attempts. Please try again in 15
    minutes." }` once the limit is hit.

---

## 4. The WhatsApp webhook validates Meta's signature

- `backend/server.js` captures the raw request body
  (`express.json({ verify: ... })` → `req.rawBody`).
- `verifyMetaSignature` (`backend/src/webhook.js`) recomputes
  `HMAC-SHA256(APP_SECRET, rawBody)` and compares it to the
  `X-Hub-Signature-256` header using `crypto.timingSafeEqual` (constant-time,
  avoids timing attacks). Requests with a missing/invalid signature get
  `401`.
- **`APP_SECRET` is required in production.** If it's unset, verification is
  skipped and a warning is logged at startup — this is only safe for local
  development with tools like ngrok where Meta's signature can't easily be
  reproduced.
- Get the App Secret from the Meta App Dashboard → **Settings → Basic → App
  Secret** and set it as `APP_SECRET` in Railway.

---

## 5. CORS only allows the admin panel's domain

- `backend/server.js` builds its CORS allow-list from `ALLOWED_ORIGINS`
  (comma-separated; falls back to the legacy `CORS_ORIGIN`, then `*` for
  local dev only).
- In production, set `ALLOWED_ORIGINS` to your deployed admin panel
  URL(s), e.g.:
  ```
  ALLOWED_ORIGINS=https://admin.zjaitechnologies.com,https://zjai-admin.vercel.app
  ```
- **Never set `ALLOWED_ORIGINS=*` in production** — that would let any
  website's JavaScript call the admin API using a stolen token.

---

## 6. Every API route requires a valid JWT — except `/webhook` and `/health`

| Route                | Auth         |
| -------------------- | ------------ |
| `GET /webhook`       | Meta verify token (query string) |
| `POST /webhook`      | Meta `X-Hub-Signature-256` (see §4) |
| `GET /health`        | none (public, used by uptime monitors) |
| `POST /admin/login`  | none (rate-limited, see §3) |
| **All other `/admin/*`** | `Authorization: Bearer <JWT>` |

`backend/src/adminRoutes.js` applies `auth.requireAuth` as
`router.use(auth.requireAuth)` **after** the `/login` route, so every other
`/admin/*` endpoint (`/clients`, `/stats`, `/settings`, `/errors`, …) is
protected automatically — new routes are protected by default.

---

## 7. Clients only see their own data

- The platform has a **single admin account** (ZJAI Technologies staff) —
  there is no per-client login. All client management happens through the
  admin panel.
- Each WhatsApp client is isolated by `phone_number_id`:
  `clientManager.getClientByPhoneNumberId()` matches every inbound webhook
  message to exactly one client's config (own Claude key/system
  prompt/personality).
- Conversation memory (`backend/src/memory.js`) is keyed by
  `clientId:userNumber`, so one client's conversations never leak into
  another's context.
- `GET /admin/clients/:id/logs` filters `logs.json` by `client_id` —
  `logsManager.getLogsForClient()` only ever returns that client's messages.

---

## 8. Phone numbers are masked in logs

- `backend/src/phone.js` exports `maskPhone()` (e.g. `+27821***67`), used in:
  - `backend/src/webhook.js` — incoming/outgoing message console logs
  - Error log entries written by `backend/src/errorLogger.js` for the
    "no client matched" case
- The admin panel's **Logs** page (`admin-panel/src/utils/format.js` →
  `maskPhoneNumber()`) masks numbers in the UI the same way.
- **Note:** `logs.json` itself stores the full customer number (needed for
  the admin panel's search-by-number filter). Treat `logs.json` and its
  daily backups as sensitive PII — they're already excluded from git via
  `.gitignore`, and `DATA_DIR` should point at storage only ZJAI staff can
  access.

---

## 9. Other production hardening already in place

- **Helmet** (`backend/server.js`) sets standard security headers
  (`X-Content-Type-Options`, `X-Frame-Options`, etc.).
- **Rate limiting** on `/admin/*` — 100 requests / 15 min per IP
  (`apiLimiter`). `/webhook` and `/health` are intentionally excluded: Meta
  delivers from a shared IP pool and a busy bot can legitimately exceed 100
  requests/15min.
- **HTTPS is enforced end-to-end** by the hosting platforms — Railway and
  Vercel both terminate TLS automatically, and Meta requires HTTPS for
  webhooks (see [DEPLOYMENT.md](DEPLOYMENT.md)).
- **`trust proxy`** is enabled so `req.ip` reflects the real client IP behind
  Railway's reverse proxy (required for rate limiting to work correctly).
- **Graceful shutdown** on `SIGTERM`/`SIGINT` lets in-flight requests finish
  before the process exits (Railway sends `SIGTERM` on redeploys/restarts).
- **Errors are logged, not leaked** — `backend/src/errorLogger.js` writes
  stack traces to `DATA_DIR/error-logs/` (viewable via `GET /admin/errors`,
  JWT-protected); API responses to clients only ever say `"Internal server
  error"`.

---

## Pre-launch checklist

- [ ] `NODE_ENV=production` set in Railway
- [ ] Fresh `JWT_SECRET`, `ADMIN_PASS`, `VERIFY_TOKEN` generated (not the
      example values)
- [ ] `APP_SECRET` set to your Meta App's App Secret
- [ ] `ALLOWED_ORIGINS` set to your real admin panel URL(s) — no `*`
- [ ] `DATA_DIR` points at a Railway volume (persists `clients.json`,
      `logs.json`, `settings.json`, backups, and error logs across deploys)
- [ ] Admin password changed from any shared/example value
- [ ] Each client's `whatsapp_token` is a permanent **System User** token,
      not a 24h temporary token
- [ ] `clients.json` / `logs.json` / `settings.json` are not committed to git
