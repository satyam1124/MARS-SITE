'use strict';
/**
 * MOB Guard backend application factory.
 *
 * createApp() builds the Express app, attaches Socket.io (namespace
 * `/telemetry`) and a raw WebSocket endpoint at /ws/telemetry for
 * non-Socket.io clients, and returns the pieces the entrypoint needs.
 *
 * Security: helmet headers (CSP disabled — the dashboard uses inline
 * scripts/CDNs), strict CORS allowlist, and rate limiting on auth and API
 * routes.
 *
 * Keeping app construction separate from listening makes the app
 * testable (tests bind an ephemeral port).
 */
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server: SocketIOServer } = require('socket.io');
const { WebSocketServer } = require('ws');

const config = require('./config');
const { createStore } = require('./store');
const { getVesselTrack } = require('./sim');
const { apiNotFound, errorHandler } = require('./middleware');
const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const telemetryRoutes = require('./routes/telemetry');
const alertRoutes = require('./routes/alerts');
const userRoutes = require('./routes/users');
const contactRoutes = require('./routes/contact');
const vesselRoutes = require('./routes/vessel');
const weatherRoutes = require('./routes/weather');

function corsOrigins() {
  return config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((s) => s.trim()).filter(Boolean);
}

function snapshotPayload(store) {
  const devices = store.listDevices();
  const alerts = store.listAlerts({ active: true });
  return {
    devices,
    alerts,
    vessel: { ...store.getVessel(), geofenceRadiusM: config.geofenceRadiusM, track: getVesselTrack() },
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

  // ---- Security headers ----
  // CSP is disabled because the dashboard ships inline scripts and CDN
  // assets (Leaflet, Font Awesome); the remaining helmet headers still apply.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.set('trust proxy', 1);

  // ---- CORS ----
  if (config.corsOrigin === '*') {
    console.warn('[mob-guard] WARNING: CORS_ORIGIN is "*". Restrict it in production via the CORS_ORIGIN env var.');
  }
  app.use(cors({ origin: corsOrigins() }));
  app.use(express.json({ limit: '1mb' }));

  // ---- Rate limiting ----
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later' },
  });
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down' },
  });
  app.use('/api/auth', authLimiter);
  // Auth routes have their own stricter limiter; exempt them here so the
  // auth limiter's RateLimit-* headers (not the general ones) are sent.
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth')) return next();
    return apiLimiter(req, res, next);
  });

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
  app.use('/api/vessel', vesselRoutes(store, getVesselTrack));
  app.use('/api/weather', weatherRoutes());
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
    cors: { origin: corsOrigins() },
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
