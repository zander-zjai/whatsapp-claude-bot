'use strict';

require('dotenv').config();

if (process.env.CLIENTS_JSON) {
  const fs = require('fs');
  const { dataPath } = require('./src/fileStore');
  fs.writeFileSync(dataPath('clients.json'), process.env.CLIENTS_JSON);
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { log, logError } = require('./src/logger');
const errorLogger = require('./src/errorLogger');
const clientManager = require('./src/clientManager');
const memory = require('./src/memory');
const settingsManager = require('./src/settingsManager');
const logsManager = require('./src/logsManager');
const conversationManager = require('./src/conversationManager');
const quoteManager = require('./src/quoteManager');
const quoteReminders = require('./src/quoteReminders');
const { verifyWebhook, verifyMetaSignature, handleWebhook } = require('./src/webhook');
const adminRoutes = require('./src/adminRoutes');
const clientPortalRoutes = require('./src/clientPortalRoutes');
const { version: APP_VERSION } = require('./package.json');

const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------------
// Startup: load persisted config before accepting traffic.
// ------------------------------------------------------------------
try {
  const loaded = clientManager.loadClients();
  log(`Loaded ${loaded.length} client(s) from clients.json`);
} catch (err) {
  logError('Failed to load clients.json:', err.message);
  process.exit(1);
}

settingsManager.loadSettings();
logsManager.loadLogs();
conversationManager.load();
quoteManager.load();

// Drop error-log files older than 7 days, then once a day thereafter.
errorLogger.cleanupOldLogs();
setInterval(() => errorLogger.cleanupOldLogs(), 24 * 60 * 60 * 1000).unref();

// Nudge customers whose sent quote is about to expire, and check in on
// quotes that have gone quiet for 24+ hours. Runs once shortly after boot,
// then every 6 hours.
quoteReminders.runAll().catch((err) => logError('[quoteReminders] Initial run failed:', err.message));
setInterval(
  () => quoteReminders.runAll().catch((err) => logError('[quoteReminders] Run failed:', err.message)),
  6 * 60 * 60 * 1000
).unref();

if (!process.env.VERIFY_TOKEN) {
  logError('VERIFY_TOKEN is not set in .env — Meta webhook verification will fail.');
}
if (!process.env.JWT_SECRET) {
  logError('JWT_SECRET is not set in .env — admin panel login will fail.');
}
if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS) {
  logError('ADMIN_USER / ADMIN_PASS are not set in .env — admin panel login will fail.');
}
if (!process.env.APP_SECRET) {
  log('APP_SECRET is not set — Meta webhook signature verification is DISABLED (set it in production).');
}

const app = express();

// Railway (and most PaaS providers) sit behind a reverse proxy. Trust the
// first hop so req.ip / X-Forwarded-* are correct (required for rate limiting).
app.set('trust proxy', 1);

app.use(helmet());

// Comma-separated list of origins allowed to call the admin API, e.g.
// "https://admin.zjaitechnologies.com,https://zjai-admin.vercel.app".
// Falls back to the legacy CORS_ORIGIN var, then "*" for local dev.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  })
);

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Capture the raw request body so POST /webhook can verify Meta's
// X-Hub-Signature-256 header.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// ------------------------------------------------------------------
// Rate limiting — 100 requests / 15 min per IP on the admin API.
// (The /webhook and /health routes are excluded: Meta delivers from a
// shared pool of IPs and message volume can legitimately be high.)
// ------------------------------------------------------------------
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// ------------------------------------------------------------------
// WhatsApp webhook
// ------------------------------------------------------------------
app.get('/webhook', verifyWebhook);
app.post('/webhook', verifyMetaSignature, handleWebhook);

// ------------------------------------------------------------------
// GET /health — public, used by uptime monitors (e.g. UptimeRobot)
// ------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    company: 'ZJAI Technologies',
    uptime: Math.floor(process.uptime()),
    active_clients: clientManager.getActiveClients().length,
    total_clients: clientManager.getAllClients().length,
    active_conversations: memory.activeConversationCount(),
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  });
});

// ------------------------------------------------------------------
// Admin panel API (rate-limited + JWT-protected, except /admin/login)
// ------------------------------------------------------------------
app.use('/admin', apiLimiter, adminRoutes);

// ------------------------------------------------------------------
// Client Portal API (rate-limited + client-JWT-protected, except /client/login)
// ------------------------------------------------------------------
app.use('/client', apiLimiter, clientPortalRoutes);

// ------------------------------------------------------------------
// Fallback 404 + error handler
// ------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  logError('Unhandled Express error:', err.message);
  errorLogger.logErrorToFile('Unhandled Express error', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  log(`ZJAI WhatsApp Claude bot listening on port ${PORT}`);
  log(`Health check:  http://localhost:${PORT}/health`);
  log(`Admin API:     http://localhost:${PORT}/admin`);
});

// ------------------------------------------------------------------
// Graceful shutdown — let in-flight requests finish before exiting.
// ------------------------------------------------------------------
function shutdown(signal) {
  log(`${signal} received, shutting down gracefully...`);
  server.close(() => {
    log('HTTP server closed.');
    process.exit(0);
  });
  // Don't hang forever if a connection never closes.
  setTimeout(() => {
    logError('Forcing shutdown after 10s timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Guard against silent crashes.
process.on('unhandledRejection', (reason) => {
  logError('Unhandled promise rejection:', reason);
  errorLogger.logErrorToFile('Unhandled promise rejection', reason);
});
process.on('uncaughtException', (err) => {
  logError('Uncaught exception:', err);
  errorLogger.logErrorToFile('Uncaught exception', err);
});
