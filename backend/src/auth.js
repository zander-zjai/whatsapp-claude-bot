'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const settingsManager = require('./settingsManager');

// Production security requirement: admin sessions expire after 8 hours.
const TOKEN_EXPIRY = '8h';

function getJwtSecret() {
  return process.env.JWT_SECRET;
}

/**
 * Verify a username/password pair.
 *
 * Credentials stored via the Settings page (bcrypt hash in settings.json)
 * take priority over the .env defaults, so a password change persists
 * across restarts without editing .env.
 */
function verifyCredentials(username, password) {
  const settings = settingsManager.getSettings();

  if (settings.admin_user && settings.admin_pass_hash) {
    return username === settings.admin_user && bcrypt.compareSync(password, settings.admin_pass_hash);
  }

  return username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS;
}

/** Issue a signed JWT for a successful login. */
function issueToken(username) {
  return jwt.sign({ sub: username, role: 'admin' }, getJwtSecret(), {
    expiresIn: TOKEN_EXPIRY,
  });
}

/**
 * Express middleware: requires `Authorization: Bearer <token>`.
 * Attaches `req.admin = { username }` on success.
 */
function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.admin = { username: payload.sub };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Persist a new admin username/password (bcrypt-hashed) to settings.json.
 * Used by the Settings page's "change admin password" form.
 */
function setCredentials(username, password) {
  const hash = bcrypt.hashSync(password, 10);
  settingsManager.updateSettings({ admin_user: username, admin_pass_hash: hash });
}

module.exports = {
  verifyCredentials,
  issueToken,
  requireAuth,
  setCredentials,
};
