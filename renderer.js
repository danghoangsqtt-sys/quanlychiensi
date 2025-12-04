

const { ipcRenderer } = require('electron');
// Ensure Bootstrap JS and Popper are loaded correctly
const bootstrap = require('bootstrap/dist/js/bootstrap.bundle.min.js');

let currentMode = 'login'; // 'login', 'admin', 'kiosk'
let unitsCache = [];

// FIX: Inject CSS to ensure Modal appears ABOVE the Login Screen (z-index 9999)
// Bootstrap default modal z-index is 1055, which is behind the login screen.
const style = document.createElement('style');
style.textContent = `
    .modal { z-index: 10050 !important; }
    .modal-backdrop { z-index: 10040 !important; }
`;
document.head.appendChild(style);

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {

    // Init Admin Password if not set
    if (!localStorage.getItem('admin_password')) {
        localStorage.setItem('admin_password', '123456');
    }

    // Initialize Bootstrap Modal for Login
    const loginModalEl = document.getElementById('loginModal');
    let loginModal = null;
    if (loginModalEl) {
        loginModal = new bootstrap.Modal(loginModalEl);
    }

    // 1. Logic nút Chỉ huy: Mở Modal Đăng nhập thay vì vào thẳng
    const btnCommander = document.getElementById('btn-commander');
    if (btnCommander) {
        btnCommander.addEventListener('click', () => {
            if (loginModal) {
                loginModal.show();
                // Focus vào ô username sau khi modal hiện
                setTimeout(() => {
                    const userField = document.getElementById('loginUsername');
                    if (userField) userField.focus();
                }, 500);
            }
        });
    }

    // Xử lý Form Đăng nhập
    const adminLoginForm = document.getElementById('adminLoginForm');
    if (adminLoginForm) {
        adminLoginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const u = document.getElementById('loginUsername').value;
            const p = document.getElementById('loginPassword').value;
            const savedPass = localStorage.getItem('admin_password');

            // Kiểm tra tài khoản admin (Dùng localStorage để lưu mật khẩu)
            if (u === 'admin' && p === savedPass) {
                if (loginModal) loginModal.hide();
                enterAdminMode();

                // Reset form để bảo mật
                adminLoginForm.reset();
            } else {
                showNotification('Tên đăng nhập hoặc mật khẩu không đúng!', 'danger');
            }
        });
    }

    // 2. Logic nút Chiến sĩ: Vào thẳng chế độ Kiosk
    const btnSoldier = document.getElementById('btn-soldier');
    if (btnSoldier) {
        btnSoldier.addEventListener('click', () => {
            enterKioskMode();
        });
    }

    // Logic form thêm đơn vị
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

    // Logic đổi mật khẩu
    const changePassForm = document.getElementById('changePasswordForm');
    if (changePassForm) {
        changePassForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const currentPass = document.getElementById('currentPassword').value;
            const newPass = document.getElementById('newPassword').value;
            const confirmPass = document.getElementById('confirmNewPassword').value;
            const savedPass = localStorage.getItem('admin_password');

            if (currentPass !== savedPass) {
                showNotification('Mật khẩu hiện tại không đúng', 'danger');
                return;
            }

            if (newPass.length < 4) {
                showNotification('Mật khẩu mới phải có ít nhất 4 ký tự', 'danger');
                return;
            }

            if (newPass !== confirmPass) {
                showNotification('Mật khẩu mới không trùng khớp', 'danger');
                return;
            }

            localStorage.setItem('admin_password', newPass);
            showNotification('Đổi mật khẩu thành công!', 'success');
            changePassForm.reset();
        });
    }
});


