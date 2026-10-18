/* ===== MOB Guard Backend Adapter (scripts/api-client.js) =====
 *
 * Tries the real backend (REST + Socket.io) first and falls back to the
 * built-in mock simulation (scripts/api.js) when no backend is reachable.
 *
 * This keeps the dashboard working in both modes:
 *  - GitHub Pages / file://  → mock simulation (existing demo behavior)
 *  - Served by `node backend/server.js` (same origin, /api/*) → live backend
 *
 * To point at a remote backend instead of the same origin, define
 * `window.API_BASE = 'https://api.example.com'` BEFORE this script loads.
 *
 * Load order in dashboard.html: api-client.js BEFORE api.js.
 */
(function () {
    'use strict';

    var BASE = (window.API_BASE || '').replace(/\/$/, '');
    var PROBE_TIMEOUT_MS = 5000;

    /* ---------- tiny helpers ---------- */

    // NOTE: scripts/api.js, app.js, alerts.js declare their globals with
    // top-level `const`, which does NOT create `window.*` properties and
    // throws on `typeof` while in the temporal dead zone. These resolvers
    // handle both cases safely.
    function mobApi() { try { return typeof MOBApi !== 'undefined' ? MOBApi : null; } catch (e) { return null; } }
    function appObj() { try { return typeof App !== 'undefined' ? App : null; } catch (e) { return null; } }
    function alertSys() { try { return typeof AlertSystem !== 'undefined' ? AlertSystem : null; } catch (e) { return null; } }

    /** Stop the built-in mock simulation interval (backend is authoritative). */
    function stopMockSim() {
        var api = mobApi();
        if (api && api._interval) {
            clearInterval(api._interval);
            api._interval = null;
        }
    }

    function getToken() {
        try { return localStorage.getItem('mob_token'); } catch (e) { return null; }
    }

    function apiFetch(path, opts) {
        opts = opts || {};
        var headers = { 'Content-Type': 'application/json' };
        var token = getToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;
        if (opts.headers) {
            for (var k in opts.headers) headers[k] = opts.headers[k];
        }
        return fetch(BASE + path, {
            method: opts.method || 'GET',
            headers: headers,
            body: opts.body ? JSON.stringify(opts.body) : undefined,
            cache: 'no-store'
        });
    }

    async function refreshAccessToken() {
        var rt = null;
        try { rt = localStorage.getItem('mob_refresh'); } catch (e) { /* ignore */ }
        if (!rt) return false;
        try {
            var res = await fetch(BASE + '/api/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: rt })
            });
            if (!res.ok) return false;
            var data = await res.json();
            try {
                localStorage.setItem('mob_token', data.accessToken);
                localStorage.setItem('mob_refresh', data.refreshToken);
            } catch (e) { /* ignore */ }
            return true;
        } catch (e) {
            return false;
        }
    }

    /** Authenticated fetch with one silent refresh-token retry on 401. */
    async function authedFetch(path, opts) {
        var res = await apiFetch(path, opts);
        if (res.status === 401 && (opts && opts.method && opts.method !== 'GET')) {
            if (await refreshAccessToken()) {
                res = await apiFetch(path, opts);
            }
        }
        return res;
    }

    function probeBackend() {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, PROBE_TIMEOUT_MS);
        return fetch(BASE + '/api/health', { cache: 'no-store', signal: controller.signal })
            .then(function (res) { clearTimeout(timer); return res.ok; })
            .catch(function () { clearTimeout(timer); return false; });
    }

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('script load failed')); };
            document.head.appendChild(s);
        });
    }

    /* ---------- shape mapping: backend <-> dashboard ---------- */

    function toFrontendDevice(d) {
        return {
            id: d.id,
            name: d.crewName,
            role: d.role,
            lat: d.lat,
            lng: d.lng,
            signal: d.signal,
            status: d.status,
            battery: d.battery,
            heartRate: d.heartRate,
            bodyTemp: d.bodyTemp,
            motionScore: d.motionScore,
            waterContact: d.waterContact,
            alert: d.alert,
            lastSeen: new Date(d.lastSeen)
        };
    }

    function iconFor(type) {
        switch (type) {
            case 'MAN OVERBOARD': return 'fa-user-slash';
            case 'RSSI LOW': return 'fa-signal';
            case 'GPS DRIFT': return 'fa-satellite-dish';
            case 'LOW BATTERY': return 'fa-battery-quarter';
            default: return 'fa-exclamation-triangle';
        }
    }

    function toFrontendAlert(a) {
        return {
            id: a.id,
            type: a.type,
            device: a.deviceId,
            severity: a.severity,
            time: new Date(a.createdAt),
            message: a.message,
            icon: iconFor(a.type),
            active: a.active
        };
    }

    /* ---------- backend sync ---------- */

    function replaceInPlace(arr, items) {
        arr.length = 0;
        for (var i = 0; i < items.length; i++) arr.push(items[i]);
    }

    async function syncState() {
        try {
            var dr = await apiFetch('/api/devices');
            var ar = await apiFetch('/api/alerts?active=true');
            if (!dr.ok) return false;
            var devices = await dr.json();
            replaceInPlace(MOBApi.devices, devices.map(toFrontendDevice));
            if (ar.ok) {
                var alerts = await ar.json();
                replaceInPlace(MOBApi.alerts, alerts.map(toFrontendAlert));
            }
            MOBApi._notifyListeners('update', MOBApi.getSnapshot());
            return true;
        } catch (e) {
            return false;
        }
    }

    function applyTelemetry(data) {
        var d = MOBApi.devices.find(function (x) { return x.id === data.deviceId; });
        if (!d) return;
        d.lat = data.lat;
        d.lng = data.lng;
        d.signal = data.signal;
        d.heartRate = data.heartRate;
        d.bodyTemp = data.bodyTemp;
        d.motionScore = data.motion;
        d.waterContact = data.water;
        d.lastSeen = new Date(data.timestamp);
        MOBApi._notifyListeners('update', MOBApi.getSnapshot());
    }

    function applyMob(data) {
        var d = MOBApi.devices.find(function (x) { return x.id === data.deviceId; });
        if (d) {
            d.alert = true;
            d.waterContact = true;
            d.motionScore = 95;
            d.lastSeen = new Date(data.timestamp);
        }
        syncState(); // pull the authoritative alert record
    }

    function connectRealtime() {
        // Prefer Socket.io; fall back to 4s polling if the client fails to load.
        loadScript(BASE + '/socket.io/socket.io.js').then(function () {
            if (typeof io === 'undefined') throw new Error('no io global');
            var socket = io(BASE + '/telemetry');
            socket.on('telemetry', applyTelemetry);
            socket.on('mob', applyMob);
            socket.on('alert', function () { syncState(); });
            socket.on('alertResolved', function (alert) {
                var local = MOBApi.alerts.find(function (a) { return a.id === alert.id; });
                if (local) local.active = false;
                if (alert.type === 'MAN OVERBOARD') {
                    var d = MOBApi.devices.find(function (x) { return x.id === alert.deviceId; });
                    if (d) { d.alert = false; d.waterContact = false; }
                }
                MOBApi._notifyListeners('update', MOBApi.getSnapshot());
            });
            socket.on('snapshot', function (snap) {
                if (snap && snap.devices) {
                    replaceInPlace(MOBApi.devices, snap.devices.map(toFrontendDevice));
                    replaceInPlace(MOBApi.alerts, (snap.alerts || []).map(toFrontendAlert));
                    MOBApi._notifyListeners('update', MOBApi.getSnapshot());
                }
            });
            window.MOBBackend.socket = socket;
        }).catch(function () {
            setInterval(syncState, 4000);
        });
    }

    /* ---------- patch mock API to also write through to the backend ---------- */

    function patchMutations() {
        var origResolve = MOBApi.resolveAlert.bind(MOBApi);
        MOBApi.resolveAlert = function (id) {
            var result = origResolve(id); // instant local UI update
            authedFetch('/api/alerts/' + id + '/resolve', { method: 'POST' }).catch(function () {});
            return result;
        };

        var origMob = MOBApi.triggerMOBAlert.bind(MOBApi);
        MOBApi.triggerMOBAlert = function (deviceId) {
            var result = origMob(deviceId);
            authedFetch('/api/alerts/mob', { method: 'POST', body: { deviceId: deviceId } }).catch(function () {});
            return result;
        };

        var origAddUser = MOBApi.addUser.bind(MOBApi);
        MOBApi.addUser = function (userData) {
            var result = origAddUser(userData);
            if (result) {
                authedFetch('/api/users', { method: 'POST', body: userData }).catch(function () {});
            }
            return result;
        };

        var origUpdateUser = MOBApi.updateUser.bind(MOBApi);
        MOBApi.updateUser = function (id, updates) {
            var result = origUpdateUser(id, updates);
            if (result) {
                authedFetch('/api/users/' + id, { method: 'PATCH', body: updates }).catch(function () {});
            }
            return result;
        };

        var origDeleteUser = MOBApi.deleteUser.bind(MOBApi);
        MOBApi.deleteUser = function (id) {
            var result = origDeleteUser(id);
            if (result) {
                authedFetch('/api/users/' + id, { method: 'DELETE' }).catch(function () {});
            }
            return result;
        };
    }

    /** Route the dashboard login through the backend when it is available. */
    function patchLogin() {
        var app = appObj();
        var alerts = alertSys();
        if (!app || !app.handleLogin || app.handleLogin._backendPatched) return;
        var mockLogin = app.handleLogin.bind(app);

        async function backendLogin(e) {
            e.preventDefault();
            var username = document.getElementById('username').value;
            var password = document.getElementById('password').value;
            var btn = document.getElementById('loginBtn');
            btn.innerHTML = '<span class="loading"></span> Signing in...';
            try {
                var res = await apiFetch('/api/auth/login', {
                    method: 'POST',
                    body: { username: username, password: password }
                });
                if (!res.ok) {
                    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
                    if (alerts) alerts.showToast('Invalid credentials', 'error');
                    return;
                }
                var data = await res.json();
                try {
                    localStorage.setItem('mob_token', data.accessToken);
                    localStorage.setItem('mob_refresh', data.refreshToken);
                } catch (err) { /* ignore */ }
                app.currentUser = { username: data.user.username, role: data.user.role.toUpperCase() };
                document.getElementById('currentUser').textContent = username;
                localStorage.setItem('mob_logged_in', 'true');
                localStorage.setItem('mob_user', username);
                localStorage.setItem('mob_role', data.user.role.toUpperCase());
                app.showApp();
                if (alerts) alerts.showToast('Welcome back, ' + username + '!', 'success');
            } catch (err) {
                // Backend went away mid-login: fall back to the mock.
                mockLogin(e);
            }
        }
        backendLogin._backendPatched = true;
        app.handleLogin = backendLogin;
    }

    function attachBackend() {
        if (MOBApi._backend) { stopMockSim(); return; }
        MOBApi._backend = true;
        stopMockSim();

        syncState().then(function () {
            // Pull user list too when we have an admin token (silent on failure).
            apiFetch('/api/users').then(function (res) {
                if (!res.ok) return null;
                return res.json();
            }).then(function (users) {
                if (users && users.length) {
                    replaceInPlace(MOBApi.users, users.map(function (u) {
                        return { id: u.id, username: u.username, email: u.email, role: u.role, password: '***' };
                    }));
                }
            }).catch(function () {});
        });

        connectRealtime();
        patchMutations();

        // App is defined in app.js (loaded after this file); retry until present.
        var tries = 0;
        var timer = setInterval(function () {
            patchLogin();
            var app = appObj();
            if ((app && app.handleLogin._backendPatched) || ++tries > 100) {
                clearInterval(timer);
            }
        }, 100);

        window.MOBBackend.connected = true;
        var alerts = alertSys();
        if (alerts) {
            setTimeout(function () {
                alerts.showToast('Connected to live backend', 'success');
            }, 500);
        }
    }

    /* ---------- boot: wait for MOBApi, keep mock init, probe backend ---------- */

    window.MOBBackend = {
        base: BASE,
        connected: false,
        socket: null,
        apiFetch: apiFetch,
        authedFetch: authedFetch,
        syncState: function () { return syncState(); }
    };

    var bootTries = 0;
    var bootTimer = setInterval(function () {
        var api = mobApi();
        if (!api) {
            if (++bootTries > 200) clearInterval(bootTimer);
            return;
        }
        clearInterval(bootTimer);

        var origInit = api.init.bind(api);
        api.init = function () {
            origInit(); // mock starts instantly so the UI never blocks
            // Re-check: covers the case where App.init() ran before the
            // boot probe below (attachBackend is idempotent).
            probeBackend().then(function (ok) {
                if (ok) attachBackend();
            });
        };

        // Probe immediately — do not wait for App.init(), which may fire
        // before this interval's first tick.
        probeBackend().then(function (ok) {
            if (ok) attachBackend();
        });
    }, 50);
})();
