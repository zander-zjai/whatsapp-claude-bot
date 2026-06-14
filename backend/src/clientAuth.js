'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const clientManager = require('./clientManager');

// Client portal sessions are longer-lived than admin sessions (8h) since
// this is a business owner checking in from their phone, not an admin
// doing sensitive platform changes.
const TOKEN_EXPIRY = '30d';

function getJwtSecret() {
  return process.env.JWT_SECRET;
}

/**
 * Verify a client portal login (business email + portal password). Returns
 * the matching client object on success, or null if the email/password is
 * wrong or the client has no portal password set yet.
 */
function verifyClientCredentials(email, password) {
  const client = clientManager.getClientByEmail(email);
  if (!client || !client.client_password) return null;
  if (!bcrypt.compareSync(password, client.client_password)) return null;
  return client;
}

/** Issue a client-portal JWT. Separate token shape (role: 'client') from admin tokens. */
function issueClientToken(clientId) {
  return jwt.sign({ sub: clientId, role: 'client' }, getJwtSecret(), {
    expiresIn: TOKEN_EXPIRY,
  });
}

/**
 * Express middleware: requires a valid client-portal JWT (role: 'client')
 * for a client that still exists. Attaches req.clientId and req.client so
 * route handlers can scope every query to the logged-in client's own data.
 */
function requireClientAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (payload.role !== 'client') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const client = clientManager.getClientById(payload.sub);
    if (!client) {
      return res.status(401).json({ error: 'Client account no longer exists' });
    }

    req.clientId = payload.sub;
    req.client = client;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Hash and store a new portal password for a client. */
function setClientPassword(clientId, password) {
  const hash = bcrypt.hashSync(password, 10);
  return clientManager.setClientPasswordHash(clientId, hash);
}

/** Check a plaintext password against a client's stored portal password hash. */
function verifyPortalPassword(client, password) {
  if (!client.client_password) return false;
  return bcrypt.compareSync(password, client.client_password);
}

module.exports = {
  verifyClientCredentials,
  issueClientToken,
  requireClientAuth,
  setClientPassword,
  verifyPortalPassword,
};
