'use strict';
/**
 * Authentication helpers: JWT access/refresh tokens + bcrypt passwords.
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const config = require('./config');

// In-memory set of valid refresh tokens (rotated on use).
// For multi-instance deployments this would live in Redis.
const validRefreshTokens = new Set();

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function signRefreshToken(user) {
  // jti makes every refresh token unique, even when issued in the same
  // second — otherwise rotation could re-issue an identical token string
  // and revocation-by-value would silently fail.
  return jwt.sign(
    { sub: user.id, type: 'refresh', jti: randomUUID() },
    config.jwtSecret,
    { expiresIn: config.refreshExpiresIn }
  );
}

/** Issue a fresh access + refresh token pair. */
function issueTokens(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  validRefreshTokens.add(refreshToken);
  return { accessToken, refreshToken };
}

/**
 * Rotate a refresh token: verifies it, revokes it, and issues a new pair.
 * Throws on invalid/expired/revoked tokens.
 */
function rotateRefreshToken(oldToken) {
  const payload = jwt.verify(oldToken, config.jwtSecret);
  if (payload.type !== 'refresh' || !validRefreshTokens.has(oldToken)) {
    throw new Error('Invalid refresh token');
  }
  validRefreshTokens.delete(oldToken);
  // NOTE: we only have the user id in the refresh token; the caller should
  // re-issue with a full user object for a correct role claim. To keep the
  // flow simple we re-sign with the stored payload's sub and look the user
  // up in the route handler.
  return payload;
}

function revokeRefreshToken(token) {
  validRefreshTokens.delete(token);
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  issueTokens,
  rotateRefreshToken,
  revokeRefreshToken,
  hashPassword,
  comparePassword,
};
