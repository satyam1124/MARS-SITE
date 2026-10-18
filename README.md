# MOB Guard — Man Overboard Security System

Real-time crew monitoring for maritime vessels: GPS tracking, biometric
telemetry, man-overboard detection with drift prediction, marine weather,
and instant alerts — with a functional Node.js backend.

## Quick start (local)

```bash
npm install
npm start        # → http://localhost:7860/dashboard.html
```

Demo logins: `admin` / `admin123` (admin), `viewer` / `viewer123` (viewer).

The dashboard also works as a pure static demo (GitHub Pages / `file://`):
without a backend it falls back to the built-in mock simulation.

Copy `backend/.env.example` → `backend/.env` and set a real `JWT_SECRET`
for anything beyond local development.

## API overview

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/auth/login`, `/api/auth/refresh` | JWT access (15m) + rotating refresh (7d) |
| GET/POST | `/api/devices` | list / register (auth to create) |
| GET/PATCH | `/api/devices/:id` | detail + latest telemetry; edit name/role |
| GET | `/api/telemetry/:deviceId?page=&limit=` | paginated history |
| GET | `/api/alerts?active=true` | filterable alerts |
| POST | `/api/alerts/mob` | trigger MAN OVERBOARD (auth) |
| POST | `/api/alerts/:id/resolve` | resolve alert (auth) |
| GET/PATCH | `/api/vessel` | vessel position/heading/speed (PATCH: admin) |
| GET | `/api/weather?lat=&lng=` | marine weather via Open-Meteo (cached 10 min) |
| GET/POST/PATCH/DELETE | `/api/users` | admin only |
| POST | `/api/contact` | landing-page inquiries |

Real-time: Socket.io namespace `/telemetry` (`telemetry`, `vessel`,
`mob`, `alert`, `alertResolved`, `snapshot`) and raw WebSocket
`/ws/telemetry` with `{ event, data }` frames.

## Simulation model

The vessel moves along its heading at `speedKnots`. Crew devices are
**pinned to the vessel** (position = vessel + deck offset ± 2 m jitter) —
they never drift independently. A MAN OVERBOARD event detaches the device,
which then drifts with ocean current + wind leeway while the vessel keeps
moving, so distance-to-vessel grows realistically. Devices outside the
`GEOFENCE_RADIUS_M` (default 150 m) raise a geofence warning.

## Tests

```bash
npm test   # node --test backend/tests/api.test.js
```

## 24/7 hosting on Hugging Face Spaces (Docker)

The included `Dockerfile` runs the backend 24/7 on a Hugging Face Space:

1. Go to [huggingface.co/new-space](https://huggingface.co/new-space),
   choose the **Docker** SDK, visibility Public or Private.
2. Connect the Space to this GitHub repo
   (`satyam1124/MARS-SITE`, branch `main`), or push the repo to the
   Space's git remote.
3. In the Space **Settings → Secrets**, add:
   - `JWT_SECRET` = a long random string
     (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
4. The Space builds the Docker image and serves the app on port `7860`
   automatically. The dashboard is live at `https://<your-space>.hf.space/dashboard.html`.

Optional: add this frontmatter block at the top of this README when the
README is the Space's main page (Docker Spaces read `sdk: docker`):

```yaml
---
title: MOB Guard
emoji: 🛟
colorFrom: blue
colorTo: red
sdk: docker
pinned: false
---
```

Notes:
- The JSON-file store (`backend/data.json`) persists on the Space's disk;
  it auto-seeds on first boot. For production scale, swap `backend/store.js`
  for the Postgres adapter sketched in `docs/backend-architecture.md`.
- Set `CORS_ORIGIN` to your Space URL in production if you embed the
  dashboard elsewhere.
