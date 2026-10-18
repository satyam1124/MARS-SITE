'use strict';
/**
 * Telemetry simulation engine.
 *
 * Every SIM_INTERVAL_MS the engine drifts each online device's GPS position,
 * fluctuates signal/heart-rate/temperature, drains the battery, appends a
 * telemetry record, and broadcasts it via the provided `emit(event, payload)`
 * callback (wired to Socket.io + raw WebSocket in app.js).
 *
 * It also raises automatic alerts:
 *  - water contact        → MAN OVERBOARD (+ 'mob' event)
 *  - signal < -110 dBm    → RSSI LOW
 *  - battery < 15%        → LOW BATTERY
 */
const config = require('./config');

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function maybeAutoAlert(store, device, emit, now) {
  // Man overboard
  if (device.waterContact && !store.activeAlert(device.id, 'MAN OVERBOARD')) {
    store.updateDevice(device.id, { alert: true });
    const alert = store.createAlert({
      deviceId: device.id,
      type: 'MAN OVERBOARD',
      severity: 'Critical',
      message: `Water contact + GPS drift detected for ${device.id} (${device.crewName})`,
    });
    emit('mob', { deviceId: device.id, crewName: device.crewName, lat: device.lat, lng: device.lng, timestamp: now });
    emit('alert', alert);
    return;
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

function tick(store, emit) {
  const now = new Date().toISOString();
  for (const d of store.listDevices()) {
    if (d.status === 'offline') continue;

    const patch = {
      lat: +(d.lat + (Math.random() - 0.5) * 0.0003).toFixed(7),
      lng: +(d.lng + (Math.random() - 0.5) * 0.0003).toFixed(7),
      signal: +clamp(d.signal + (Math.random() - 0.5) * 3, -125, -60).toFixed(1),
      heartRate: d.alert
        ? Math.round(95 + Math.random() * 20)
        : Math.round(clamp(d.heartRate + (Math.random() - 0.5) * 4, 58, 95)),
      bodyTemp: +clamp(d.bodyTemp + (Math.random() - 0.5) * 0.1, 35.0, 37.5).toFixed(1),
      motionScore: d.alert ? Math.round(80 + Math.random() * 20) : Math.round(5 + Math.random() * 25),
      battery: Math.max(0, +(d.battery - 0.02).toFixed(2)),
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

    // Docs-compatible telemetry payload.
    emit('telemetry', {
      deviceId: rec.deviceId,
      lat: rec.lat,
      lng: rec.lng,
      signal: rec.signal,
      heartRate: rec.heartRate,
      bodyTemp: rec.bodyTemp,
      motion: rec.motion,
      water: rec.water,
      timestamp: rec.time,
    });

    maybeAutoAlert(store, updated, emit, now);
  }
  store.saveSoon();
}

function startSimulation(store, emit, intervalMs = config.simIntervalMs) {
  const timer = setInterval(() => tick(store, emit), intervalMs);
  // Don't keep the process alive for tests that forget to stop.
  if (timer.unref) timer.unref();
  return {
    stop: () => clearInterval(timer),
    tick: () => tick(store, emit), // handy for tests
  };
}

module.exports = { startSimulation, tick };
