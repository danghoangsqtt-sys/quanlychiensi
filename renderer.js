
const { ipcRenderer } = require('electron');

let currentMode = 'login'; // 'login', 'admin', 'kiosk'
let unitsCache = [];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Commander Button Logic: Show Password Modal
    const btnCommander = document.getElementById('btn-commander');
    if (btnCommander) {
        btnCommander.addEventListener('click', () => {
            const modalEl = document.getElementById('passwordModal');
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
            // Focus on input after modal transition
            modalEl.addEventListener('shown.bs.modal', () => {
                document.getElementById('adminUsername').focus();
            });
        });
    }

    // 2. Soldier Button Logic: Go to Kiosk Mode (No Password)
    const btnSoldier = document.getElementById('btn-soldier');
    if (btnSoldier) {
        btnSoldier.addEventListener('click', () => {
            enterKioskMode();
        });
    }

    // 3. Login Modal Submit Logic
    const btnLoginSubmit = document.getElementById('btn-login-submit');
    if (btnLoginSubmit) {
        btnLoginSubmit.addEventListener('click', attemptLogin);
    }

    // Allow Enter key to submit login
    const inputPass = document.getElementById('adminPassword');
    if (inputPass) {
        inputPass.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') attemptLogin();
        });
    }

    // Initialize listeners for Admin Settings Form
    const settingsForm = document.getElementById('passwordForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const oldPass = formData.get('oldPass');
            const newPass = formData.get('newPass');
            const confirmPass = formData.get('confirmPass');

            if (newPass !== confirmPass) {
                showNotification("Mật khẩu mới không khớp!", "danger");
                return;
            }

            const res = await ipcRenderer.invoke('auth:changePassword', { oldPass, newPass });
            if (res.success) {
                showNotification("Đổi mật khẩu thành công!", "success");
                e.target.reset();
            } else {
                showNotification("Lỗi: " + res.error, "danger");
            }
        });
    }

    // Initialize Unit Form listener
    const unitForm = document.getElementById('unitForm');
    if (unitForm) {
        unitForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('newUnitName').value;
            const parent = document.getElementById('newUnitParent').value || null;

            const res = await ipcRenderer.invoke('db:addUnit', { name, parentId: parent });
            if (res.success) {
                document.getElementById('unitForm').reset();
                loadUnitsTree();
                showNotification("Thêm đơn vị thành công.", "success");
            } else {
                showNotification(res.error, "danger");
            }
        });
    }
});


