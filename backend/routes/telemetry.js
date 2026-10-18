'use strict';
const express = require('express');

module.exports = function telemetryRoutes(store) {
  const r = express.Router();

  // GET /api/telemetry/:deviceId?page=1&limit=50 → paginated history (newest first)
  r.get('/:deviceId', (req, res) => {
    if (!store.getDevice(req.params.deviceId)) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json(store.listTelemetry(req.params.deviceId, req.query));
  });

  return r;
};
