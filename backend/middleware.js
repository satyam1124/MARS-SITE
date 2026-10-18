'use strict';
/**
 * Shared Express middleware: auth, roles, async errors, validation helpers.
 */
const jwt = require('jsonwebtoken');
const config = require('./config');

/** Wrap async route handlers so rejections reach the error handler. */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** Require a valid Bearer JWT. Sets req.user = { sub, username, role }. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.type === 'refresh') {
      return res.status(401).json({ error: 'Refresh token cannot be used here' });
    }
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Require the authenticated user to have the admin role. */
function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Admin access required' });
}

/**
 * Validate that required fields are present and non-empty.
 * Returns an error message string, or null when valid.
 */
function requireFields(body, fields) {
  const missing = fields.filter((f) => {
    const v = body[f];
    return v === undefined || v === null || String(v).trim() === '';
  });
  return missing.length ? `Missing required field(s): ${missing.join(', ')}` : null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
}

/** JSON 404 for unknown /api routes. */
function apiNotFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

/** Final error handler — never leaks stack traces to clients. */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error('[mob-guard] Request error:', err.message);
  const status = err.status || 500;
  res.status(status).json({ error: err.expose ? err.message : 'Internal server error' });
}

module.exports = { asyncHandler, requireAuth, requireAdmin, requireFields, isValidEmail, apiNotFound, errorHandler };
