// ===== MOB Guard Dashboard View =====

const DashboardView = {

    render() {
        this.renderStats();
        this.renderPositionsTable();
        this.renderCrewTelemetry();
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
            const statusClass = d.alert ? 'critical' : d.status === 'offline' ? 'offline' : 'safe';
            const statusText = d.alert ? 'MAN OVERBOARD' : d.status === 'offline' ? 'Offline' : 'Safe';

            return `
                <div class="table-row">
                    <div class="device-name">
                        ${d.id}
                        <span>${d.name}</span>
                    </div>
                    <div class="position">${d.lat.toFixed(4)},<br>${d.lng.toFixed(4)}</div>
                    <div>
                        <div class="signal-bars">
                            ${this.getSignalBars(d.signal)}
                        </div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${d.signal.toFixed(1)} dBm</div>
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
            const hrColor = d.heartRate > 100 ? 'var(--accent-red)' : d.heartRate > 85 ? 'var(--accent-orange)' : 'var(--accent-green)';
            const avatarClass = d.alert ? 'danger' : d.heartRate > 90 ? 'warning' : 'safe';
            const tempColor = d.bodyTemp < 36.0 ? 'var(--accent-orange)' : 'var(--accent-green)';

            return `
                <div class="crew-card ${d.alert ? 'alert-state' : ''}">
                    <div class="crew-card-header">
                        <div class="crew-info">
                            <div class="crew-avatar ${avatarClass}">
                                <i class="fas ${d.alert ? 'fa-exclamation' : 'fa-user'}"></i>
                            </div>
                            <div>
                                <div class="crew-name">${d.name}</div>
                                <div class="crew-role">${d.id} · ${d.role}</div>
                            </div>
                        </div>
                        <span class="status-badge ${d.alert ? 'critical' : d.status}">${d.alert ? 'MOB' : d.status}</span>
                    </div>
                    <div class="crew-vitals">
                        <div class="vital-item">
                            <div class="vital-icon" style="color: ${hrColor};"><i class="fas fa-heartbeat"></i></div>
                            <div class="vital-value" style="color: ${hrColor};">${d.heartRate > 0 ? d.heartRate : '--'}</div>
                            <div class="vital-label">BPM</div>
                        </div>
                        <div class="vital-item">
                            <div class="vital-icon" style="color: ${tempColor};"><i class="fas fa-thermometer-half"></i></div>
                            <div class="vital-value" style="color: ${tempColor};">${d.bodyTemp > 0 ? d.bodyTemp.toFixed(1) : '--'}</div>
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
                <div class="device-name">${h.device}</div>
                <div style="font-size: 12px;">${MOBApi.formatDateTime(h.time)}</div>
                <div class="position" style="font-size: 11px;">${h.lat.toFixed(4)},<br>${h.lng.toFixed(4)}</div>
                <div>
                    <div class="signal-bars">${this.getSignalBars(h.signal)}</div>
                </div>
                <div>
                    ${h.status === 'MAN OVERBOARD' ? '<span style="color: var(--accent-red); font-weight: 600; font-size: 11px;">⚠ MOB</span>' :
                      h.status === 'No Fix' ? '<span style="color: var(--accent-orange); font-size: 11px;">No Fix</span>' :
                      '<span style="color: var(--accent-green); font-size: 11px;">● Safe</span>'}
                    <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${h.sats} sats</div>
                </div>
                <div style="font-size: 11px; color: var(--text-muted);">${h.details}</div>
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

        container.innerHTML = snapshot.devices.map(d => `
            <div class="device-card" style="${d.alert ? 'border-color: rgba(239, 68, 68, 0.3);' : ''}">
                <div class="device-header">
                    <div class="device-title ${d.status}">
                        <div class="device-icon" style="${d.alert ? 'background: rgba(239, 68, 68, 0.1); color: var(--accent-red);' : ''}">
                            <i class="fas fa-broadcast-tower"></i>
                        </div>
                        <div>
                            <h4>${d.id}</h4>
                            <p>
                                <i class="far fa-user"></i> ${d.name}
                                <span style="color: var(--text-muted);">(${d.role})</span>
                            </p>
                        </div>
                    </div>
                    <div class="device-status">
                        <span class="status-badge ${d.alert ? 'critical' : d.status}">${d.alert ? 'MOB ALERT' : d.status}</span>
                        <div class="device-toggle ${d.status === 'offline' ? 'off' : ''}" onclick="App.toggleDevice(this, '${d.id}')"></div>
                    </div>
                </div>
                <div class="signal-info">
                    <div class="signal-bars">${this.getSignalBars(d.signal)}</div>
                    <span>${d.signal.toFixed(1)} dBm</span>
                    <span style="margin-left: auto;">🔋 ${Math.round(d.battery)}%</span>
                </div>
                <div class="device-details">
                    <div class="detail-item">
                        <label>Latitude</label>
                        <value>${d.lat.toFixed(5)}</value>
                    </div>
                    <div class="detail-item">
                        <label>Longitude</label>
                        <value>${d.lng.toFixed(5)}</value>
                    </div>
                    <div class="detail-item">
                        <label>Last Seen</label>
                        <value>${MOBApi.formatTime(d.lastSeen)}</value>
                    </div>
                </div>
            </div>
        `).join('');
    }
};
