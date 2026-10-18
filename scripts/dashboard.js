// ===== MOB Guard Dashboard View =====

const DashboardView = {

    render() {
        this.renderStats();
        this.renderPositionsTable();
        this.renderCrewTelemetry();
        this.renderWeather();
        AlertSystem.renderDashboardAlerts();
    },

    renderStats() {
        const snapshot = MOBApi.getSnapshot();
        const stats = snapshot.stats;

        const statCards = document.querySelectorAll('#dashboardPage .stats-grid .stat-card');
        if (statCards.length >= 4) {
            statCards[0].querySelector('.stat-info h3').textContent = stats.totalDevices;
            statCards[0].querySelector('.stat-info p').innerHTML = `Total Devices<br><span style="color: var(--accent-green);">${stats.onlineDevices} online</span>`;

            const alertH3 = statCards[1].querySelector('.stat-info h3');
            alertH3.textContent = stats.activeAlerts;
            alertH3.style.color = stats.activeAlerts > 0 ? 'var(--accent-red)' : 'var(--accent-green)';
            statCards[1].querySelector('.stat-info p').innerHTML = `Active Alerts<br><span style="color: var(--accent-red);">${stats.criticalAlerts} critical</span>`;

            statCards[2].querySelector('.stat-info h3').textContent = stats.totalRecords.toLocaleString();

            statCards[3].querySelector('.stat-info h3').textContent = snapshot.devices.length;
        }
    },

    renderPositionsTable() {
        const container = document.getElementById('positionsTable');
        if (!container) return;

        const snapshot = MOBApi.getSnapshot();
        container.innerHTML = snapshot.devices.map(d => {
            const isMob = !!(d.alert && d.waterContact);
            const statusClass = isMob ? 'critical' : d.status === 'offline' ? 'offline' : 'safe';
            const statusText = isMob ? 'MAN OVERBOARD' : d.status === 'offline' ? 'Offline' : 'Safe';

            return `
                <div class="table-row">
                    <div class="device-name">
                        ${escapeHtml(d.id)}
                        <span>${escapeHtml(d.name)}</span>
                    </div>
                    <div class="position">${Number(d.lat).toFixed(4)},<br>${Number(d.lng).toFixed(4)}</div>
                    <div>
                        <div class="signal-bars">
                            ${this.getSignalBars(d.signal)}
                        </div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${Number(d.signal).toFixed(1)} dBm</div>
                    </div>
                    <div>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted);">
                        <i class="far fa-clock" style="margin-right: 4px;"></i>${MOBApi.formatTime(d.lastSeen)}
                    </div>
                </div>
            `;
        }).join('');
    },

    renderCrewTelemetry() {
        const container = document.getElementById('crewTelemetry');
        if (!container) return;

        const snapshot = MOBApi.getSnapshot();
        container.innerHTML = snapshot.devices.map(d => {
            const isMob = !!(d.alert && d.waterContact);
            const hrColor = d.heartRate > 100 ? 'var(--accent-red)' : d.heartRate > 85 ? 'var(--accent-orange)' : 'var(--accent-green)';
            const avatarClass = isMob ? 'danger' : d.heartRate > 90 ? 'warning' : 'safe';
            const tempColor = d.bodyTemp < 36.0 ? 'var(--accent-orange)' : 'var(--accent-green)';

            return `
                <div class="crew-card ${isMob ? 'alert-state' : ''}">
                    <div class="crew-card-header">
                        <div class="crew-info">
                            <div class="crew-avatar ${avatarClass}">
                                <i class="fas ${isMob ? 'fa-exclamation' : 'fa-user'}"></i>
                            </div>
                            <div>
                                <div class="crew-name">${escapeHtml(d.name)}</div>
                                <div class="crew-role">${escapeHtml(d.id)} · ${escapeHtml(d.role)}</div>
                            </div>
                        </div>
                        <span class="status-badge ${isMob ? 'critical' : d.status}">${isMob ? 'MOB' : escapeHtml(d.status)}</span>
                    </div>
                    <div class="crew-vitals">
                        <div class="vital-item">
                            <div class="vital-icon" style="color: ${hrColor};"><i class="fas fa-heartbeat"></i></div>
                            <div class="vital-value" style="color: ${hrColor};">${d.heartRate > 0 ? d.heartRate : '--'}</div>
                            <div class="vital-label">BPM</div>
                        </div>
                        <div class="vital-item">
                            <div class="vital-icon" style="color: ${tempColor};"><i class="fas fa-thermometer-half"></i></div>
                            <div class="vital-value" style="color: ${tempColor};">${d.bodyTemp > 0 ? Number(d.bodyTemp).toFixed(1) : '--'}</div>
                            <div class="vital-label">°C Temp</div>
                        </div>
                        <div class="vital-item">
                            <div class="vital-icon" style="color: ${d.waterContact ? 'var(--accent-red)' : 'var(--accent-cyan)'};"><i class="fas ${d.waterContact ? 'fa-water' : 'fa-battery-three-quarters'}"></i></div>
                            <div class="vital-value" style="color: ${d.waterContact ? 'var(--accent-red)' : 'var(--accent-cyan)'};">${d.waterContact ? 'WET' : Math.round(d.battery) + '%'}</div>
                            <div class="vital-label">${d.waterContact ? 'Water' : 'Battery'}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    getSignalBars(signal) {
        const strength = signal > -90 ? 4 : signal > -100 ? 3 : signal > -110 ? 2 : 1;
        let bars = '';
        const colorClass = strength >= 3 ? 'active' : strength === 2 ? 'warning' : 'danger';
        for (let i = 1; i <= 4; i++) {
            bars += `<div class="signal-bar ${i <= strength ? colorClass : ''}"></div>`;
        }
        return bars;
    },

    renderHistory() {
        const container = document.getElementById('historyTable');
        if (!container) return;

        const history = MOBApi.getHistory();
        container.innerHTML = history.map(h => `
            <div class="table-row" style="grid-template-columns: 0.8fr 1.2fr 1fr 0.8fr 1fr 1.2fr;">
                <div class="device-name">${escapeHtml(h.device)}</div>
                <div style="font-size: 12px;">${MOBApi.formatDateTime(h.time)}</div>
                <div class="position" style="font-size: 11px;">${Number(h.lat).toFixed(4)},<br>${Number(h.lng).toFixed(4)}</div>
                <div>
                    <div class="signal-bars">${this.getSignalBars(h.signal)}</div>
                </div>
                <div>
                    ${h.status === 'MAN OVERBOARD' ? '<span style="color: var(--accent-red); font-weight: 600; font-size: 11px;">⚠ MOB</span>' :
                      h.status === 'No Fix' ? '<span style="color: var(--accent-orange); font-size: 11px;">No Fix</span>' :
                      '<span style="color: var(--accent-green); font-size: 11px;">● Safe</span>'}
                    <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${h.sats} sats</div>
                </div>
                <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(h.details)}</div>
            </div>
        `).join('');
    },

    renderDevices() {
        const container = document.getElementById('devicesList');
        if (!container) return;

        const snapshot = MOBApi.getSnapshot();

        // Update device stats
        const statCards = document.querySelectorAll('#devicesPage .stat-card .stat-info h3');
        if (statCards.length >= 4) {
            statCards[0].textContent = snapshot.stats.totalDevices;
            statCards[1].textContent = snapshot.stats.onlineDevices;
            statCards[2].textContent = snapshot.devices.filter(d => d.status !== 'offline' || d.alert).length;
            statCards[3].textContent = snapshot.devices.filter(d => d.status === 'offline').length;
        }

        container.innerHTML = snapshot.devices.map(d => {
            const isMob = !!(d.alert && d.waterContact);
            return `
            <div class="device-card" style="${isMob ? 'border-color: rgba(239, 68, 68, 0.3);' : ''}">
                <div class="device-header">
                    <div class="device-title ${d.status}">
                        <div class="device-icon" style="${isMob ? 'background: rgba(239, 68, 68, 0.1); color: var(--accent-red);' : ''}">
                            <i class="fas fa-broadcast-tower"></i>
                        </div>
                        <div>
                            <h4>${escapeHtml(d.id)}</h4>
                            <p>
                                <i class="far fa-user"></i> ${escapeHtml(d.name)}
                                <span style="color: var(--text-muted);">(${escapeHtml(d.role)})</span>
                            </p>
                        </div>
                    </div>
                    <div class="device-status">
                        <span class="status-badge ${isMob ? 'critical' : d.status}">${isMob ? 'MOB ALERT' : escapeHtml(d.status)}</span>
                        <div class="device-toggle ${d.status === 'offline' ? 'off' : ''}" onclick="App.toggleDevice(this, '${escapeHtml(d.id)}')"></div>
                    </div>
                </div>
                <div class="signal-info">
                    <div class="signal-bars">${this.getSignalBars(d.signal)}</div>
                    <span>${Number(d.signal).toFixed(1)} dBm</span>
                    <span style="margin-left: auto;">🔋 ${Math.round(d.battery)}%</span>
                </div>
                <div class="device-details">
                    <div class="detail-item">
                        <label>Latitude</label>
                        <value>${Number(d.lat).toFixed(5)}</value>
                    </div>
                    <div class="detail-item">
                        <label>Longitude</label>
                        <value>${Number(d.lng).toFixed(5)}</value>
                    </div>
                    <div class="detail-item">
                        <label>Last Seen</label>
                        <value>${MOBApi.formatTime(d.lastSeen)}</value>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 12px;">
                    <button class="btn-small" onclick="App.openEditDeviceModal('${escapeHtml(d.id)}')">
                        <i class="fas fa-edit"></i> Edit crew
                    </button>
                </div>
            </div>
            `;
        }).join('');
    },

    // ---- Marine weather card ----
    _weatherTimer: null,

    renderWeather() {
        const container = document.getElementById('weatherCard');
        if (!container) return;
        const vessel = (MOBApi.getSnapshot().vessel || MOBApi.vessel);
        if (!vessel) {
            container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">Weather unavailable — no vessel position.</div>';
            return;
        }
        this._fetchWeather(vessel.lat, vessel.lng, container);
        // Refresh every 10 minutes.
        if (this._weatherTimer) clearInterval(this._weatherTimer);
        this._weatherTimer = setInterval(() => this._fetchWeather(vessel.lat, vessel.lng, container), 10 * 60 * 1000);
    },

    async _fetchWeather(lat, lng, container) {
        const render = (w) => {
            if (!w || w.unavailable) {
                container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;"><i class="fas fa-cloud"></i> Sea conditions unavailable right now.</div>';
                return;
            }
            const dirName = (deg) => {
                if (deg === null || deg === undefined) return '';
                const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
                return dirs[Math.round(deg / 45) % 8];
            };
            container.innerHTML = `
                <div class="weather-grid">
                    <div class="weather-item">
                        <div class="weather-icon" style="color: var(--accent-cyan);"><i class="fas fa-water"></i></div>
                        <div class="weather-value">${w.waveHeightM !== null ? Number(w.waveHeightM).toFixed(1) + ' m' : '--'}</div>
                        <div class="weather-label">Wave height</div>
                    </div>
                    <div class="weather-item">
                        <div class="weather-icon" style="color: var(--accent-green);"><i class="fas fa-wind"></i></div>
                        <div class="weather-value">${w.windSpeedKmh !== null ? Math.round(w.windSpeedKmh) + ' km/h' : '--'}</div>
                        <div class="weather-label">Wind ${dirName(w.windDirectionDeg)}</div>
                    </div>
                    <div class="weather-item">
                        <div class="weather-icon" style="color: var(--accent-blue);"><i class="fas fa-arrows-alt-h"></i></div>
                        <div class="weather-value">${w.oceanCurrentMs !== null ? Number(w.oceanCurrentMs).toFixed(2) + ' m/s' : '--'}</div>
                        <div class="weather-label">Ocean current</div>
                    </div>
                </div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">
                    <i class="far fa-clock"></i> ${escapeHtml(w.fetchedAt ? new Date(w.fetchedAt).toLocaleTimeString() : '')}
                    ${w.cached ? '· cached' : ''}
                </div>`;
        };
        try {
            // Prefer the backend proxy (caching + no CORS issues); fall back
            // to Open-Meteo directly in pure-demo mode.
            const backend = (typeof window !== 'undefined' && window.MOBBackend && window.MOBBackend.connected)
                ? window.MOBBackend.base : null;
            const url = backend
                ? `${backend}/api/weather?lat=${lat}&lng=${lng}`
                : `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&current=wave_height,wind_speed_10m,wind_direction_10m,ocean_current_velocity&timezone=auto`;
            if (backend) {
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) throw new Error('weather fetch failed');
                render(await res.json());
            } else {
                // Demo mode: marine API for waves/current + forecast API for
                // wind (the marine API does not provide wind variables).
                const q = `latitude=${lat}&longitude=${lng}&timezone=auto`;
                const [mRes, wRes] = await Promise.all([
                    fetch(`https://marine-api.open-meteo.com/v1/marine?${q}&current=wave_height,ocean_current_velocity`, { cache: 'no-store' }),
                    fetch(`https://api.open-meteo.com/v1/forecast?${q}&current=wind_speed_10m,wind_direction_10m`, { cache: 'no-store' })
                ]);
                if (!mRes.ok) throw new Error('weather fetch failed');
                const mCur = ((await mRes.json()).current) || {};
                const wCur = wRes.ok ? (((await wRes.json()).current) || {}) : {};
                render({
                    waveHeightM: mCur.wave_height ?? null,
                    windSpeedKmh: wCur.wind_speed_10m ?? null,
                    windDirectionDeg: wCur.wind_direction_10m ?? null,
                    oceanCurrentMs: mCur.ocean_current_velocity != null ? +(mCur.ocean_current_velocity / 3.6).toFixed(2) : null,
                    fetchedAt: new Date().toISOString(),
                    cached: false
                });
            }
        } catch (e) {
            render(null);
        }
    }
};
