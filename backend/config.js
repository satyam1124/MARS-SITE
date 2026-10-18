'use strict';
/**
 * MOB Guard backend configuration.
 *
 * All secrets come from environment variables (see .env.example).
 * Never hardcode secrets here.
 */
const path = require('path');

// dotenv is optional at runtime but listed as a dependency.
try {
  require('dotenv').config();
} catch (e) {
  /* dotenv not installed — environment variables still work */
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshExpiresIn: process.env.REFRESH_EXPIRES_IN || '7d',
  // JSON file used for persistence (works without Postgres/Redis).
  dataFile: process.env.DATA_FILE || path.join(__dirname, 'data.json'),
  // Frontend static files live one level up (repo root).
  frontendDir: path.join(__dirname, '..'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  simIntervalMs: parseInt(process.env.SIM_INTERVAL_MS || '4000', 10),
};

if (!config.jwtSecret) {
  console.warn(
    '[mob-guard] WARNING: JWT_SECRET is not set. Using an insecure default ' +
    'for local development only. Set JWT_SECRET in your .env for any real deployment.'
  );
  config.jwtSecret = 'dev-only-insecure-secret-change-me';
}

module.exports = config;
