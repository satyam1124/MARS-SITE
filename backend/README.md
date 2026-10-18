# MOB Guard Backend

Functional Node.js backend for the MOB Guard crew-safety dashboard.
Implements the API described in `docs/backend-architecture.md` using
**Express 4 + Socket.io**, with **JWT auth (bcrypt-hashed passwords)** and a
**JSON-file data store** (`backend/data.json`) so it runs with zero external
services. The store is written as a repository-style module (`store.js`) so
Postgres/TimescaleDB can replace the JSON file later without touching routes.

## Quick start

```bash
# from the repo root
npm install
cp backend/.env.example backend/.env   # optional; defaults work for dev
npm start                               # or: node backend/server.js
```

Open http://localhost:3000/dashboard.html and log in:

| user   | password  | role   |
|--------|-----------|--------|
| admin  | admin123  | admin  |
| viewer | viewer123 | viewer |

The backend also serves the static frontend (`index.html`, `dashboard.html`),
so one process runs the whole site.

## API reference

Base URL: `http://localhost:3000/api`

| Method | Endpoint                    | Auth        | Description                          |
|--------|-----------------------------|-------------|--------------------------------------|
| GET    | /api/health                 | —           | Liveness probe                       |
| POST   | /api/auth/login             | —           | `{username,password}` → JWT pair     |
| POST   | /api/auth/refresh           | —           | `{refreshToken}` → new JWT pair      |
| GET    | /api/devices                | —           | List all devices                     |
| GET    | /api/devices/:id            | —           | Device detail + latest telemetry     |
| POST   | /api/devices                | user        | Register a device                    |
| PATCH  | /api/devices/:id            | user        | Update device config                 |
| GET    | /api/telemetry/:deviceId    | —           | Paginated history (`?page&limit`)    |
| GET    | /api/alerts                 | —           | List alerts (`?active=true`)         |
| POST   | /api/alerts/:id/resolve     | user        | Resolve an alert                     |
| POST   | /api/alerts/mob             | user        | Trigger MAN OVERBOARD for a device   |
| GET    | /api/users                  | admin       | List users (no password hashes)      |
| POST   | /api/users                  | admin       | Create user                          |
| PATCH  | /api/users/:id              | admin       | Update user                          |
| DELETE | /api/users/:id              | admin       | Delete user                          |
| POST   | /api/contact                | —           | Store a landing-page inquiry         |

Auth uses `Authorization: Bearer <accessToken>`. Access tokens expire after
15 minutes; use the refresh token to get a new pair.

## Real-time telemetry

Two equivalent channels broadcast the same events:

1. **Socket.io namespace `/telemetry`** (recommended):
   ```js
   const socket = io('http://localhost:3000/telemetry');
   socket.on('telemetry', (data) => console.log(data)); // every 4s per device
   socket.on('mob', (data) => console.log('MOB!', data));
   socket.on('alert', (alert) => console.log(alert));
   socket.on('alertResolved', (alert) => console.log(alert));
   socket.on('snapshot', (snap) => console.log(snap));
   ```

2. **Raw WebSocket `/ws/telemetry`** — for clients without the Socket.io
   client. Each message is a JSON frame `{ "event": "telemetry"|"mob"|...,
   "data": { ... } }` matching `docs/backend-architecture.md`.

Telemetry payload (both channels):
```json
{
  "deviceId": "MOB-001", "lat": 25.76934, "lng": -80.17591,
  "signal": -75.4, "heartRate": 72, "bodyTemp": 36.8,
  "motion": 12, "water": false, "timestamp": "2026-03-25T00:30:00Z"
}
```

## Project layout

```
backend/
  server.js        # entrypoint: listen + start simulation
  app.js           # createApp() — Express + Socket.io + WS wiring
  config.js        # env-based config (JWT secret, port, ...)
  store.js         # JSON-file data store (repository-style)
  auth.js          # JWT issue/rotate + bcrypt helpers
  middleware.js    # requireAuth, requireAdmin, validation, errors
  sim.js           # telemetry simulation engine (4s tick)
  routes/          # auth, devices, telemetry, alerts, users, contact
  tests/           # node:test API tests
  data.json        # persisted state (created on first run)
  .env.example     # environment template
```

## Tests

```bash
npm test   # node --test backend/tests/
```

## Swapping in Postgres later

`store.js` is the only module that touches the JSON file. To move to
Postgres/TimescaleDB, re-implement its exported functions
(`listDevices`, `addTelemetry`, `createAlert`, …) against a `pg` pool and
keep the signatures — routes, auth, and the simulation engine stay unchanged.
