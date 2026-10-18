'use strict';
/**
 * MOB Guard backend application factory.
 *
 * createApp() builds the Express app, attaches Socket.io (namespace
 * `/telemetry`) and a raw WebSocket endpoint at /ws/telemetry for
 * non-Socket.io clients, and returns the pieces the entrypoint needs.
 *
 * Keeping app construction separate from listening makes the app
 * testable (tests bind an ephemeral port).
 */
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Server: SocketIOServer } = require('socket.io');
const { WebSocketServer } = require('ws');

const config = require('./config');
const { createStore } = require('./store');
const { apiNotFound, errorHandler } = require('./middleware');
const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const telemetryRoutes = require('./routes/telemetry');
const alertRoutes = require('./routes/alerts');
const userRoutes = require('./routes/users');
const contactRoutes = require('./routes/contact');

function snapshotPayload(store) {
  const devices = store.listDevices();
  const alerts = store.listAlerts({ active: true });
  return {
    devices,
    alerts,
    stats: {
      totalDevices: devices.length,
      onlineDevices: devices.filter((d) => d.status === 'online').length,
      activeAlerts: alerts.length,
      criticalAlerts: alerts.filter((a) => a.severity === 'Critical').length,
    },
    timestamp: new Date().toISOString(),
  };
}

function createApp(options = {}) {
  const store = createStore(options.dataFile || config.dataFile);
  const app = express();

  app.use(cors({ origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',') }));
  app.use(express.json({ limit: '1mb' }));

  // ---- REST API ----
  app.get('/api/health', (req, res) => res.json({ ok: true, service: 'mob-guard', time: new Date().toISOString() }));
  // emit() is defined after io/wss are created; routes call it lazily.
  let emit = () => {};
  app.use('/api/auth', authRoutes(store));
  app.use('/api/devices', deviceRoutes(store));
  app.use('/api/telemetry', telemetryRoutes(store));
  app.use('/api/alerts', alertRoutes(store, (...a) => emit(...a)));
  app.use('/api/users', userRoutes(store));
  app.use('/api/contact', contactRoutes(store));
  app.use('/api', apiNotFound);

  // ---- Static frontend (repo root: index.html, dashboard.html, ...) ----
  app.use(express.static(config.frontendDir));
  // Deep links fall back to the landing page.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/ws/')) return next();
    res.sendFile(path.join(config.frontendDir, 'index.html'));
  });

  app.use(errorHandler);

  const server = http.createServer(app);

  // ---- Socket.io real-time channel (namespace /telemetry) ----
  const io = new SocketIOServer(server, {
    cors: { origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',') },
  });
  const telemetryNs = io.of('/telemetry');
  telemetryNs.on('connection', (socket) => {
    socket.emit('snapshot', snapshotPayload(store));
  });

  // ---- Raw WebSocket compatibility endpoint (/ws/telemetry) ----
  // Sends the same { event, data } JSON frames documented in
  // docs/backend-architecture.md, for clients without the Socket.io client.
  const wss = new WebSocketServer({ server, path: '/ws/telemetry' });
  const wsClients = new Set();
  wss.on('connection', (ws) => {
    wsClients.add(ws);
    ws.send(JSON.stringify({ event: 'snapshot', data: snapshotPayload(store) }));
    ws.on('close', () => wsClients.delete(ws));
  });

  // Unified fan-out: Socket.io namespace + raw WebSocket clients.
  emit = (event, data) => {
    telemetryNs.emit(event, data);
    const frame = JSON.stringify({ event, data });
    for (const ws of wsClients) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(frame); } catch (e) { /* ignore broken pipe */ }
      }
    }
  };

  return { app, server, io, wss, store, emit, snapshotPayload: () => snapshotPayload(store) };
}

module.exports = { createApp };
