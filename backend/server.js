'use strict';
/**
 * MOB Guard backend entrypoint.
 *
 *   node backend/server.js
 *
 * Serves the REST API, the real-time telemetry channels, and the static
 * frontend from the repo root.
 */
const config = require('./config');
const { createApp } = require('./app');
const { startSimulation } = require('./sim');

const { server, store, emit } = createApp();

startSimulation(store, emit);

server.listen(config.port, () => {
  console.log(`[mob-guard] API listening on http://localhost:${config.port}`);
  console.log(`[mob-guard] Dashboard: http://localhost:${config.port}/dashboard.html`);
  console.log(`[mob-guard] Socket.io namespace: /telemetry | Raw WS: /ws/telemetry`);
});

function shutdown() {
  console.log('\n[mob-guard] Shutting down, persisting data...');
  store.persistNow();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