// --- SYSTEM NOTIFICATIONS ---
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const id = 'toast-' + Date.now();
    // Giao diện Toast hiện đại
    const html = `
        <div id="${id}" class="alert alert-${type} toast-modern border-0 alert-dismissible fade show d-flex align-items-center" role="alert">
            <i class="bi bi-${type === 'success' ? 'check-circle' : 'exclamation-triangle'} me-2 fs-5"></i>
            <div>${message}</div>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);

    setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 150);
        }
    }, 4000);
}


// --- MODES ---

function enterAdminMode() {
    currentMode = 'admin';

    // Hiệu ứng chuyển cảnh
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
        loginScreen.style.opacity = '0';
        setTimeout(() => {
            loginScreen.classList.add('d-none');
            document.getElementById('admin-layout').classList.remove('d-none');
            document.getElementById('kiosk-layout').classList.add('d-none');
            loginScreen.style.opacity = '1';
        }, 300);
    }

    loadUnits();
    loadSoldiers();
    loadUnitsTree();
    showNotification("Đã truy cập chế độ Chỉ huy.", "success");
}

function enterKioskMode() {
    currentMode = 'kiosk';

    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
        loginScreen.style.opacity = '0';
        setTimeout(() => {
            loginScreen.classList.add('d-none');
            document.getElementById('admin-layout').classList.add('d-none');
            document.getElementById('kiosk-layout').classList.remove('d-none');
            loginScreen.style.opacity = '1';
        }, 300);
    }

    // Inject Form template vào thẻ Card (Chế độ kiosk)
    const formTemplate = document.getElementById('form-template');
    if (formTemplate) {
        const formHtml = formTemplate.innerHTML;
        const kioskBody = document.querySelector('#kiosk-form-card .card-body');
        if (kioskBody) kioskBody.innerHTML = formHtml;
    }

    loadUnitsForForm();
    setupFormListener();
}

function logout() {
    location.reload();
}

// --- ADMIN NAVIGATION ---
function switchAdminView(view) {
    const views = ['dashboard', 'units', 'add', 'settings'];
    const navs = ['nav-dashboard', 'nav-units', 'nav-add-admin', 'nav-settings'];

    // Ẩn tất cả views và deactive navs
    views.forEach(v => {
        const el = document.getElementById('view-' + (v === 'add' ? 'add-container' : v));
        if (el) el.classList.add('d-none');
    });
    navs.forEach(n => {
        const el = document.getElementById(n);
        if (el) el.classList.remove('active');
    });

    // Hiện view được chọn
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
        const formTemplate = document.getElementById('form-template');
        if (formTemplate) {
            const formHtml = formTemplate.innerHTML;
            document.getElementById('view-add-container').innerHTML = `<div class="card shadow-sm border-0"><div class="card-body p-4">${formHtml}</div></div>`;
            loadUnitsForForm();
            setupFormListener();
        }
    } else if (view === 'settings') {
        document.getElementById('view-settings').classList.remove('d-none');
        document.getElementById('nav-settings').classList.add('active');
        document.getElementById('page-title').innerText = "CÀI ĐẶT HỆ THỐNG";
    }
}

// --- UNITS MANAGEMENT ---

async function loadUnits() {
    unitsCache = await ipcRenderer.invoke('db:getUnits');

    // Fill filter dropdown
    const filterSelect = document.getElementById('unitFilter');
    if (filterSelect) {
        filterSelect.innerHTML = '<option value="all">Tất cả đơn vị</option>';
        unitsCache.forEach(u => {
            filterSelect.innerHTML += `<option value="${u.id}">${u.ten_don_vi}</option>`;
        });
    }

    // Fill parent select
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
        container.innerHTML = '<div class="text-center text-muted py-3">Chưa có đơn vị nào</div>';
        return;
    }

    const buildTree = (parentId) => {
        const children = unitsCache.filter(u => u.cap_tren_id === parentId);
        if (!children.length) return '';
        let html = '<ul class="list-unstyled ps-3 border-start border-2">';
        children.forEach(c => {
            html += `
                <li class="mb-2">
                    <div class="d-flex align-items-center p-2 rounded hover-bg-light" style="cursor: pointer;" onclick="selectUnit(${c.id})">
                        <i class="bi bi-diagram-3 me-2 text-military"></i> 
                        <span class="fw-medium">${c.ten_don_vi}</span>
                    </div>
                    ${buildTree(c.id)}
                </li>
            `;
        });
        html += '</ul>';
        return html;
    };

    container.innerHTML = buildTree(null);
}

window.selectUnit = function (id) {
    // Trong thực tế có thể hiện modal sửa/xóa, ở đây demo xóa
    if (confirm('Bạn có chắc muốn xóa đơn vị này? Hành động này không thể hoàn tác.')) {
        ipcRenderer.invoke('db:deleteUnit', id).then(res => {
            if (res.success) {
                loadUnitsTree();
                showNotification("Đã xóa đơn vị thành công.", "success");
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
    if (!tbody) return;

    tbody.innerHTML = '';

    if (soldiers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center p-5 text-muted">
                    <i class="bi bi-inbox fs-1 d-block mb-2"></i>
                    Không tìm thấy dữ liệu phù hợp
                </td>
            </tr>`;
        return;
    }

    soldiers.forEach(s => {
        let warning = '';
        if (s.vay_no) warning += '<span class="badge bg-warning text-dark me-1"><i class="bi bi-cash"></i> Vay nợ</span>';
        if (s.su_dung_ma_tuy) warning += '<span class="badge bg-danger me-1"><i class="bi bi-exclamation-octagon"></i> Ma túy</span>';
        if (!warning) warning = '<span class="text-muted small">An toàn</span>';

        tbody.innerHTML += `
            <tr>
                <td class="ps-4 text-muted">#${s.id}</td>
                <td>
                    <div class="fw-bold text-military">${s.ho_ten}</div>
                    <small class="text-muted">${s.ngay_sinh || '---'}</small>
                </td>
                <td><span class="badge bg-light text-dark border">${s.cap_bac}</span></td>
                <td>${s.don_vi}</td>
                <td>${warning}</td>
                <td class="text-end pe-4">
                    <div class="btn-group">
                        <button class="btn btn-sm btn-light text-primary border" onclick="exportPDF(${s.id})" title="Xuất PDF">
                            <i class="bi bi-file-earmark-pdf"></i>
                        </button>
                        <button class="btn btn-sm btn-light text-danger border" onclick="deleteSoldier(${s.id})" title="Xóa">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
}

window.exportPDF = async function (id) {
    const res = await ipcRenderer.invoke('sys:exportPDF', id);
    if (res.success) showNotification('Xuất file thành công: ' + res.path, "success");
    else if (!res.cancelled) showNotification('Lỗi xuất file: ' + res.error, "danger");
}

window.deleteSoldier = async function (id) {
    if (confirm('CẢNH BÁO: Bạn có chắc chắn muốn xóa hồ sơ này không?')) {
        await ipcRenderer.invoke('db:deleteSoldier', id);
        loadSoldiers();
        showNotification("Đã xóa hồ sơ thành công.", "success");
    }
}

// --- FORM HANDLING ---

function loadUnitsForForm() {
    const select = document.querySelector('select[name="don_vi_id"]');
    if (!select) return;

    const populate = () => {
        select.innerHTML = '';
        unitsCache.forEach(u => {
            select.innerHTML += `<option value="${u.id}">${u.ten_don_vi}</option>`;
        });

        // Sync text name on change
        select.onchange = () => {
            const text = select.options[select.selectedIndex].text;
            const hiddenInput = document.getElementById('formUnitName');
            if (hiddenInput) hiddenInput.value = text;
        };

        // Initial set
        if (select.options.length > 0) {
            select.onchange();
        }
    };

    if (unitsCache.length === 0) {
        ipcRenderer.invoke('db:getUnits').then(units => {
            unitsCache = units;
            populate();
        });
    } else {
        populate();
    }
}

function setupFormListener() {
    const form = document.querySelector('#soldierForm');
    if (!form) return;

    // Clone to remove old listeners
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);

    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        // Int conversions
        ['vay_no', 'su_dung_ma_tuy', 'tham_gia_danh_bac', 'don_vi_id'].forEach(k => {
            if (data[k]) data[k] = parseInt(data[k]);
        });

        const res = await ipcRenderer.invoke('db:addSoldier', data);
        if (res.success) {
            showNotification('Lưu hồ sơ mới thành công!', "success");
            newForm.reset();

            if (currentMode === 'kiosk') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                switchAdminView('dashboard');
            }
        } else {
            showNotification('Lỗi khi lưu: ' + res.error, "danger");
        }
    });
}

// Global exposure
window.logout = logout;
window.switchAdminView = switchAdminView;
window.loadSoldiers = loadSoldiers;
