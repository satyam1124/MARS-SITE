'use strict';
const express = require('express');
const { requireAuth } = require('../middleware');

module.exports = function deviceRoutes(store) {
  const r = express.Router();

  // GET /api/devices → list all devices
  r.get('/', (req, res) => {
    res.json(store.listDevices());
  });

  // GET /api/devices/:id → device detail + latest telemetry
  r.get('/:id', (req, res) => {
    const device = store.getDevice(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json({ ...device, latestTelemetry: store.latestTelemetry(device.id) });
  });

  // POST /api/devices → register new device (auth required)
  r.post('/', requireAuth, (req, res) => {
    const body = req.body || {};
    if (body.id && store.getDevice(body.id)) {
      return res.status(409).json({ error: `Device ${body.id} already exists` });
    }
    if (body.status && !['online', 'offline'].includes(body.status)) {
      return res.status(400).json({ error: "status must be 'online' or 'offline'" });
    }
    res.status(201).json(store.createDevice(body));
  });

  // PATCH /api/devices/:id → update device config (auth required)
  r.patch('/:id', requireAuth, (req, res) => {
    const device = store.updateDevice(req.params.id, req.body || {});
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json(device);
  });

  return r;
};
