'use strict';
/**
 * MOB Guard data store.
 *
 * In-memory state with debounced JSON-file persistence (DATA_FILE).
 * This lets the backend run with zero external services.
 *
 * The store exposes a repository-style API (listDevices, getDevice,
 * listTelemetry, ...) so a Postgres/TimescaleDB adapter can replace the
 * JSON file backend later without touching the routes.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const MAX_TELEMETRY = 2000; // cap total telemetry records kept in the file
const SALT_ROUNDS = 10;

function isoNow() {
  return new Date().toISOString();
}

/** Seed data mirroring the original demo (scripts/api.js). */
function seedState() {
  const now = isoNow();
  const devices = [
    { id: 'MOB-001', crewName: 'Captain Smith', role: 'Captain', status: 'online', battery: 94, lat: 25.76934, lng: -80.17591, signal: -75.4, heartRate: 72, bodyTemp: 36.8, motionScore: 12, waterContact: false, alert: false, lastSeen: now, createdAt: now },
    { id: 'MOB-002', crewName: 'John Doe', role: 'Deck Hand', status: 'online', battery: 67, lat: 25.75043, lng: -80.18594, signal: -110.2, heartRate: 105, bodyTemp: 35.2, motionScore: 89, waterContact: true, alert: true, lastSeen: now, createdAt: now },
    { id: 'MOB-003', crewName: 'Jane Wilson', role: 'Deck Hand', status: 'offline', battery: 12, lat: 25.76066, lng: -80.17218, signal: -113.3, heartRate: 0, bodyTemp: 0, motionScore: 0, waterContact: false, alert: false, lastSeen: new Date(Date.now() - 600000).toISOString(), createdAt: now },
    { id: 'MOB-004', crewName: 'Mike Johnson', role: 'Engineer', status: 'online', battery: 88, lat: 25.75581, lng: -80.17028, signal: -74.2, heartRate: 68, bodyTemp: 36.6, motionScore: 15, waterContact: false, alert: false, lastSeen: now, createdAt: now },
  ];

  const telemetry = [];
  devices.forEach((d) => {
    for (let j = 0; j < 10; j++) {
      telemetry.push({
        id: `${d.id}-seed-${j}`,
        deviceId: d.id,
        time: new Date(Date.now() - j * 5 * 60000).toISOString(),
        lat: +(d.lat + (Math.random() - 0.5) * 0.01).toFixed(7),
        lng: +(d.lng + (Math.random() - 0.5) * 0.01).toFixed(7),
        signal: +(d.signal + (Math.random() - 0.5) * 8).toFixed(1),
        heartRate: d.alert ? 95 + Math.floor(Math.random() * 20) : 65 + Math.floor(Math.random() * 15),
        bodyTemp: +(36.5 + Math.random()).toFixed(1),
        motion: Math.floor(Math.random() * 30),
        water: d.waterContact,
      });
    }
  });

  return {
    version: 1,
    users: [
      { id: 1, username: 'admin', email: 'admin@mobguard.io', role: 'admin', passwordHash: bcrypt.hashSync('admin123', SALT_ROUNDS), createdAt: now },
      { id: 2, username: 'viewer', email: 'viewer@mobguard.io', role: 'viewer', passwordHash: bcrypt.hashSync('viewer123', SALT_ROUNDS), createdAt: now },
    ],
    devices,
    telemetry,
    alerts: [
      { id: 1, deviceId: 'MOB-002', type: 'MAN OVERBOARD', severity: 'Critical', message: 'Water contact + GPS drift detected for MOB-002 (John Doe)', active: true, createdAt: new Date(Date.now() - 0).toISOString(), resolvedAt: null },
      { id: 2, deviceId: 'MOB-003', type: 'RSSI LOW', severity: 'High', message: 'Signal strength critical (-113 dBm) for device MOB-003', active: true, createdAt: new Date(Date.now() - 62000).toISOString(), resolvedAt: null },
      { id: 3, deviceId: 'MOB-001', type: 'GPS DRIFT', severity: 'Medium', message: 'GPS accuracy degraded for device MOB-001 (5.2m CEP)', active: true, createdAt: new Date(Date.now() - 124000).toISOString(), resolvedAt: null },
    ],
    contacts: [],
    seq: { alert: 4, user: 3 },
  };
}

function safeUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u; // never expose the hash
  return rest;
}

function createStore(dataFile) {
  let state;
  let seeded = false;
  try {
    state = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch (err) {
    state = seedState();
    seeded = true;
  }
  state.seq = state.seq || { alert: 1, user: 1 };
  state.contacts = state.contacts || [];

  let timer = null;
  function persistNow() {
    try {
      fs.mkdirSync(path.dirname(dataFile), { recursive: true });
      fs.writeFileSync(dataFile, JSON.stringify(state, null, 2));
    } catch (err) {
      console.error('[mob-guard] Failed to persist data file:', err.message);
    }
  }
  /** Debounced write — call after mutations. */
  function saveSoon() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; persistNow(); }, 500);
  }
  if (seeded) persistNow();

  // ---------- devices ----------
  function listDevices() {
    return state.devices.map((d) => ({ ...d }));
  }
  function getDevice(id) {
    const d = state.devices.find((x) => x.id === id);
    return d ? { ...d } : null;
  }
  function nextDeviceId() {
    let n = state.devices.length + 1;
    while (state.devices.find((d) => d.id === `MOB-${String(n).padStart(3, '0')}`)) n++;
    return `MOB-${String(n).padStart(3, '0')}`;
  }
  const DEVICE_FIELDS = ['crewName', 'role', 'status', 'battery', 'lat', 'lng', 'signal', 'heartRate', 'bodyTemp', 'motionScore', 'waterContact', 'alert'];
  function createDevice(data) {
    const now = isoNow();
    const device = {
      id: data.id || nextDeviceId(),
      crewName: data.crewName || 'Unknown',
      role: data.role || 'Crew',
      status: data.status || 'offline',
      battery: data.battery != null ? data.battery : 100,
      lat: data.lat != null ? data.lat : 25.76,
      lng: data.lng != null ? data.lng : -80.17,
      signal: data.signal != null ? data.signal : -80,
      heartRate: data.heartRate || 0,
      bodyTemp: data.bodyTemp || 0,
      motionScore: data.motionScore || 0,
      waterContact: !!data.waterContact,
      alert: !!data.alert,
      lastSeen: now,
      createdAt: now,
    };
    state.devices.push(device);
    saveSoon();
    return { ...device };
  }
  function updateDevice(id, patch) {
    const d = state.devices.find((x) => x.id === id);
    if (!d) return null;
    for (const key of DEVICE_FIELDS) {
      if (patch[key] !== undefined) d[key] = patch[key];
    }
    d.lastSeen = isoNow();
    saveSoon();
    return { ...d };
  }

  // ---------- telemetry ----------
  function addTelemetry(rec) {
    const record = {
      id: `${rec.deviceId}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      deviceId: rec.deviceId,
      time: rec.time || isoNow(),
      lat: rec.lat, lng: rec.lng, signal: rec.signal,
      heartRate: rec.heartRate, bodyTemp: rec.bodyTemp,
      motion: rec.motion, water: !!rec.water,
    };
    state.telemetry.push(record);
    if (state.telemetry.length > MAX_TELEMETRY) {
      state.telemetry.splice(0, state.telemetry.length - MAX_TELEMETRY);
    }
    return record;
  }
  function listTelemetry(deviceId, { page = 1, limit = 50 } = {}) {
    page = Math.max(1, parseInt(page, 10) || 1);
    limit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const rows = state.telemetry
      .filter((t) => t.deviceId === deviceId)
      .sort((a, b) => (a.time < b.time ? 1 : -1));
    return { data: rows.slice((page - 1) * limit, page * limit), page, limit, total: rows.length };
  }
  function latestTelemetry(deviceId) {
    const rows = state.telemetry.filter((t) => t.deviceId === deviceId);
    return rows.length ? rows[rows.length - 1] : null;
  }

  // ---------- alerts ----------
  function listAlerts({ active } = {}) {
    let rows = state.alerts.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (active === 'true' || active === true) rows = rows.filter((a) => a.active);
    if (active === 'false' || active === false) rows = rows.filter((a) => !a.active);
    return rows.map((a) => ({ ...a }));
  }
  function getAlert(id) {
    const a = state.alerts.find((x) => x.id === Number(id));
    return a ? { ...a } : null;
  }
  function activeAlert(deviceId, type) {
    return state.alerts.find((a) => a.active && a.deviceId === deviceId && a.type === type);
  }
  function createAlert({ deviceId, type, severity, message }) {
    const alert = {
      id: state.seq.alert++,
      deviceId, type,
      severity: severity || 'Medium',
      message: message || `${type} for ${deviceId}`,
      active: true,
      createdAt: isoNow(),
      resolvedAt: null,
    };
    state.alerts.unshift(alert);
    saveSoon();
    return { ...alert };
  }
  function resolveAlert(id) {
    const a = state.alerts.find((x) => x.id === Number(id));
    if (!a) return null;
    a.active = false;
    a.resolvedAt = isoNow();
    // Clear the device-level MOB flag when a MAN OVERBOARD alert is resolved.
    if (a.type === 'MAN OVERBOARD') {
      const d = state.devices.find((x) => x.id === a.deviceId);
      if (d) { d.alert = false; d.waterContact = false; }
    }
    saveSoon();
    return { ...a };
  }

  // ---------- users ----------
  function listUsers() {
    return state.users.map(safeUser);
  }
  function getUser(id) {
    return safeUser(state.users.find((u) => u.id === Number(id)));
  }
  function findUserByUsername(username) {
    return state.users.find((u) => u.username === username) || null; // internal: includes hash
  }
  async function createUser({ username, email, role, password }) {
    const user = {
      id: state.seq.user++,
      username, email: email || '',
      role: role || 'viewer',
      passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
      createdAt: isoNow(),
    };
    state.users.push(user);
    saveSoon();
    return safeUser(user);
  }
  async function updateUser(id, patch) {
    const u = state.users.find((x) => x.id === Number(id));
    if (!u) return null;
    if (patch.username !== undefined) u.username = patch.username;
    if (patch.email !== undefined) u.email = patch.email;
    if (patch.role !== undefined) u.role = patch.role;
    if (patch.password) u.passwordHash = await bcrypt.hash(patch.password, SALT_ROUNDS);
    saveSoon();
    return safeUser(u);
  }
  function deleteUser(id) {
    const idx = state.users.findIndex((x) => x.id === Number(id));
    if (idx === -1) return false;
    state.users.splice(idx, 1);
    saveSoon();
    return true;
  }

  // ---------- contact inquiries ----------
  function addContact({ name, email, organization, message }) {
    const inquiry = { id: state.contacts.length + 1, name, email, organization: organization || '', message, createdAt: isoNow() };
    state.contacts.push(inquiry);
    saveSoon();
    console.log(`[mob-guard] New contact inquiry from ${name} <${email}>`);
    return inquiry;
  }
  function listContacts() {
    return state.contacts.map((c) => ({ ...c }));
  }

  return {
    saveSoon, persistNow,
    listDevices, getDevice, createDevice, updateDevice,
    addTelemetry, listTelemetry, latestTelemetry,
    listAlerts, getAlert, activeAlert, createAlert, resolveAlert,
    listUsers, getUser, findUserByUsername, createUser, updateUser, deleteUser,
    addContact, listContacts,
  };
}

module.exports = { createStore, safeUser };
