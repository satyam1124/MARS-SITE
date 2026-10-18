'use strict';
const express = require('express');
const { requireAuth } = require('../middleware');

module.exports = function alertRoutes(store, emit) {
  const r = express.Router();

  // GET /api/alerts?active=true → list alerts (filterable)
  r.get('/', (req, res) => {
    res.json(store.listAlerts({ active: req.query.active }));
  });

  // POST /api/alerts/mob → trigger a MAN OVERBOARD event (auth required)
  // NOTE: registered before '/:id/resolve' so 'mob' is not treated as an id.
  r.post('/mob', requireAuth, (req, res) => {
    const { deviceId } = req.body || {};
    if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
    const device = store.getDevice(deviceId);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const vessel = store.getVessel();
    store.updateDevice(deviceId, {
      alert: true,
      waterContact: true,
      motionScore: 95,
      mobDrift: { dirDeg: 100, speedKnots: 0.6, startedAt: new Date().toISOString() },
    });
    const updated = store.getDevice(deviceId);
    const alert = store.createAlert({
      deviceId,
      type: 'MAN OVERBOARD',
      severity: 'Critical',
      message: `Water contact + abnormal motion detected for ${deviceId} (${updated.crewName}) — vessel at ${vessel.lat.toFixed(5)}, ${vessel.lng.toFixed(5)}`,
    });

    const mobPayload = {
      deviceId,
      crewName: updated.crewName,
      lat: updated.lat,
      lng: updated.lng,
      vesselLat: vessel.lat,
      vesselLng: vessel.lng,
      mobDrift: updated.mobDrift,
      timestamp: new Date().toISOString(),
    };
    emit('mob', mobPayload);
    emit('alert', alert);
    res.status(201).json({ alert, device: updated });
  });

  // POST /api/alerts/:id/resolve → resolve an alert (auth required)
  r.post('/:id/resolve', requireAuth, (req, res) => {
    const alert = store.resolveAlert(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    emit('alertResolved', alert);
    res.json(alert);
  });

  return r;
};
