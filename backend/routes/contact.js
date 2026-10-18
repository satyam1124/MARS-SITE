'use strict';
const express = require('express');
const { requireFields, isValidEmail } = require('../middleware');

module.exports = function contactRoutes(store) {
  const r = express.Router();

  // POST /api/contact → store a landing-page inquiry (public)
  r.post('/', (req, res) => {
    const err = requireFields(req.body || {}, ['name', 'email', 'message']);
    if (err) return res.status(400).json({ error: err });
    const { name, email, organization, message } = req.body;
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    const inquiry = store.addContact({
      name: String(name).trim(),
      email: String(email).trim(),
      organization: organization ? String(organization).trim() : '',
      message: String(message).trim(),
    });
    res.status(201).json({ ok: true, id: inquiry.id });
  });

  return r;
};
