// ===== MOB Guard Alert System =====

const AlertSystem = {
    _toastTimeout: null,

    // Show toast notification
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        if (!toast) return;

        clearTimeout(this._toastTimeout);
        toast.className = 'toast show ' + type;
        document.getElementById('toastMessage').textContent = message;

        this._toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },

    // Resolve alert
    resolveAlert(id) {
        const alert = MOBApi.resolveAlert(id);
        if (alert) {
            this.showToast(`Alert "${alert.type}" resolved`, 'success');
            // Refresh current view
            if (document.getElementById('dashboardPage')?.classList.contains('active')) {
                DashboardView.render();
            }
            if (document.getElementById('alertsPage')?.classList.contains('active')) {
                this.renderAlertsPage();
            }
        }
    },

    // Render alerts on dashboard
    renderDashboardAlerts() {
        const container = document.getElementById('dashboardAlerts');
        if (!container) return;

        const snapshot = MOBApi.getSnapshot();
        const alerts = snapshot.alerts;

        if (alerts.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fas fa-check-circle" style="font-size: 32px; color: var(--accent-green); margin-bottom: 12px; display: block;"></i>All clear — no active alerts</div>';
            return;
        }

        container.innerHTML = alerts.slice(0, 5).map(a => `
            <div class="alert-card ${a.severity === 'High' ? 'warning' : a.severity === 'Medium' ? 'info' : ''}">
                <div class="alert-icon">
                    <i class="fas ${a.icon}"></i>
                </div>
                <div class="alert-content">
                    <h4>
                        ${a.type}
                        <span class="alert-badge ${a.severity === 'High' ? 'warning' : a.severity === 'Medium' ? 'info' : ''}">${a.severity}</span>
                    </h4>
                    <p>${a.message}</p>
                    <div class="alert-meta">
                        <span><i class="far fa-clock"></i> ${MOBApi.formatTime(a.time)}</span>
                        <span><i class="fas fa-broadcast-tower"></i> ${a.device}</span>
                    </div>
                </div>
                <button class="btn-resolve" onclick="AlertSystem.resolveAlert(${a.id})">
                    <i class="fas fa-check"></i> Resolve
                </button>
            </div>
        `).join('');
    },

    // Full alerts page
    renderAlertsPage() {
        const container = document.getElementById('alertsList');
        if (!container) return;

        const allAlerts = MOBApi.alerts;
        const active = allAlerts.filter(a => a.active);
        const resolved = allAlerts.filter(a => !a.active);

        // Update stats
        const statCards = document.querySelectorAll('#alertsPage .stat-card .stat-info h3');
        if (statCards.length >= 4) {
            statCards[0].textContent = allAlerts.length;
            statCards[1].textContent = active.length;
            statCards[1].style.color = active.length > 0 ? 'var(--accent-orange)' : 'var(--accent-green)';
            statCards[2].textContent = resolved.length;
            statCards[3].textContent = allAlerts.filter(a => a.active && a.severity === 'Critical').length;
        }

        container.innerHTML = allAlerts.map(a => `
            <div class="alert-card ${a.severity === 'High' ? 'warning' : a.severity === 'Medium' ? 'info' : ''}" style="${!a.active ? 'opacity: 0.5;' : ''}">
                <div class="alert-icon">
                    <i class="fas ${a.icon}"></i>
                </div>
                <div class="alert-content">
                    <h4>
                        ${a.type}
                        <span class="alert-badge ${a.severity === 'High' ? 'warning' : a.severity === 'Medium' ? 'info' : ''}">${a.severity}</span>
                        ${!a.active ? '<span style="font-size: 11px; color: var(--accent-green);">✓ Resolved</span>' : ''}
                    </h4>
                    <p>${a.message}</p>
                    <div class="alert-meta">
                        <span><i class="far fa-clock"></i> ${MOBApi.formatTime(a.time)}</span>
                        <span><i class="fas fa-broadcast-tower"></i> ${a.device}</span>
                    </div>
                </div>
                ${a.active ? `
                    <button class="btn-resolve" onclick="AlertSystem.resolveAlert(${a.id})">
                        <i class="fas fa-check"></i> Resolve
                    </button>
                ` : ''}
            </div>
        `).join('');
    }
};
