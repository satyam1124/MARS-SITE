'use strict';
/**
 * Vessel-centric telemetry simulation engine.
 *
 * Physics model:
 *  - The VESSEL moves along its heading at speedKnots. Crew are ON the
 *    vessel: each device's position = vessel position + its deck offset
 *    (meters) + tiny ±2 m jitter. Crew never drift independently.
 *  - MAN OVERBOARD: the device detaches from the vessel and drifts with
 *    ocean current (0.5 kt) + wind leeway. Its distance from the vessel
 *    grows over time; waterContact=true and heart rate stays elevated.
 *  - Geofence: any non-MOB device further than GEOFENCE_RADIUS_M from the
 *    vessel raises a GEOFENCE warning.
 *
 * Every SIM_INTERVAL_MS the engine moves the vessel, updates devices,
 * appends telemetry records, and broadcasts via `emit(event, payload)`
 * (wired to Socket.io + raw WebSocket in app.js).
 */
const config = require('./config');

const KNOTS_TO_MS = 0.514444;
const METERS_PER_DEG_LAT = 111320;
// Default drift: 0.5 kt ocean current toward 100° + wind leeway.
const DRIFT_DIR_DEG = 100;
const DRIFT_SPEED_KNOTS = 0.6;

// In-memory vessel track (last N positions) for the map polyline.
// Not persisted — rebuilt naturally as the sim runs.
const vesselTrack = [];
const MAX_TRACK = 50;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/** Move a lat/lng point by distM meters along bearingDeg. Returns [lat, lng]. */
function moveByMeters(lat, lng, distM, bearingDeg) {
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (distM * Math.cos(rad)) / METERS_PER_DEG_LAT;
  const dLng = (distM * Math.sin(rad)) / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  return [lat + dLat, lng + dLng];
}

/** Great-circle-ish distance in meters (equirectangular, fine for <10 km). */
function distMeters(aLat, aLng, bLat, bLng) {
  const dLatM = (aLat - bLat) * METERS_PER_DEG_LAT;
  const dLngM = (aLng - bLng) * METERS_PER_DEG_LAT * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dLatM, dLngM);
}

function getVesselTrack() {
  return vesselTrack.map((p) => ({ ...p }));
}

function maybeAutoAlert(store, device, emit, now, vessel) {
  // Man overboard — detach the device so it starts drifting.
  if (device.waterContact && !store.activeAlert(device.id, 'MAN OVERBOARD')) {
    const drift = { dirDeg: DRIFT_DIR_DEG, speedKnots: DRIFT_SPEED_KNOTS, startedAt: now };
    store.updateDevice(device.id, { alert: true, mobDrift: drift });
    const alert = store.createAlert({
      deviceId: device.id,
      type: 'MAN OVERBOARD',
      severity: 'Critical',
      message: `Water contact detected for ${device.id} (${device.crewName}) — vessel at ${vessel.lat.toFixed(5)}, ${vessel.lng.toFixed(5)}`,
    });
    emit('mob', {
      deviceId: device.id,
      crewName: device.crewName,
      lat: device.lat,
      lng: device.lng,
      vesselLat: vessel.lat,
      vesselLng: vessel.lng,
      drift,
      timestamp: now,
    });
    emit('alert', alert);
    return;
  }
  // Geofence: non-MOB device outside the vessel radius.
  const d = distMeters(device.lat, device.lng, vessel.lat, vessel.lng);
  if (!device.alert && d > config.geofenceRadiusM && !store.activeAlert(device.id, 'GEOFENCE')) {
    const alert = store.createAlert({
      deviceId: device.id,
      type: 'GEOFENCE',
      severity: 'High',
      message: `Device ${device.id} (${device.crewName}) is ${Math.round(d)} m from vessel — outside ${config.geofenceRadiusM} m geofence`,
    });
    emit('alert', alert);
  }
  // Weak signal
  if (device.signal < -110 && !store.activeAlert(device.id, 'RSSI LOW')) {
    const alert = store.createAlert({
      deviceId: device.id,
      type: 'RSSI LOW',
      severity: 'High',
      message: `Signal strength critical (${device.signal.toFixed(0)} dBm) for device ${device.id}`,
    });
    emit('alert', alert);
  }
  // Low battery
  if (device.battery < 15 && !store.activeAlert(device.id, 'LOW BATTERY')) {
    const alert = store.createAlert({
      deviceId: device.id,
      type: 'LOW BATTERY',
      severity: 'Medium',
      message: `Battery low (${device.battery.toFixed(0)}%) on device ${device.id}`,
    });
    emit('alert', alert);
  }
}

