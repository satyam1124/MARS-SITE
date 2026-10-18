'use strict';
const express = require('express');
const { asyncHandler, requireFields } = require('../middleware');
const { issueTokens, rotateRefreshToken, comparePassword } = require('../auth');
const { safeUser } = require('../store');

module.exports = function authRoutes(store) {
  const r = express.Router();

  // POST /api/auth/login → { accessToken, refreshToken, user }
  r.post('/login', asyncHandler(async (req, res) => {
    const err = requireFields(req.body || {}, ['username', 'password']);
    if (err) return res.status(400).json({ error: err });

    const { username, password } = req.body;
    const user = store.findUserByUsername(username);
    if (!user || !(await comparePassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const tokens = issueTokens(user);
    res.json({ ...tokens, user: safeUser(user) });
  }));

  // POST /api/auth/refresh → { accessToken, refreshToken }
  r.post('/refresh', asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required' });
    let payload;
    try {
      payload = rotateRefreshToken(refreshToken);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    const user = store.getUser(payload.sub);
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    // Re-issue with the full user record so role claims stay correct.
    const full = store.findUserByUsername(user.username);
    res.json(issueTokens(full));
  }));

  return r;
};
