# MOB Guard — Backend Architecture

## Recommended Stack

| Component | Technology | Purpose |
|---|---|---|
| **Runtime** | Node.js 20 LTS | Server runtime |
| **API Framework** | Express.js 4 | REST API endpoints |
| **Real-time** | Socket.io | WebSocket for live telemetry |
| **Database** | PostgreSQL + TimescaleDB | Time-series telemetry data |
| **Auth** | JWT + bcrypt | Stateless authentication |
| **Cache** | Redis | Session cache + pub/sub |

## Alternative: Firebase (No Backend Code)

For rapid deployment without a custom backend:

| Service | Use |
|---|---|
| Firebase Auth | User login with email/password |
| Firestore | Device data, user profiles |
| Realtime Database | Live telemetry (GPS, heart rate) |
| Cloud Functions | MOB detection logic, SMS/email alerts |
| Firebase Hosting | Static frontend deployment |

## API Endpoints

```
POST   /api/auth/login          → JWT token
POST   /api/auth/refresh        → Refresh token

GET    /api/devices             → List all devices
GET    /api/devices/:id         → Device detail + latest telemetry
POST   /api/devices             → Register new device
PATCH  /api/devices/:id         → Update device config

GET    /api/telemetry/:deviceId → Paginated telemetry history
WS     /ws/telemetry            → Real-time telemetry stream

GET    /api/alerts              → List alerts (filterable)
POST   /api/alerts/:id/resolve  → Resolve an alert
POST   /api/alerts/mob          → Trigger MOB event

GET    /api/users               → List users (admin only)
POST   /api/users               → Create user
PATCH  /api/users/:id           → Update user
DELETE /api/users/:id           → Delete user
```

## Database Schema

```sql
-- Devices
CREATE TABLE devices (
    id VARCHAR(10) PRIMARY KEY,
    crew_name VARCHAR(100),
    role VARCHAR(50),
    status VARCHAR(20) DEFAULT 'offline',
    battery DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Telemetry (TimescaleDB hypertable)
CREATE TABLE telemetry (
    time        TIMESTAMPTZ NOT NULL,
    device_id   VARCHAR(10) REFERENCES devices(id),
    lat         DECIMAL(10,7),
    lng         DECIMAL(10,7),
    signal_dbm  DECIMAL(6,2),
    heart_rate  INTEGER,
    body_temp   DECIMAL(4,1),
    motion      INTEGER,
    water       BOOLEAN DEFAULT FALSE
);
SELECT create_hypertable('telemetry', 'time');

-- Alerts
CREATE TABLE alerts (
    id          SERIAL PRIMARY KEY,
    device_id   VARCHAR(10) REFERENCES devices(id),
    type        VARCHAR(50),
    severity    VARCHAR(20),
    message     TEXT,
    active      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP
);
```

## Deployment

### Frontend (GitHub Pages / Vercel)
```bash
# GitHub Pages
git add .
git commit -m "Deploy MOB Guard v2"
git push origin main
# Enable GitHub Pages in repo settings → Source: main branch

# Vercel (alternative)
npx vercel --prod
```

### Backend (Render / Railway)
```bash
# Render: connect GitHub repo, set env vars, deploy
# Railway: railway up

# Environment variables
DATABASE_URL=postgresql://user:pass@host/dbname
JWT_SECRET=your-secret-key
REDIS_URL=redis://localhost:6379
TWILIO_SID=xxx          # For SMS alerts
SENDGRID_KEY=xxx        # For email alerts
```

## WebSocket Message Format

```json
// Server → Client: telemetry update
{
    "event": "telemetry",
    "data": {
        "deviceId": "MOB-001",
        "lat": 25.76934,
        "lng": -80.17591,
        "signal": -75.4,
        "heartRate": 72,
        "bodyTemp": 36.8,
        "motion": 12,
        "water": false,
        "timestamp": "2026-03-25T00:30:00Z"
    }
}

// Server → Client: MOB alert
{
    "event": "mob",
    "data": {
        "deviceId": "MOB-002",
        "crewName": "John Doe",
        "lat": 25.75043,
        "lng": -80.18594,
        "timestamp": "2026-03-25T00:30:00Z"
    }
}
```
