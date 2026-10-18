'use strict';
const express = require('express');
const { asyncHandler, requireAuth, requireAdmin, requireFields, isValidEmail } = require('../middleware');

const VALID_ROLES = ['admin', 'viewer'];

module.exports = function userRoutes(store) {
  const r = express.Router();

  // All user management is admin-only.
  r.use(requireAuth, requireAdmin);

  // GET /api/users → list users (password hashes never included)
  r.get('/', (req, res) => {
    res.json(store.listUsers());
  });

  // POST /api/users → create user
  r.post('/', asyncHandler(async (req, res) => {
    const err = requireFields(req.body || {}, ['username', 'password']);
    if (err) return res.status(400).json({ error: err });
    const { username, email, role, password } = req.body;
    if (store.findUserByUsername(username)) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    res.status(201).json(await store.createUser({ username, email, role, password }));
  }));

  // PATCH /api/users/:id → update user
  r.patch('/:id', asyncHandler(async (req, res) => {
    const { username, email, role, password } = req.body || {};
    const existing = store.getUser(req.params.id);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    if (username && username !== existing.username && store.findUserByUsername(username)) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    // Prevent removing the last admin.
    if (existing.role === 'admin' && role && role !== 'admin') {
      const admins = store.listUsers().filter((u) => u.role === 'admin');
      if (admins.length === 1) {
        return res.status(400).json({ error: 'Cannot demote the last admin user' });
      }
    }
    res.json(await store.updateUser(req.params.id, { username, email, role, password }));
  }));

  // DELETE /api/users/:id → delete user
  r.delete('/:id', (req, res) => {
    const existing = store.getUser(req.params.id);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    if (existing.role === 'admin') {
      const admins = store.listUsers().filter((u) => u.role === 'admin');
      if (admins.length === 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin user' });
      }
    }
    if (Number(req.params.id) === req.user.sub) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    store.deleteUser(req.params.id);
    res.json({ ok: true });
  });

  return r;
};
