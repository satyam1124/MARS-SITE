'use strict';
/**
 * Marine weather proxy.
 *
 *  GET /api/weather?lat=<num>&lng=<num>
 *
 * Proxies the free Open-Meteo marine API (no API key required):
 *   https://marine-api.open-meteo.com/v1/marine
 *
 * Responses are cached in memory for 10 minutes per (rounded) coordinate.
 * On upstream failure the endpoint degrades gracefully to
 * `{ unavailable: true }` instead of erroring.
 */
const express = require('express');

const CACHE_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const cache = new Map(); // key -> { expiresAt, payload }

function cacheKey(lat, lng) {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`upstream status ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Marine conditions come from the marine API; wind is NOT available there
 * (it returns null), so wind comes from the forecast API. Either call may
 * fail independently — wind is best-effort, marine data is required.
 */
async function fetchMarine(lat, lng) {
  const q = `latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&timezone=auto`;
  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?${q}` +
    '&current=wave_height,ocean_current_velocity';
  const windUrl =
    `https://api.open-meteo.com/v1/forecast?${q}` +
    '&current=wind_speed_10m,wind_direction_10m';
  const [marine, wind] = await Promise.allSettled([fetchJson(marineUrl), fetchJson(windUrl)]);
  if (marine.status === 'rejected') throw marine.reason;
  return { marine: marine.value, wind: wind.status === 'fulfilled' ? wind.value : null };
}

function shapePayload(lat, lng, upstream) {
  const mcur = (upstream.marine && upstream.marine.current) || {};
  const wcur = (upstream.wind && upstream.wind.current) || {};
  // NOTE: the marine API reports ocean_current_velocity in km/h.
  const currentKmh = mcur.ocean_current_velocity;
  return {
    lat,
    lng,
    waveHeightM: mcur.wave_height ?? null,
    windSpeedKmh: wcur.wind_speed_10m ?? null,
    windDirectionDeg: wcur.wind_direction_10m ?? null,
    oceanCurrentMs: currentKmh != null ? +(currentKmh / 3.6).toFixed(2) : null,
    units: { waveHeight: 'm', windSpeed: 'km/h', windDirection: '°', oceanCurrent: 'm/s' },
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = function weatherRoutes() {
  const r = express.Router();

  // GET /api/weather?lat=..&lng=..
  r.get('/', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({ error: 'lat must be a number between -90 and 90' });
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'lng must be a number between -180 and 180' });
    }

    const key = cacheKey(lat, lng);
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return res.json({ ...hit.payload, cached: true });
    }

    try {
      const upstream = await fetchMarine(lat, lng);
      const payload = shapePayload(lat, lng, upstream);
      cache.set(key, { expiresAt: Date.now() + CACHE_MS, payload });
      return res.json({ ...payload, cached: false });
    } catch (err) {
      // Graceful degradation — the dashboard shows "unavailable".
      return res.json({ lat, lng, unavailable: true, fetchedAt: new Date().toISOString() });
    }
  });

  return r;
};