// --- SYSTEM NOTIFICATIONS ---
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    const id = 'toast-' + Date.now();
    const html = `
        <div id="${id}" class="alert alert-${type} shadow border-0 alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);

    // Auto remove after 4 seconds
    setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 150);
        }
    }, 4000);
}


// --- LOGIN & MODES ---

async function attemptLogin() {
    const userInput = document.getElementById('adminUsername');
    const passInput = document.getElementById('adminPassword');
    const username = userInput.value;
    const password = passInput.value;

    // Send both username and password
    const result = await ipcRenderer.invoke('sys:login', { username, password });

    if (result.success) {
        // Hide modal manually
        const modalEl = document.getElementById('passwordModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        // Remove backdrop if stuck
        document.querySelector('.modal-backdrop')?.remove();
        document.body.classList.remove('modal-open');

        passInput.value = ''; // Clear password
        enterAdminMode();
    } else {
        document.getElementById('loginError').innerText = result.error || "Đăng nhập thất bại.";
        showNotification("Đăng nhập thất bại: " + (result.error || ""), "danger");
    }
}

function enterAdminMode() {
    currentMode = 'admin';
    document.getElementById('login-screen').classList.add('d-none');
    document.getElementById('admin-layout').classList.remove('d-none');
    document.getElementById('kiosk-layout').classList.add('d-none');

    loadUnits(); // Load units for filter
    loadSoldiers();
    loadUnitsTree();
    showNotification("Chào mừng Chỉ huy!", "success");
}

function enterKioskMode() {
    currentMode = 'kiosk';
    document.getElementById('login-screen').classList.add('d-none');
    document.getElementById('admin-layout').classList.add('d-none');
    document.getElementById('kiosk-layout').classList.remove('d-none');

    // Move form to kiosk container
    const formHtml = document.getElementById('form-template').innerHTML;
    document.querySelector('#kiosk-form-card .card-body').innerHTML = formHtml;

    loadUnitsForForm();
    setupFormListener();
}

function logout() {
    location.reload(); // Simplest way to reset state
}

// --- ADMIN NAVIGATION ---
function switchAdminView(view) {
    document.getElementById('view-dashboard').classList.add('d-none');
    document.getElementById('view-units').classList.add('d-none');
    document.getElementById('view-add-container').classList.add('d-none');
    document.getElementById('view-settings').classList.add('d-none');

    document.getElementById('nav-dashboard').classList.remove('active');
    document.getElementById('nav-units').classList.remove('active');
    document.getElementById('nav-add-admin').classList.remove('active');
    document.getElementById('nav-settings').classList.remove('active');

    if (view === 'dashboard') {
        document.getElementById('view-dashboard').classList.remove('d-none');
        document.getElementById('nav-dashboard').classList.add('active');
        document.getElementById('page-title').innerText = "DANH SÁCH QUÂN NHÂN";
        loadSoldiers();
    } else if (view === 'units') {
        document.getElementById('view-units').classList.remove('d-none');
        document.getElementById('nav-units').classList.add('active');
        document.getElementById('page-title').innerText = "QUẢN LÝ ĐƠN VỊ";
        loadUnitsTree();
    } else if (view === 'add') {
        document.getElementById('view-add-container').classList.remove('d-none');
        document.getElementById('nav-add-admin').classList.add('active');
        document.getElementById('page-title').innerText = "NHẬP LIỆU MỚI";

        // Inject Form
        const formHtml = document.getElementById('form-template').innerHTML;
        document.getElementById('view-add-container').innerHTML = `<div class="card shadow-sm p-4">${formHtml}</div>`;
        loadUnitsForForm();
        setupFormListener();
    } else if (view === 'settings') {
        document.getElementById('view-settings').classList.remove('d-none');
        document.getElementById('nav-settings').classList.add('active');
        document.getElementById('page-title').innerText = "CÀI ĐẶT HỆ THỐNG";
    }
}

// --- UNITS MANAGEMENT ---

async function loadUnits() {
    unitsCache = await ipcRenderer.invoke('db:getUnits');

    // Populate Filters
    const filterSelect = document.getElementById('unitFilter');
    if (filterSelect) {
        filterSelect.innerHTML = '<option value="all">Tất cả đơn vị</option>';
        unitsCache.forEach(u => {
            filterSelect.innerHTML += `<option value="${u.id}">${u.ten_don_vi}</option>`;
        });
    }

    // Populate Parent Select in Unit Form
    const parentSelect = document.getElementById('newUnitParent');
    if (parentSelect) {
        parentSelect.innerHTML = '<option value="">-- Cấp cao nhất --</option>';
        unitsCache.forEach(u => {
            parentSelect.innerHTML += `<option value="${u.id}">${u.ten_don_vi}</option>`;
        });
    }
}

async function loadUnitsTree() {
    await loadUnits();
    const container = document.getElementById('unitTreeContainer');
    if (!container) return;

    if (!unitsCache.length) {
        container.innerHTML = '<p class="text-muted">Chưa có đơn vị nào.</p>';
        return;
    }

    // Simple recursive tree builder
    const buildTree = (parentId) => {
        const children = unitsCache.filter(u => u.cap_tren_id === parentId);
        if (!children.length) return '';
        let html = '<ul>';
        children.forEach(c => {
            html += `
                <li>
                    <span class="unit-item" onclick="selectUnit(${c.id})">
                        <i class="bi bi-shield"></i> ${c.ten_don_vi}
                    </span>
                    ${buildTree(c.id)}
                </li>
            `;
        });
        html += '</ul>';
        return html;
    };

    container.innerHTML = buildTree(null);
}

// Make explicit for global onclick in generated HTML tree
window.selectUnit = function (id) {
    if (confirm('Bạn muốn xóa đơn vị này?')) {
        ipcRenderer.invoke('db:deleteUnit', id).then(res => {
            if (res.success) {
                loadUnitsTree();
                showNotification("Đã xóa đơn vị.", "success");
            } else {
                showNotification(res.error, "danger");
            }
        });
    }
}

// --- SOLDIERS ---

async function loadSoldiers() {
    const unitFilterEl = document.getElementById('unitFilter');
    const statusFilterEl = document.getElementById('statusFilter');

    if (!unitFilterEl || !statusFilterEl) return;

    const unitId = unitFilterEl.value;
    const type = statusFilterEl.value;

    const soldiers = await ipcRenderer.invoke('db:getSoldiers', { unitId, type });
    const tbody = document.getElementById('soldierTableBody');
    tbody.innerHTML = '';

    if (soldiers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3 text-muted">Không có dữ liệu</td></tr>';
        return;
    }

    soldiers.forEach(s => {
        let warning = '';
        if (s.vay_no) warning += '<span class="badge bg-warning text-dark me-1">Vay nợ</span>';
        if (s.su_dung_ma_tuy) warning += '<span class="badge bg-danger me-1">Ma túy</span>';

        tbody.innerHTML += `
            <tr>
                <td>${s.id}</td>
                <td class="fw-bold">${s.ho_ten}</td>
                <td>${s.cap_bac}</td>
                <td>${s.don_vi}</td>
                <td>${warning}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="exportPDF(${s.id})">PDF</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteSoldier(${s.id})">Xóa</button>
                </td>
            </tr>
        `;
    });
}

// Expose global functions for table buttons
window.exportPDF = async function (id) {
    const res = await ipcRenderer.invoke('sys:exportPDF', id);
    if (res.success) showNotification('Đã xuất file: ' + res.path, "success");
    else if (!res.cancelled) showNotification('Lỗi: ' + res.error, "danger");
}

window.deleteSoldier = async function (id) {
    if (confirm('Xóa hồ sơ này?')) {
        await ipcRenderer.invoke('db:deleteSoldier', id);
        loadSoldiers();
        showNotification("Đã xóa hồ sơ.", "success");
    }
}

// --- FORM HANDLING ---

function loadUnitsForForm() {
    const select = document.querySelector('select[name="don_vi_id"]');
    if (!select) return;

    if (unitsCache.length === 0) {
        ipcRenderer.invoke('db:getUnits').then(units => {
            unitsCache = units;
            populate();
        });
    } else {
        populate();
    }

    function populate() {
        select.innerHTML = '';
        unitsCache.forEach(u => {
            select.innerHTML += `<option value="${u.id}">${u.ten_don_vi}</option>`;
        });

        // Listener to sync text name
        select.addEventListener('change', () => {
            const text = select.options[select.selectedIndex].text;
            document.getElementById('formUnitName').value = text;
        });
        // Init
        if (select.options.length > 0) {
            document.getElementById('formUnitName').value = select.options[0].text;
        }
    }
}

function setupFormListener() {
    const form = document.querySelector('#soldierForm'); // Selects active form (Kiosk or Admin)
    if (!form) return;

    // Remove old listener if any to avoid duplicates by cloning
    // simple trick: clone and replace, or just ensure run once. 
    // For this context, assuming standard usage.

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        // Int conversions
        ['vay_no', 'su_dung_ma_tuy', 'tham_gia_danh_bac', 'don_vi_id'].forEach(k => {
            if (data[k]) data[k] = parseInt(data[k]);
        });

        const res = await ipcRenderer.invoke('db:addSoldier', data);
        if (res.success) {
            showNotification('Lưu hồ sơ thành công!', "success");
            form.reset();

            if (currentMode === 'kiosk') {
                window.scrollTo(0, 0);
            } else {
                switchAdminView('dashboard');
            }
        } else {
            showNotification('Lỗi: ' + res.error, "danger");
        }
    });
}

// Expose globals for HTML inline calls (Logout, SwitchView)
window.logout = logout;
window.switchAdminView = switchAdminView;
window.loadSoldiers = loadSoldiers;
