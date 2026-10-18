// ===== MOB Guard Map Manager (marine edition) =====
//
// - Default base layer: Esri Ocean basemap + Ocean reference overlay
//   (proper nautical look). Satellite / dark remain switchable.
// - Vessel rendered as a rotating ship icon, with a geofence circle and
//   a track polyline (last 50 positions).
// - Crew markers are keyed divIcons updated via setLatLng (no full
//   re-render), with CSS transitions for smooth movement.
// - MOB devices get a pulsing ring plus a dashed drift-prediction line.

const MapManager = {
    map: null,
    layers: {},
    currentLayer: 'ocean',
    crewMarkers: {},   // deviceId -> L.marker
    pulseRings: {},    // deviceId -> L.circleMarker
    driftLines: {},    // deviceId -> L.polyline
    vesselMarker: null,
    vesselHeading: null,
    geofenceCircle: null,
    trackLine: null,

    OCEAN_BASE: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
    OCEAN_REF: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}',

    init() {
        if (this.map) {
            this.map.invalidateSize();
            this.updateMarkers();
            return;
        }

        this.map = L.map('map', {
            center: [25.760, -80.178],
            zoom: 13,
            zoomControl: false,
            worldCopyJump: true
        });

        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        this.layers = {
            ocean: L.layerGroup([
                L.tileLayer(this.OCEAN_BASE, { attribution: 'Esri, GEBCO, NOAA, NGA, USGS', maxZoom: 19 }),
                L.tileLayer(this.OCEAN_REF, { maxZoom: 19 })
            ]),
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
            dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; CARTO',
                subdomains: 'abcd',
                maxZoom: 19
            })
        };

        this.layers.ocean.addTo(this.map);
        this.currentLayer = 'ocean';

        // Smooth marker movement (divIcon markers position via CSS transform).
        const style = document.createElement('style');
        style.textContent = '.mob-smooth-marker { transition: transform 0.9s linear; }';
        document.head.appendChild(style);

        this.updateMarkers();
        this.renderDeviceList();
    },

    vesselIcon(headingDeg) {
        return L.divIcon({
            className: 'mob-smooth-marker',
            html: `<div style="transform: rotate(${headingDeg}deg); transition: transform 0.9s linear; line-height: 0;">` +
                  `<i class="fas fa-ship" style="font-size: 30px; color: #38bdf8; ` +
                  `filter: drop-shadow(0 0 8px rgba(56,189,248,0.9));"></i></div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });
    },

    crewIcon(color, isMob) {
        const size = isMob ? 26 : 14;
        return L.divIcon({
            className: 'mob-smooth-marker',
            html: `<div style="width:${size}px;height:${size}px;border-radius:50%;` +
                  `background:${color};border:2px solid #fff;` +
                  `box-shadow:0 0 ${isMob ? '18px' : '8px'} ${color};` +
                  `${isMob ? 'animation: mob-pulse 1.2s infinite;' : ''}"></div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
        });
    },

    /** Predict MOB position +2h along its drift vector for the dashed line. */
    driftPrediction(d) {
        const drift = d.mobDrift || { dirDeg: 100, speedKnots: 0.6 };
        const distM = drift.speedKnots * 0.514444 * 7200; // 2 hours
        const rad = (drift.dirDeg * Math.PI) / 180;
        const lat2 = d.lat + (distM * Math.cos(rad)) / 111320;
        const lng2 = d.lng + (distM * Math.sin(rad)) / (111320 * Math.cos((d.lat * Math.PI) / 180));
        return [[d.lat, d.lng], [lat2, lng2]];
    },

    distToVesselM(d, vessel) {
        if (!vessel) return null;
        const dLatM = (d.lat - vessel.lat) * 111320;
        const dLngM = (d.lng - vessel.lng) * 111320 * Math.cos((vessel.lat * Math.PI) / 180);
        return Math.round(Math.hypot(dLatM, dLngM));
    },

    updateMarkers() {
        if (!this.map) return;
        const snapshot = MOBApi.getSnapshot();
        const vessel = snapshot.vessel || MOBApi.vessel;
        const seen = new Set();

        // ---- Vessel marker / geofence / track ----
        if (vessel) {
            const vLatLng = [vessel.lat, vessel.lng];
            if (!this.vesselMarker) {
                this.vesselMarker = L.marker(vLatLng, {
                    icon: this.vesselIcon(vessel.headingDeg || 0),
                    zIndexOffset: 1000,
                    keyboard: false
                }).addTo(this.map);
                this.vesselMarker.bindPopup(
                    `<b>${escapeHtml(vessel.name || 'Vessel')}</b><br>` +
                    `Heading ${Math.round(vessel.headingDeg || 0)}° · ${Number(vessel.speedKnots || 0).toFixed(1)} kt`
                );
                this.vesselHeading = vessel.headingDeg;
            } else {
                this.vesselMarker.setLatLng(vLatLng);
                if (vessel.headingDeg !== undefined && Math.abs((vessel.headingDeg || 0) - (this.vesselHeading || 0)) > 1) {
                    this.vesselMarker.setIcon(this.vesselIcon(vessel.headingDeg || 0));
                    this.vesselHeading = vessel.headingDeg;
                }
                this.vesselMarker.setPopupContent(
                    `<b>${escapeHtml(vessel.name || 'Vessel')}</b><br>` +
                    `Heading ${Math.round(vessel.headingDeg || 0)}° · ${Number(vessel.speedKnots || 0).toFixed(1)} kt`
                );
            }

            const radius = vessel.geofenceRadiusM || 150;
            if (!this.geofenceCircle) {
                this.geofenceCircle = L.circle(vLatLng, {
                    radius,
                    color: '#38bdf8',
                    weight: 1.5,
                    dashArray: '8 6',
                    fillColor: '#38bdf8',
                    fillOpacity: 0.05,
                    interactive: false
                }).addTo(this.map);
            } else {
                this.geofenceCircle.setLatLng(vLatLng);
                this.geofenceCircle.setRadius(radius);
            }

            const track = vessel.track || [];
            if (track.length > 1) {
                const pts = track.map(p => [p.lat, p.lng]);
                if (!this.trackLine) {
                    this.trackLine = L.polyline(pts, {
                        color: '#38bdf8', weight: 2.5, opacity: 0.75, interactive: false
                    }).addTo(this.map);
                } else {
                    this.trackLine.setLatLngs(pts);
                }
            }
        }

        // ---- Crew markers (keyed, smoothly updated) ----
        snapshot.devices.forEach(d => {
            seen.add(d.id);
            const isMob = !!(d.alert && d.waterContact);
            const color = isMob ? '#ef4444' : d.status === 'offline' ? '#6b7280' : '#10b981';
            const latLng = [d.lat, d.lng];
            const distM = this.distToVesselM(d, vessel);

            let marker = this.crewMarkers[d.id];
            if (!marker) {
                marker = L.marker(latLng, { icon: this.crewIcon(color, isMob), keyboard: false }).addTo(this.map);
                this.crewMarkers[d.id] = marker;
            } else {
                marker.setLatLng(latLng);
                marker.setIcon(this.crewIcon(color, isMob));
            }

            marker.bindPopup(
                `<div style="min-width: 220px; font-family: 'Inter', sans-serif;">` +
                `<div style="background: ${color}; color: white; padding: 10px 14px; margin: -14px -20px 10px; border-radius: 12px 12px 0 0; font-weight: 700; font-size: 14px;">` +
                `<i class="fas fa-broadcast-tower" style="margin-right: 6px;"></i>${escapeHtml(d.id)}</div>` +
                `<div style="margin-bottom: 8px;"><strong style="font-size: 15px;">${escapeHtml(d.name)}</strong><br>` +
                `<span style="color: #64748b; font-size: 13px;">${escapeHtml(d.role)}</span></div>` +
                `<div style="font-size: 13px; color: #475569;">` +
                `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Status</span>` +
                `<span style="color:${color};font-weight:600;">${isMob ? '⚠ MAN OVERBOARD' : escapeHtml(String(d.status).toUpperCase())}</span></div>` +
                (distM !== null ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>From vessel</span><span style="font-weight:600;">${distM} m</span></div>` : '') +
                `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Signal</span><span>${Number(d.signal).toFixed(1)} dBm</span></div>` +
                `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Heart rate</span>` +
                `<span style="color:${d.heartRate > 100 ? '#ef4444' : '#10b981'};">${d.heartRate > 0 ? d.heartRate + ' bpm' : 'N/A'}</span></div>` +
                `<div style="display:flex;justify-content:space-between;"><span>Battery</span>` +
                `<span style="color:${d.battery < 20 ? '#ef4444' : '#10b981'};">${Math.round(d.battery)}%</span></div>` +
                `</div></div>`,
                { closeButton: true, className: 'custom-popup' }
            );

            // MOB pulse ring + drift prediction line
            if (isMob) {
                if (!this.pulseRings[d.id]) {
                    this.pulseRings[d.id] = L.circleMarker(latLng, {
                        radius: 30, fillColor: color, color, weight: 0,
                        fillOpacity: 0.25, interactive: false
                    }).addTo(this.map);
                } else {
                    this.pulseRings[d.id].setLatLng(latLng);
                }
                const pred = this.driftPrediction(d);
                if (!this.driftLines[d.id]) {
                    this.driftLines[d.id] = L.polyline(pred, {
                        color: '#ef4444', weight: 2, dashArray: '6 8',
                        opacity: 0.85, interactive: false
                    }).addTo(this.map).bindTooltip('Predicted drift (+2h)', { direction: 'top' });
                } else {
                    this.driftLines[d.id].setLatLngs(pred);
                }
            } else {
                if (this.pulseRings[d.id]) { this.map.removeLayer(this.pulseRings[d.id]); delete this.pulseRings[d.id]; }
                if (this.driftLines[d.id]) { this.map.removeLayer(this.driftLines[d.id]); delete this.driftLines[d.id]; }
            }
        });

        // Remove markers for devices that no longer exist
        Object.keys(this.crewMarkers).forEach(id => {
            if (!seen.has(id)) {
                this.map.removeLayer(this.crewMarkers[id]);
                delete this.crewMarkers[id];
                if (this.pulseRings[id]) { this.map.removeLayer(this.pulseRings[id]); delete this.pulseRings[id]; }
                if (this.driftLines[id]) { this.map.removeLayer(this.driftLines[id]); delete this.driftLines[id]; }
            }
        });

        this.renderDeviceList();
        this.updateMapStats();
    },

    // Backwards-compat alias (old code called addMarkers()).
    addMarkers() { this.updateMarkers(); },
    clearMarkers() {
        Object.values(this.crewMarkers).forEach(m => this.map?.removeLayer(m));
        Object.values(this.pulseRings).forEach(m => this.map?.removeLayer(m));
        Object.values(this.driftLines).forEach(m => this.map?.removeLayer(m));
        if (this.vesselMarker) this.map?.removeLayer(this.vesselMarker);
        if (this.geofenceCircle) this.map?.removeLayer(this.geofenceCircle);
        if (this.trackLine) this.map?.removeLayer(this.trackLine);
        this.crewMarkers = {}; this.pulseRings = {}; this.driftLines = {};
        this.vesselMarker = null; this.geofenceCircle = null; this.trackLine = null;
    },

    updateMapStats() {
        const snapshot = MOBApi.getSnapshot();
        const vessel = snapshot.vessel || MOBApi.vessel;
        const safe = snapshot.devices.filter(d => d.status === 'online' && !(d.alert && d.waterContact)).length;
        const alerts = snapshot.devices.filter(d => d.alert).length;
        const mob = snapshot.devices.filter(d => d.alert && d.waterContact).length;

        const statsContainer = document.querySelector('.map-stats');
        if (statsContainer) {
            statsContainer.innerHTML =
                `<span class="map-stat safe">Safe: ${safe}</span>` +
                `<span class="map-stat alert">Alert: ${alerts}</span>` +
                (mob > 0 ? `<span class="map-stat mob">MOB: ${mob}</span>` : '') +
                (vessel ? `<span class="map-stat" style="color:#38bdf8;"><i class="fas fa-ship"></i> ${escapeHtml(vessel.name || '')} · ${Math.round(vessel.headingDeg || 0)}° · ${Number(vessel.speedKnots || 0).toFixed(0)}kt</span>` : '');
        }
    },

    switchLayer(layerName) {
        if (layerName === this.currentLayer || !this.map) return;
        Object.entries(this.layers).forEach(([name, layer]) => {
            if (name === layerName) { if (!this.map.hasLayer(layer)) layer.addTo(this.map); }
            else if (this.map.hasLayer(layer)) this.map.removeLayer(layer);
        });
        this.currentLayer = layerName;
        document.querySelectorAll('.map-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('btn-' + layerName)?.classList.add('active');
    },

    renderDeviceList() {
        const container = document.getElementById('mapDeviceList');
        if (!container) return;
        const snapshot = MOBApi.getSnapshot();
        const vessel = snapshot.vessel || MOBApi.vessel;
        container.innerHTML = snapshot.devices.map(d => {
            const isMob = !!(d.alert && d.waterContact);
            const distM = this.distToVesselM(d, vessel);
            return `
                <div class="device-card" style="${isMob ? 'border-color: rgba(239, 68, 68, 0.3);' : ''}">
                    <div class="device-header">
                        <div class="device-title ${d.status}">
                            <div class="device-icon" style="${isMob ? 'background: rgba(239, 68, 68, 0.1); color: var(--accent-red);' : ''}">
                                <i class="fas ${isMob ? 'fa-exclamation-triangle' : 'fa-broadcast-tower'}"></i>
                            </div>
                            <div>
                                <h4>${escapeHtml(d.id)}</h4>
                                <p><i class="far fa-user"></i> ${escapeHtml(d.name)} <span style="color: var(--text-muted);">(${escapeHtml(d.role)})</span></p>
                            </div>
                        </div>
                        <span class="status-badge ${isMob ? 'critical' : d.status}" style="font-size: 10px;">
                            ${isMob ? 'MOB' : escapeHtml(d.status)}
                        </span>
                    </div>
                    <div class="device-details">
                        <div class="detail-item">
                            <label>Lat</label>
                            <value>${Number(d.lat).toFixed(5)}</value>
                        </div>
                        <div class="detail-item">
                            <label>Lng</label>
                            <value>${Number(d.lng).toFixed(5)}</value>
                        </div>
                        <div class="detail-item">
                            <label>${isMob ? 'From vessel' : 'Signal'}</label>
                            <value style="color: ${isMob ? 'var(--accent-red)' : d.signal < -110 ? 'var(--accent-red)' : d.signal < -90 ? 'var(--accent-orange)' : 'var(--accent-green)'};">${isMob && distM !== null ? distM + ' m' : Number(d.signal).toFixed(0) + ' dBm'}</value>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
};
