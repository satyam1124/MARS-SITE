// ===== MOB Guard Mock API Service =====
// Simulates real-time telemetry data for crew monitoring (demo mode:
// GitHub Pages / file:// with no backend).
//
// Vessel-centric physics: the vessel moves along its heading; crew devices
// are pinned to the vessel (vessel position + deck offset ± 2 m jitter)
// and NEVER drift independently. A MAN OVERBOARD device detaches and
// drifts with current + leeway.

const MOBApi = {
    // Vessel state
    vessel: {
        name: 'MV Meridian',
        lat: 25.7600,
        lng: -80.1780,
        headingDeg: 250,
        speedKnots: 12,
        geofenceRadiusM: 150
    },
    vesselTrack: [],

    // Crew/Device data store
    devices: [
        { id: 'MOB-001', name: 'Captain Smith', role: 'Captain', lat: 25.7600, lng: -80.1780, signal: -75.4, status: 'online', battery: 94, heartRate: 72, bodyTemp: 36.8, motionScore: 12, waterContact: false, lastSeen: new Date(), deckOffset: { xMeters: 12, yMeters: 6 }, mobDrift: null },
        { id: 'MOB-002', name: 'John Doe', role: 'Deck Hand', lat: 25.7600, lng: -80.1780, signal: -110.2, status: 'online', battery: 67, heartRate: 105, bodyTemp: 35.2, motionScore: 89, waterContact: true, lastSeen: new Date(), alert: true, deckOffset: { xMeters: -18, yMeters: 22 }, mobDrift: { dirDeg: 100, speedKnots: 0.6 } },
        { id: 'MOB-003', name: 'Jane Wilson', role: 'Deck Hand', lat: 25.7600, lng: -80.1780, signal: -113.3, status: 'offline', battery: 12, heartRate: 0, bodyTemp: 0, motionScore: 0, waterContact: false, lastSeen: new Date(Date.now() - 600000), deckOffset: { xMeters: 6, yMeters: -28 }, mobDrift: null },
        { id: 'MOB-004', name: 'Mike Johnson', role: 'Engineer', lat: 25.7600, lng: -80.1780, signal: -74.2, status: 'online', battery: 88, heartRate: 68, bodyTemp: 36.6, motionScore: 15, waterContact: false, lastSeen: new Date(), deckOffset: { xMeters: -10, yMeters: -12 }, mobDrift: null }
    ],

    alerts: [
        { id: 1, type: 'MAN OVERBOARD', device: 'MOB-002', severity: 'Critical', time: null, message: 'Water contact + GPS drift detected for MOB-002 (John Doe)', icon: 'fa-user-slash', active: true },
        { id: 2, type: 'RSSI LOW', device: 'MOB-003', severity: 'High', time: null, message: 'Signal strength critical (-113 dBm) for device MOB-003', icon: 'fa-signal', active: true },
        { id: 3, type: 'GPS DRIFT', device: 'MOB-001', severity: 'Medium', time: null, message: 'GPS accuracy degraded for device MOB-001 (5.2m CEP)', icon: 'fa-satellite-dish', active: true }
    ],

    users: [
        { id: 1, username: 'admin', email: 'admin@mobguard.io', role: 'admin', password: 'admin123' },
        { id: 2, username: 'viewer', email: 'viewer@mobguard.io', role: 'viewer', password: 'viewer123' }
    ],

    history: [],
    _listeners: [],
    _interval: null,

    // Physics helpers (shared units with the backend sim)
    _moveByMeters(lat, lng, distM, bearingDeg) {
        const rad = (bearingDeg * Math.PI) / 180;
        const dLat = (distM * Math.cos(rad)) / 111320;
        const dLng = (distM * Math.sin(rad)) / (111320 * Math.cos((lat * Math.PI) / 180));
        return [lat + dLat, lng + dLng];
    },

    // Initialize timestamps
    init() {
        const now = new Date();
        this.alerts.forEach((a, i) => {
            a.time = new Date(now - (i * 62000));
        });
        this._generateHistory();
        this._startSimulation();
    },

    // Start real-time data simulation
    _startSimulation() {
        if (this._interval) clearInterval(this._interval);
        this._interval = setInterval(() => this._tick(), 4000);
    },

    _tick() {
        const dtSec = 4;

        // 1. Move the vessel along its heading.
        const vDistM = this.vessel.speedKnots * 0.514444 * dtSec;
        const [vLat, vLng] = this._moveByMeters(this.vessel.lat, this.vessel.lng, vDistM, this.vessel.headingDeg);
        this.vessel.lat = +vLat.toFixed(7);
        this.vessel.lng = +vLng.toFixed(7);
        this.vesselTrack.push({ lat: this.vessel.lat, lng: this.vessel.lng });
        if (this.vesselTrack.length > 50) this.vesselTrack.shift();

        // 2. Crew stay pinned to the vessel; MOB drifts away.
        this.devices.forEach(d => {
            if (d.status === 'offline') return;

            const isMob = d.alert && d.waterContact;
            if (isMob) {
                const drift = d.mobDrift || { dirDeg: 100, speedKnots: 0.6 };
                const [la, ln] = this._moveByMeters(d.lat, d.lng, drift.speedKnots * 0.514444 * dtSec, drift.dirDeg);
                d.lat = +la.toFixed(7);
                d.lng = +ln.toFixed(7);
                d.heartRate = Math.round(95 + Math.random() * 20);
                d.motionScore = Math.round(80 + Math.random() * 20);
                d.battery = Math.max(0, d.battery - 0.05);
            } else {
                const off = d.deckOffset || { xMeters: 0, yMeters: 0 };
                const jx = (Math.random() - 0.5) * 4;
                const jy = (Math.random() - 0.5) * 4;
                d.lat = +(this.vessel.lat + (off.yMeters + jy) / 111320).toFixed(7);
                d.lng = +(this.vessel.lng + (off.xMeters + jx) / (111320 * Math.cos((this.vessel.lat * Math.PI) / 180))).toFixed(7);
                d.heartRate = Math.round(d.heartRate + (Math.random() - 0.5) * 4);
                d.heartRate = Math.max(58, Math.min(95, d.heartRate));
                d.motionScore = Math.round(5 + Math.random() * 25);
                d.battery = Math.max(0, d.battery - 0.02);
            }

            // Simulate signal fluctuation
            d.signal += (Math.random() - 0.5) * 3;
            d.signal = Math.max(-125, Math.min(-60, d.signal));

            // Simulate body temp
            d.bodyTemp = parseFloat((d.bodyTemp + (Math.random() - 0.5) * 0.1).toFixed(1));
            d.bodyTemp = Math.max(35.0, Math.min(37.5, d.bodyTemp));

            d.lastSeen = new Date();
        });

        this._notifyListeners('update', this.getSnapshot());
    },

    // Subscribe to updates
    onUpdate(callback) {
        this._listeners.push(callback);
    },

    _notifyListeners(event, data) {
        this._listeners.forEach(cb => cb(event, data));
    },

    // Get current snapshot
    getSnapshot() {
        return {
            devices: this.devices.map(d => ({ ...d })),
            alerts: this.alerts.filter(a => a.active),
            vessel: { ...this.vessel, track: this.vesselTrack.map(p => ({ ...p })) },
            stats: {
                totalDevices: this.devices.length,
                onlineDevices: this.devices.filter(d => d.status === 'online').length,
                activeAlerts: this.alerts.filter(a => a.active).length,
                criticalAlerts: this.alerts.filter(a => a.active && a.severity === 'Critical').length,
                totalRecords: this.history.length
            }
        };
    },

    // Authentication
    authenticate(username, password) {
        return this.users.find(u => u.username === username && u.password === password);
    },

    // Alert management
    resolveAlert(id) {
        const alert = this.alerts.find(a => a.id === id);
        if (alert) {
            alert.active = false;
            if (alert.type === 'MAN OVERBOARD') {
                const d = this.devices.find(x => x.id === alert.device);
                if (d) { d.alert = false; d.waterContact = false; d.mobDrift = null; }
            }
            this._notifyListeners('alertResolved', alert);
        }
        return alert;
    },

    triggerMOBAlert(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) return null;

        device.alert = true;
        device.waterContact = true;
        device.motionScore = 95;
        device.mobDrift = { dirDeg: 100, speedKnots: 0.6 };

        const alert = {
            id: Date.now(),
            type: 'MAN OVERBOARD',
            device: deviceId,
            severity: 'Critical',
            time: new Date(),
            message: `Water contact + abnormal motion detected for ${deviceId} (${device.name})`,
            icon: 'fa-user-slash',
            active: true
        };

        this.alerts.unshift(alert);
        this._notifyListeners('mob', { alert, device: { ...device } });
        return alert;
    },

    // User management
    getUsers() { return this.users.map(u => ({ ...u, password: '***' })); },

    addUser(userData) {
        if (this.users.find(u => u.username === userData.username)) return null;
        const user = { id: Math.max(0, ...this.users.map(u => u.id)) + 1, ...userData };
        this.users.push(user);
        return user;
    },

    updateUser(id, updates) {
        const user = this.users.find(u => u.id === id);
        if (!user) return null;
        Object.assign(user, updates);
        return user;
    },

    deleteUser(id) {
        const idx = this.users.findIndex(u => u.id === id);
        if (idx === -1) return false;
        this.users.splice(idx, 1);
        return true;
    },

    // History generation
    _generateHistory() {
        this.history = [];
        this.devices.forEach(d => {
            for (let j = 0; j < 8; j++) {
                this.history.push({
                    device: d.id,
                    time: new Date(Date.now() - j * 60000 * (Math.random() * 5 + 1)),
                    lat: d.lat + (Math.random() - 0.5) * 0.01,
                    lng: d.lng + (Math.random() - 0.5) * 0.01,
                    signal: d.signal + (Math.random() - 0.5) * 10,
                    status: j === 0 && d.alert ? 'MAN OVERBOARD' : d.status === 'offline' ? 'No Fix' : 'Safe',
                    sats: Math.floor(Math.random() * 6) + 6,
                    heartRate: d.alert ? Math.round(95 + Math.random() * 20) : Math.round(65 + Math.random() * 15),
                    details: j === 0 && d.alert ? 'Water contact + GPS drift' : d.signal < -110 ? 'RSSI below threshold' : 'Normal'
                });
            }
        });
        this.history.sort((a, b) => b.time - a.time);
    },

    getHistory() {
        return this.history;
    },

    // Format helpers
    formatTime(date) {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    },

    formatDateTime(date) {
        return date.toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    }
};
