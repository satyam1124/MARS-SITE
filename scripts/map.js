// ===== MOB Guard Map Manager =====

const MapManager = {
    map: null,
    markers: [],
    pulseMarkers: [],
    currentLayer: 'dark',
    layers: {},

    init() {
        if (this.map) {
            this.map.invalidateSize();
            this.updateMarkers();
            return;
        }

        this.map = L.map('map', {
            center: [25.77, -80.18],
            zoom: 13,
            zoomControl: false
        });

        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        // Define tile layers
        this.layers = {
            satellite: L.layerGroup([
                L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                    attribution: 'Tiles &copy; Esri',
                    maxZoom: 19
                }),
                L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; CARTO',
                    subdomains: 'abcd',
                    maxZoom: 20
                })
            ]),
            standard: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap',
                maxZoom: 19
            }),
            dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; CARTO',
                subdomains: 'abcd',
                maxZoom: 19
            })
        };

        // Start with dark theme (matches dashboard)
        this.layers.dark.addTo(this.map);
        this.addMarkers();
        this.renderDeviceList();
    },

    addMarkers() {
        this.clearMarkers();
        const snapshot = MOBApi.getSnapshot();

        snapshot.devices.forEach(d => {
            const color = d.alert ? '#ef4444' : d.status === 'offline' ? '#6b7280' : '#10b981';

            const marker = L.circleMarker([d.lat, d.lng], {
                radius: d.alert ? 16 : 10,
                fillColor: color,
                color: 'rgba(255,255,255,0.8)',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9
            }).addTo(this.map);

            this.markers.push(marker);

            // Pulse effect for alert devices
            if (d.alert) {
                const pulse = L.circleMarker([d.lat, d.lng], {
                    radius: 30,
                    fillColor: color,
                    color: color,
                    weight: 0,
                    fillOpacity: 0.25,
                    interactive: false
                }).addTo(this.map);
                this.pulseMarkers.push(pulse);

                // Animate pulse
                let growing = true;
                const pulseInterval = setInterval(() => {
                    if (!this.map) { clearInterval(pulseInterval); return; }
                    const r = pulse.getRadius();
                    if (growing) {
                        pulse.setRadius(r + 1.5);
                        if (r >= 40) growing = false;
                    } else {
                        pulse.setRadius(r - 1.5);
                        if (r <= 25) growing = true;
                    }
                }, 80);
            }

            // Popup with crew details
            marker.bindPopup(`
                <div style="min-width: 220px; font-family: 'Inter', sans-serif;">
                    <div style="background: ${color}; color: white; padding: 12px 16px; margin: -16px -16px 12px; border-radius: 8px 8px 0 0; font-weight: 700; font-size: 14px;">
                        <i class="fas fa-broadcast-tower" style="margin-right: 6px;"></i>${d.id}
                    </div>
                    <div style="margin-bottom: 8px;">
                        <strong style="color: #1e293b; font-size: 15px;">${d.name}</strong><br>
                        <span style="color: #64748b; font-size: 13px;">${d.role}</span>
                    </div>
                    <div style="border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 13px; color: #475569;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <span>Status</span>
                            <span style="color: ${color}; font-weight: 600;">${d.alert ? '⚠ MAN OVERBOARD' : d.status.toUpperCase()}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <span>Signal</span>
                            <span>${d.signal.toFixed(1)} dBm</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <span>Heart Rate</span>
                            <span style="color: ${d.heartRate > 100 ? '#ef4444' : '#10b981'};">${d.heartRate > 0 ? d.heartRate + ' bpm' : 'N/A'}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Battery</span>
                            <span style="color: ${d.battery < 20 ? '#ef4444' : '#10b981'};">${Math.round(d.battery)}%</span>
                        </div>
                    </div>
                </div>
            `, {
                closeButton: true,
                className: 'custom-popup'
            });
        });
    },

    clearMarkers() {
        this.markers.forEach(m => this.map?.removeLayer(m));
        this.pulseMarkers.forEach(m => this.map?.removeLayer(m));
        this.markers = [];
        this.pulseMarkers = [];
    },

    updateMarkers() {
        this.addMarkers();
        this.renderDeviceList();
        this.updateMapStats();
    },

    updateMapStats() {
        const snapshot = MOBApi.getSnapshot();
        const safe = snapshot.devices.filter(d => d.status === 'online' && !d.alert).length;
        const alerts = snapshot.devices.filter(d => d.alert).length;
        const mob = snapshot.devices.filter(d => d.alert && d.waterContact).length;

        const statsContainer = document.querySelector('.map-stats');
        if (statsContainer) {
            statsContainer.innerHTML = `
                <span class="map-stat safe">Safe: ${safe}</span>
                <span class="map-stat alert">Alert: ${alerts}</span>
                ${mob > 0 ? `<span class="map-stat mob">MOB: ${mob}</span>` : ''}
            `;
        }
    },

    switchLayer(layerName) {
        if (layerName === this.currentLayer || !this.map) return;

        // Remove current
        if (this.currentLayer === 'satellite') {
            this.map.removeLayer(this.layers.satellite);
        } else {
            this.map.removeLayer(this.layers[this.currentLayer]);
        }

        // Add new
        if (layerName === 'satellite') {
            this.layers.satellite.addTo(this.map);
        } else {
            this.layers[layerName].addTo(this.map);
        }

        this.currentLayer = layerName;

        // Update buttons
        document.querySelectorAll('.map-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('btn-' + layerName)?.classList.add('active');
    },

    renderDeviceList() {
        const container = document.getElementById('mapDeviceList');
        if (!container) return;

        const snapshot = MOBApi.getSnapshot();
        container.innerHTML = snapshot.devices.map(d => {
            const statusColor = d.alert ? 'var(--accent-red)' : d.status === 'online' ? 'var(--accent-green)' : 'var(--text-muted)';
            return `
                <div class="device-card" style="${d.alert ? 'border-color: rgba(239, 68, 68, 0.3);' : ''}">
                    <div class="device-header">
                        <div class="device-title ${d.status}">
                            <div class="device-icon" style="${d.alert ? 'background: rgba(239, 68, 68, 0.1); color: var(--accent-red);' : ''}">
                                <i class="fas ${d.alert ? 'fa-exclamation-triangle' : 'fa-broadcast-tower'}"></i>
                            </div>
                            <div>
                                <h4>${d.id}</h4>
                                <p><i class="far fa-user"></i> ${d.name} <span style="color: var(--text-muted);">(${d.role})</span></p>
                            </div>
                        </div>
                        <span class="status-badge ${d.alert ? 'critical' : d.status}" style="font-size: 10px;">
                            ${d.alert ? 'MOB' : d.status}
                        </span>
                    </div>
                    <div class="device-details">
                        <div class="detail-item">
                            <label>Lat</label>
                            <value>${d.lat.toFixed(5)}</value>
                        </div>
                        <div class="detail-item">
                            <label>Lng</label>
                            <value>${d.lng.toFixed(5)}</value>
                        </div>
                        <div class="detail-item">
                            <label>Signal</label>
                            <value style="color: ${d.signal < -110 ? 'var(--accent-red)' : d.signal < -90 ? 'var(--accent-orange)' : 'var(--accent-green)'};">${d.signal.toFixed(0)} dBm</value>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
};
