// ===== MOB Guard Application Controller =====

const App = {
    currentUser: null,
    currentPage: 'dashboard',
    editTarget: null,
    deleteTarget: null,

    init() {
        // Initialize API
        MOBApi.init();

        // Check saved session
        if (localStorage.getItem('mob_logged_in') === 'true') {
            const savedUser = localStorage.getItem('mob_user');
            const savedRole = localStorage.getItem('mob_role');
            if (savedUser) {
                this.currentUser = { username: savedUser, role: savedRole || 'ADMIN' };
                document.getElementById('currentUser').textContent = savedUser;
                this.showApp();
            }
        }

        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));

        // Subscribe to real-time updates
        MOBApi.onUpdate((event, data) => {
            if (this.currentPage === 'dashboard') {
                DashboardView.render();
            }
            if (this.currentPage === 'livemap' && MapManager.map) {
                MapManager.updateMarkers();
            }
        });

        // Emergency time updater
        setInterval(() => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
            const el = document.getElementById('emergencyTime');
            if (el) el.textContent = timeStr.split(' ')[0];
        }, 1000);

        // Close dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-select')) {
                document.querySelectorAll('.custom-select').forEach(s => s.classList.remove('active'));
            }
        });

        // Escape key handler
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                this.closeEditModal();
                this.closeAddUserModal();
            }
        });
    },

    // === Authentication ===
    handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const btn = document.getElementById('loginBtn');

        btn.innerHTML = '<span class="loading"></span> Signing in...';

        setTimeout(() => {
            const user = MOBApi.authenticate(username, password);
            if (user) {
                this.currentUser = { username: user.username, role: user.role.toUpperCase() };
                document.getElementById('currentUser').textContent = username;
                localStorage.setItem('mob_logged_in', 'true');
                localStorage.setItem('mob_user', username);
                localStorage.setItem('mob_role', user.role.toUpperCase());
                this.showApp();
                AlertSystem.showToast('Welcome back, ' + username + '!', 'success');
            } else {
                btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
                AlertSystem.showToast('Invalid credentials', 'error');
            }
        }, 800);
    },

    showApp() {
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('appContainer').classList.add('active');
        DashboardView.render();
    },

    logout() {
        localStorage.removeItem('mob_logged_in');
        localStorage.removeItem('mob_user');
        localStorage.removeItem('mob_role');
        location.reload();
    },

    togglePassword() {
        const input = document.getElementById('password');
        const icon = input.parentElement.querySelector('.toggle-password i');
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'far fa-eye-slash';
        } else {
            input.type = 'password';
            icon.className = 'far fa-eye';
        }
    },

    // === Navigation ===
    toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebarOverlay').classList.toggle('active');
    },

    navigateTo(page) {
        this.currentPage = page;

        document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

        document.getElementById(page + 'Page')?.classList.add('active');

        const navItems = document.querySelectorAll('.sidebar-nav .nav-item:not(a)');
        const pageIndex = ['dashboard', 'livemap', 'history', 'alerts', 'devices'].indexOf(page);
        if (pageIndex >= 0 && navItems[pageIndex]) navItems[pageIndex].classList.add('active');

        // Admin nav items
        const adminItems = document.querySelectorAll('.sidebar-nav .nav-section:nth-child(2) .nav-item');
        const adminIndex = ['users', 'settings'].indexOf(page);
        if (adminIndex >= 0 && adminItems[adminIndex]) adminItems[adminIndex].classList.add('active');

        const titles = {
            dashboard: { title: 'Dashboard', subtitle: 'Real-time vessel monitoring overview' },
            livemap: { title: 'Live Map', subtitle: 'Real-time vessel tracking and positioning' },
            history: { title: 'History', subtitle: 'Telemetry records and event logs' },
            alerts: { title: 'Alerts', subtitle: 'Manage and respond to security alerts' },
            devices: { title: 'Devices', subtitle: 'Manage MOB tracking devices' },
            users: { title: 'Users', subtitle: 'Manage system users and permissions' },
            settings: { title: 'Settings', subtitle: 'System configuration and preferences' }
        };

        const titleData = titles[page];
        if (titleData) {
            document.getElementById('pageTitle').textContent = titleData.title;
            document.getElementById('pageSubtitle').textContent = titleData.subtitle;
        }

        this.toggleSidebar();

        // Page-specific init
        if (page === 'dashboard') DashboardView.render();
        if (page === 'livemap') setTimeout(() => MapManager.init(), 100);
        if (page === 'history') DashboardView.renderHistory();
        if (page === 'alerts') AlertSystem.renderAlertsPage();
        if (page === 'devices') DashboardView.renderDevices();
        if (page === 'users') this.renderUsers();
    },

    closeEmergency() {
        document.getElementById('emergencyBanner').style.display = 'none';
        document.getElementById('mainContent').classList.remove('with-emergency');
    },

    // === Device Toggle ===
    toggleDevice(el, id) {
        el.classList.toggle('off');
        const isOff = el.classList.contains('off');
        AlertSystem.showToast(`Device ${id} ${isOff ? 'disabled' : 'enabled'}`, 'success');
    },

    // === User Management ===
    renderUsers() {
        const container = document.getElementById('usersList');
        if (!container) return;

        document.getElementById('totalUsers').textContent = MOBApi.users.length;

        container.innerHTML = MOBApi.users.map(u => `
            <div class="user-card" data-user-id="${u.id}">
                <div class="user-info-card">
                    <div class="user-avatar-large" style="color: ${u.role === 'admin' ? 'var(--accent-cyan)' : 'var(--text-muted)'};">
                        <i class="fas ${u.role === 'admin' ? 'fa-shield-alt' : 'fa-user'}"></i>
                    </div>
                    <div>
                        <h4>${u.username}</h4>
                        <p>${u.email}</p>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span class="role-badge ${u.role}">${u.role}</span>
                    <div class="user-actions">
                        <button onclick="App.openEditUserModal(${u.id})" title="Edit User">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="delete" onclick="App.deleteUser(${u.id})" title="Delete User">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    },

    // Add User
    openAddUserModal() {
        document.getElementById('addUserModal').classList.add('active');
        document.getElementById('newUsername').value = '';
        document.getElementById('newEmail').value = '';
        document.getElementById('newRole').value = 'viewer';
        document.getElementById('newPassword').value = '';
    },

    closeAddUserModal() {
        document.getElementById('addUserModal').classList.remove('active');
    },

    saveNewUser() {
        const username = document.getElementById('newUsername').value.trim();
        const email = document.getElementById('newEmail').value.trim();
        const role = document.getElementById('newRole').value;
        const password = document.getElementById('newPassword').value;

        if (!username || !email || !password) {
            AlertSystem.showToast('Please fill all required fields', 'error');
            return;
        }

        const user = MOBApi.addUser({ username, email, role, password });
        if (!user) {
            AlertSystem.showToast('Username already exists', 'error');
            return;
        }

        this.renderUsers();
        this.closeAddUserModal();
        AlertSystem.showToast(`User ${username} created successfully`, 'success');
    },

    // Edit User
    openEditUserModal(userId) {
        const user = MOBApi.users.find(u => u.id === userId);
        if (!user) return;

        this.editTarget = userId;
        document.getElementById('editUsername').value = user.username;
        document.getElementById('editEmail').value = user.email;
        document.getElementById('editRole').value = user.role;
        document.getElementById('editPassword').value = '';
        document.getElementById('editUserModal').classList.add('active');
    },

    closeEditModal() {
        document.getElementById('editUserModal').classList.remove('active');
        this.editTarget = null;
    },

    saveUserEdit() {
        if (!this.editTarget) return;

        const user = MOBApi.users.find(u => u.id === this.editTarget);
        if (!user) return;

        const newUsername = document.getElementById('editUsername').value.trim();
        const newEmail = document.getElementById('editEmail').value.trim();
        const newRole = document.getElementById('editRole').value;
        const newPassword = document.getElementById('editPassword').value;

        if (!newUsername || !newEmail) {
            AlertSystem.showToast('Username and email are required', 'error');
            return;
        }

        if (newUsername !== user.username && MOBApi.users.find(u => u.username === newUsername)) {
            AlertSystem.showToast('Username already exists', 'error');
            return;
        }

        const updates = { username: newUsername, email: newEmail, role: newRole };
        if (newPassword) updates.password = newPassword;
        MOBApi.updateUser(this.editTarget, updates);

        this.renderUsers();
        this.closeEditModal();
        AlertSystem.showToast(`User ${newUsername} updated successfully`, 'success');

        if (this.currentUser && this.currentUser.username === user.username) {
            document.getElementById('currentUser').textContent = newUsername;
            this.currentUser.role = newRole.toUpperCase();
        }
    },

    // Delete User
    deleteUser(userId) {
        const user = MOBApi.users.find(u => u.id === userId);
        if (!user) return;

        if (this.currentUser && this.currentUser.username === user.username) {
            AlertSystem.showToast('Cannot delete your own account', 'error');
            return;
        }

        if (user.role === 'admin' && MOBApi.users.filter(u => u.role === 'admin').length === 1) {
            AlertSystem.showToast('Cannot delete the last admin user', 'error');
            return;
        }

        this.deleteTarget = userId;
        document.getElementById('deleteModal').classList.add('active');
    },

    closeModal() {
        document.getElementById('deleteModal').classList.remove('active');
        this.deleteTarget = null;
    },

    confirmDelete() {
        if (this.deleteTarget) {
            const user = MOBApi.users.find(u => u.id === this.deleteTarget);
            MOBApi.deleteUser(this.deleteTarget);
            this.renderUsers();
            AlertSystem.showToast(`User ${user?.username} deleted`, 'success');
            this.closeModal();
        }
    },

    // === Settings ===
    selectOption(el, value) {
        el.parentElement.parentElement.querySelector('input').value = value;
        el.parentElement.querySelectorAll('.select-option').forEach(o => o.classList.remove('selected'));
        el.classList.add('selected');
    },

    saveSettings() {
        AlertSystem.showToast('Settings saved successfully', 'success');
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
