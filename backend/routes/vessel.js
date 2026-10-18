'use strict';
/**
 * Vessel state endpoints.
 *
 *  GET   /api/vessel        → vessel position/heading/speed (+ geofence radius)
 *  PATCH /api/vessel        → update vessel (admin only)
 */
const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware');
const config = require('../config');

module.exports = function vesselRoutes(store, getTrack) {
  const r = express.Router();

  // GET /api/vessel → current vessel state
  r.get('/', (req, res) => {
    res.json({
      ...store.getVessel(),
      geofenceRadiusM: config.geofenceRadiusM,
      track: getTrack ? getTrack() : [],
    });
  });

  // PATCH /api/vessel → update name / heading / speed (admin only)
  r.patch('/', requireAuth, requireAdmin, (req, res) => {
    const body = req.body || {};
    const patch = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 80) {
        return res.status(400).json({ error: 'name must be a non-empty string (max 80 chars)' });
      }
      patch.name = body.name.trim();
    }
    if (body.headingDeg !== undefined) {
      const h = Number(body.headingDeg);
      if (!Number.isFinite(h) || h < 0 || h > 360) {
        return res.status(400).json({ error: 'headingDeg must be a number between 0 and 360' });
      }
      patch.headingDeg = h;
    }
    if (body.speedKnots !== undefined) {
      const s = Number(body.speedKnots);
      if (!Number.isFinite(s) || s < 0 || s > 40) {
        return res.status(400).json({ error: 'speedKnots must be a number between 0 and 40' });
      }
      patch.speedKnots = s;
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nothing to update (name, headingDeg, speedKnots)' });
    }
    res.json({ ...store.updateVessel(patch), geofenceRadiusM: config.geofenceRadiusM });
  });

  return r;
};
