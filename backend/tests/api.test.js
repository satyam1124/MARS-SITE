'use strict';
/**
 * API tests for the MOB Guard backend.
 * Run: npm test   (node --test backend/tests/)
 *
 * Each test file boots the app on an ephemeral port with an isolated
 * temp data file, so tests never touch backend/data.json.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../app');

let base;
let server;
let adminToken;
let viewerToken;
let refreshToken;

async function api(method, p, { body, token } = {}) {
  const res = await fetch(base + p, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* non-JSON */ }
  return { status: res.status, json };
}

before(async () => {
  const dataFile = path.join(os.tmpdir(), `mob-test-${Date.now()}-${process.pid}.json`);
  const { server: srv } = createApp({ dataFile });
  server = srv;
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('health check', async () => {
  const { status, json } = await api('GET', '/health');
  assert.equal(status, 200);
  assert.equal(json.ok, true);
});

test('login succeeds with seed admin credentials', async () => {
  const { status, json } = await api('POST', '/auth/login', { body: { username: 'admin', password: 'admin123' } });
  assert.equal(status, 200);
  assert.ok(json.accessToken);
  assert.ok(json.refreshToken);
  assert.equal(json.user.username, 'admin');
  assert.equal(json.user.role, 'admin');
  assert.ok(!('passwordHash' in json.user), 'password hash must not leak');
  adminToken = json.accessToken;
  refreshToken = json.refreshToken;
});

test('login fails with wrong password', async () => {
  const { status } = await api('POST', '/auth/login', { body: { username: 'admin', password: 'wrong' } });
  assert.equal(status, 401);
});

test('login validates required fields', async () => {
  const { status } = await api('POST', '/auth/login', { body: { username: 'admin' } });
  assert.equal(status, 400);
});

test('viewer can log in', async () => {
  const { status, json } = await api('POST', '/auth/login', { body: { username: 'viewer', password: 'viewer123' } });
  assert.equal(status, 200);
  viewerToken = json.accessToken;
});

test('refresh token rotation works and old token is revoked', async () => {
  const { status, json } = await api('POST', '/auth/refresh', { body: { refreshToken } });
  assert.equal(status, 200);
  assert.ok(json.accessToken);
  const reuse = await api('POST', '/auth/refresh', { body: { refreshToken } });
  assert.equal(reuse.status, 401, 'rotated refresh token must be rejected');
  refreshToken = json.refreshToken;
});

test('devices list returns seeded devices', async () => {
  const { status, json } = await api('GET', '/devices');
  assert.equal(status, 200);
  assert.equal(json.length, 4);
  assert.ok(json.find((d) => d.id === 'MOB-001'));
});

test('device detail includes latest telemetry', async () => {
  const { status, json } = await api('GET', '/devices/MOB-001');
  assert.equal(status, 200);
  assert.equal(json.id, 'MOB-001');
  assert.ok(json.latestTelemetry);
});

test('unknown device returns 404', async () => {
  const { status } = await api('GET', '/devices/NOPE');
  assert.equal(status, 404);
});

test('creating a device requires auth', async () => {
  const { status } = await api('POST', '/devices', { body: { crewName: 'Test' } });
  assert.equal(status, 401);
});

test('create + patch device with auth', async () => {
  const created = await api('POST', '/devices', { body: { crewName: 'Test Sailor', role: 'Deck Hand', status: 'online' }, token: adminToken });
  assert.equal(created.status, 201);
  assert.ok(created.json.id.startsWith('MOB-'));
  const patched = await api('PATCH', `/devices/${created.json.id}`, { body: { battery: 55 }, token: viewerToken });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.battery, 55);
});

test('telemetry history is paginated', async () => {
  const { status, json } = await api('GET', '/telemetry/MOB-001?page=1&limit=5');
  assert.equal(status, 200);
  assert.equal(json.page, 1);
  assert.equal(json.limit, 5);
  assert.ok(json.total >= 10);
  assert.equal(json.data.length, 5);
});

test('alerts list and resolve flow', async () => {
  const list = await api('GET', '/alerts?active=true');
  assert.equal(list.status, 200);
  assert.ok(list.json.length >= 3);
  const id = list.json[0].id;
  const unauth = await api('POST', `/alerts/${id}/resolve`);
  assert.equal(unauth.status, 401);
  const resolved = await api('POST', `/alerts/${id}/resolve`, { token: adminToken });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.json.active, false);
});

test('trigger MOB creates critical alert', async () => {
  const { status, json } = await api('POST', '/alerts/mob', { body: { deviceId: 'MOB-004' }, token: adminToken });
  assert.equal(status, 201);
  assert.equal(json.alert.type, 'MAN OVERBOARD');
  assert.equal(json.alert.severity, 'Critical');
  const device = await api('GET', '/devices/MOB-004');
  assert.equal(device.json.alert, true);
});

test('users endpoints are admin-only', async () => {
  const forbidden = await api('GET', '/users', { token: viewerToken });
  assert.equal(forbidden.status, 403);
  const ok = await api('GET', '/users', { token: adminToken });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.length, 2);
  assert.ok(ok.json.every((u) => !('passwordHash' in u)));
});

test('user CRUD', async () => {
  const created = await api('POST', '/users', { body: { username: 'ops', email: 'ops@mobguard.io', role: 'viewer', password: 'secret12' }, token: adminToken });
  assert.equal(created.status, 201);
  const login = await api('POST', '/auth/login', { body: { username: 'ops', password: 'secret12' } });
  assert.equal(login.status, 200);
  const patched = await api('PATCH', `/users/${created.json.id}`, { body: { role: 'admin' }, token: adminToken });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.role, 'admin');
  const del = await api('DELETE', `/users/${created.json.id}`, { token: adminToken });
  assert.equal(del.status, 200);
  const gone = await api('POST', '/auth/login', { body: { username: 'ops', password: 'secret12' } });
  assert.equal(gone.status, 401);
});

test('cannot delete the last admin', async () => {
  const list = await api('GET', '/users', { token: adminToken });
  const admins = list.json.filter((u) => u.role === 'admin');
  assert.equal(admins.length, 1);
  const { status } = await api('DELETE', `/users/${admins[0].id}`, { token: adminToken });
  assert.equal(status, 400);
});

test('contact inquiry validates and stores', async () => {
  const bad = await api('POST', '/contact', { body: { name: 'A' } });
  assert.equal(bad.status, 400);
  const badEmail = await api('POST', '/contact', { body: { name: 'A', email: 'nope', message: 'hi' } });
  assert.equal(badEmail.status, 400);
  const good = await api('POST', '/contact', { body: { name: 'Captain', email: 'cap@sea.io', organization: 'SS Test', message: 'Demo please' } });
  assert.equal(good.status, 201);
  assert.equal(good.json.ok, true);
});

test('unknown API route returns JSON 404', async () => {
  const { status, json } = await api('GET', '/nope');
  assert.equal(status, 404);
  assert.ok(json.error);
});
