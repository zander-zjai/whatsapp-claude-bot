# Custom domain setup

By default Railway gives you `https://<something>.up.railway.app` and Vercel
gives you `https://<something>.vercel.app`. Both work fine with Meta's
webhook (HTTPS is required and both platforms provide it automatically) — but
for a professional setup, point your own domains at them:

- `api.zjaitechnologies.com` → backend (Railway)
- `admin.zjaitechnologies.com` → admin panel (Vercel)

This assumes you own `zjaitechnologies.com` and manage its DNS (e.g. via
Cloudflare, Namecheap, GoDaddy, Route 53). Replace the domain with your own
throughout.

---

## 1. Backend — `api.zjaitechnologies.com` → Railway

1. Railway dashboard → your service → **Settings → Networking → Custom
   Domain → Add Domain**.
2. Enter `api.zjaitechnologies.com`. Railway shows a CNAME target like:
   ```
   zjai-bot.up.railway.app
   ```
3. In your DNS provider, add:

   | Type  | Name | Value                      | TTL  |
   | ----- | ---- | -------------------------- | ---- |
   | CNAME | `api` | `zjai-bot.up.railway.app` | Auto / 3600 |

4. Wait for DNS to propagate (a few minutes to a few hours), then Railway
   issues a TLS certificate automatically. Verify:
   ```bash
   curl https://api.zjaitechnologies.com/health
   ```

---

## 2. Admin panel — `admin.zjaitechnologies.com` → Vercel

1. Vercel dashboard → your project → **Settings → Domains → Add**.
2. Enter `admin.zjaitechnologies.com`. Vercel shows a CNAME target:
   ```
   cname.vercel-dns.com
   ```
3. In your DNS provider, add:

   | Type  | Name   | Value               | TTL  |
   | ----- | ------ | ------------------- | ---- |
   | CNAME | `admin` | `cname.vercel-dns.com` | Auto / 3600 |

4. Vercel verifies the domain and provisions TLS automatically. Verify:
   ```bash
   curl -I https://admin.zjaitechnologies.com
   ```

---

## 3. Update environment variables for the new domains

Once both custom domains resolve and serve HTTPS:

**Railway → Variables:**
```
ALLOWED_ORIGINS=https://admin.zjaitechnologies.com
```

**Vercel → Settings → Environment Variables:**
```
VITE_API_URL=https://api.zjaitechnologies.com
```

Redeploy both (`railway up` / `vercel --prod`, or just push to `main` if
[CI/CD](DEPLOYMENT.md#optional-next-steps) is set up) so the new values take
effect.

---

## 4. Update the Meta webhook URL

1. https://developers.facebook.com → your App → **WhatsApp →
   Configuration**.
2. Update the **Callback URL** to:
   ```
   https://api.zjaitechnologies.com/webhook
   ```
3. The **Verify token** stays the same (`VERIFY_TOKEN`).
4. Click **Verify and Save**. Check Railway logs (`railway logs`) for
   `Webhook verified successfully by Meta`.
5. Send a test WhatsApp message to confirm the bot still replies.

> If you have multiple clients, each with their own Meta App, repeat step 4
> for each one — they all point at the same `/webhook` URL; routing to the
> correct client happens by `phone_number_id` inside the backend.

---

## DNS troubleshooting

- **`NXDOMAIN` / domain not resolving:** check propagation with
  `nslookup api.zjaitechnologies.com` or https://dnschecker.org. CNAME
  changes can take up to 24-48 hours in rare cases, though usually minutes.
- **TLS certificate pending:** both Railway and Vercel auto-issue
  Let's-Encrypt-backed certs once the CNAME resolves correctly — this can lag
  a few minutes behind DNS propagation.
- **CORS errors in the browser console after switching domains:** make sure
  `ALLOWED_ORIGINS` was updated and the backend redeployed — see
  [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