function tick(store, emit, intervalMs = config.simIntervalMs) {
  const now = new Date().toISOString();
  const dtSec = intervalMs / 1000;

  // ---- 1. Move the vessel along its heading ----
  const vessel = store.getVessel();
  const vesselDistM = vessel.speedKnots * KNOTS_TO_MS * dtSec;
  const [vLat, vLng] = moveByMeters(vessel.lat, vessel.lng, vesselDistM, vessel.headingDeg);
  store.updateVessel({ lat: +vLat.toFixed(7), lng: +vLng.toFixed(7) });
  vesselTrack.push({ lat: +vLat.toFixed(7), lng: +vLng.toFixed(7), time: now });
  if (vesselTrack.length > MAX_TRACK) vesselTrack.shift();
  const v = store.getVessel();

  // ---- 2. Update every device relative to the vessel ----
  for (const d of store.listDevices()) {
    if (d.status === 'offline') continue;

    const isMob = d.alert && d.waterContact;
    let lat;
    let lng;

    if (isMob) {
      // Detached: drift with current + leeway, away from the vessel.
      const drift = d.mobDrift || { dirDeg: DRIFT_DIR_DEG, speedKnots: DRIFT_SPEED_KNOTS };
      const distM = drift.speedKnots * KNOTS_TO_MS * dtSec;
      [lat, lng] = moveByMeters(d.lat, d.lng, distM, drift.dirDeg);
    } else {
      // On board: vessel position + deck offset + ±2 m jitter.
      const off = d.deckOffset || { xMeters: 0, yMeters: 0 };
      const jx = (Math.random() - 0.5) * 4;
      const jy = (Math.random() - 0.5) * 4;
      lat = v.lat + (off.yMeters + jy) / METERS_PER_DEG_LAT;
      lng = v.lng + (off.xMeters + jx) / (METERS_PER_DEG_LAT * Math.cos((v.lat * Math.PI) / 180));
    }

    const patch = {
      lat: +lat.toFixed(7),
      lng: +lng.toFixed(7),
      signal: +clamp(d.signal + (Math.random() - 0.5) * 3, -125, -60).toFixed(1),
      heartRate: isMob
        ? Math.round(95 + Math.random() * 20)
        : Math.round(clamp(d.heartRate + (Math.random() - 0.5) * 4, 58, 95)),
      bodyTemp: +clamp(d.bodyTemp + (Math.random() - 0.5) * 0.1, 35.0, 37.5).toFixed(1),
      motionScore: isMob ? Math.round(80 + Math.random() * 20) : Math.round(5 + Math.random() * 25),
      battery: Math.max(0, +(d.battery - (isMob ? 0.05 : 0.02)).toFixed(2)),
      lastSeen: now,
    };
    const updated = store.updateDevice(d.id, patch);

    const rec = store.addTelemetry({
      deviceId: d.id,
      time: now,
      lat: updated.lat,
      lng: updated.lng,
      signal: updated.signal,
      heartRate: updated.heartRate,
      bodyTemp: updated.bodyTemp,
      motion: updated.motionScore,
      water: updated.waterContact,
    });

    // Docs-compatible telemetry payload, plus vessel context.
    emit('telemetry', {
      deviceId: rec.deviceId,
      lat: rec.lat,
      lng: rec.lng,
      signal: rec.signal,
      heartRate: rec.heartRate,
      bodyTemp: rec.bodyTemp,
      motion: rec.motion,
      water: rec.water,
      distToVesselM: Math.round(distMeters(rec.lat, rec.lng, v.lat, v.lng)),
      timestamp: rec.time,
    });

    maybeAutoAlert(store, updated, emit, now, v);
  }

  // ---- 3. Broadcast vessel state ----
  emit('vessel', {
    ...v,
    geofenceRadiusM: config.geofenceRadiusM,
    track: getVesselTrack(),
    timestamp: now,
  });

  store.saveSoon();
}

function startSimulation(store, emit, intervalMs = config.simIntervalMs) {
  const timer = setInterval(() => tick(store, emit, intervalMs), intervalMs);
  // Don't keep the process alive for tests that forget to stop.
  if (timer.unref) timer.unref();
  return {
    stop: () => clearInterval(timer),
    tick: () => tick(store, emit, intervalMs), // handy for tests
  };
}

module.exports = { startSimulation, tick, getVesselTrack, moveByMeters, distMeters };
