const API = '/api';
let currentPharmacy = null;
let adminPassword = null;

function showView(view) {
  document.getElementById('view-patient').style.display = view === 'patient' ? 'block' : 'none';
  document.getElementById('view-pharmacist').style.display = view === 'pharmacist' ? 'block' : 'none';
  document.getElementById('view-admin').style.display = view === 'admin' ? 'block' : 'none';
  document.getElementById('tab-patient').classList.toggle('active', view === 'patient');
  document.getElementById('tab-pharmacist').classList.toggle('active', view === 'pharmacist');
  document.getElementById('tab-admin').classList.toggle('active', view === 'admin');
  if (view === 'pharmacist' && !currentPharmacy) renderPharmacyAuthForm();
  if (view === 'admin' && !adminPassword) renderAdminAuthForm();
}

// ---------- واجهة المريض ----------

async function loadOnDuty() {
  const container = document.getElementById('on-duty-section');
  try {
    const res = await fetch(`${API}/pharmacies/on-duty`);
    const data = await res.json();
    if (data.length === 0) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = `
      <div class="card" style="border-color:#97c459; background:#f7fbf1;">
        <h3 style="margin-top:0;">🟢 الصيدليات المناوبة اليوم</h3>
        ${data.map(p => `
          <div class="row">
            <span>${p.name}${p.address ? ' - ' + p.address : ''}${p.phone ? ' - ' + p.phone : ''}</span>
            <span class="badge yes">${p.on_duty_day || ''}</span>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = '';
  }
}

let searchTimeout;
function onSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(runSearch, 300);
}

async function runSearch() {
  const q = document.getElementById('search').value.trim();
  const container = document.getElementById('results');
  if (!q) {
    container.innerHTML = '<p class="muted">اكتب اسم الدواء للبحث عن توفره في صيدليات سلمية.</p>';
    return;
  }
  try {
    const res = await fetch(`${API}/medicines/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (data.length === 0) {
      container.innerHTML = '<p class="muted">لم يتم العثور على دواء بهذا الاسم.</p>';
      return;
    }
    container.innerHTML = data.map(item => `
      <div class="card">
        <h3>${item.medicine.name}</h3>
        <div class="generic">المادة الفعالة: ${item.medicine.generic_name || '-'}</div>
        ${item.availability.map(a => `
          <div class="row">
            <span>${a.pharmacy_name}</span>
            <span class="badge ${a.available ? 'yes' : 'no'}">${a.available ? 'متوفر' : 'غير متوفر'}</span>
          </div>
        `).join('')}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p class="muted">تعذر الاتصال بالخادم.</p>';
  }
}

// ---------- لوحة الصيدلي ----------

function renderPharmacyAuthForm() {
  document.getElementById('pharmacist-dashboard').style.display = 'none';
  document.getElementById('pharmacist-auth-section').innerHTML = `
    <div class="auth-box">
      <h3 style="margin-top:0;">دخول الصيدلي</h3>
      <p class="muted" style="margin-top:-8px;">إذا لم يكن لديك حساب بعد، تواصل مع فريق دوائي جاهز لتسجيل صيدليتك.</p>
      <input id="login-username" type="text" placeholder="اسم المستخدم">
      <input id="login-password" type="password" placeholder="كلمة المرور">
      <button class="primary" onclick="login()">دخول</button>
    </div>
  `;
}

async function login() {
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  try {
    const res = await fetch(`${API}/pharmacies/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return; }
    currentPharmacy = { ...data, username, password };
    loadDashboard();
  } catch (err) {
    alert('تعذر الاتصال بالخادم');
  }
}

function loadDashboard() {
  document.getElementById('pharmacist-auth-section').innerHTML = '';
  document.getElementById('pharmacist-dashboard').style.display = 'block';
  document.getElementById('pharmacy-label').innerHTML = `
    <span>صيدلية: ${currentPharmacy.name}</span>
    <button class="link-btn" onclick="logout()">تسجيل الخروج</button>
  `;
  document.getElementById('duty-checkbox').checked = !!currentPharmacy.on_duty;
  document.getElementById('duty-day').disabled = !currentPharmacy.on_duty;
  if (currentPharmacy.on_duty_day) {
    document.getElementById('duty-day').value = currentPharmacy.on_duty_day;
  }
  refreshStock();
}

function onDutyToggle() {
  document.getElementById('duty-day').disabled = !document.getElementById('duty-checkbox').checked;
}

async function saveDuty() {
  const on_duty = document.getElementById('duty-checkbox').checked;
  const on_duty_day = document.getElementById('duty-day').value;
  try {
    const res = await fetch(`${API}/pharmacies/self/duty`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentPharmacy.username,
        password: currentPharmacy.password,
        on_duty,
        on_duty_day
      })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return; }
    currentPharmacy.on_duty = data.on_duty;
    currentPharmacy.on_duty_day = data.on_duty_day;
    alert('تم حفظ حالة المناوبة بنجاح');
  } catch (err) {
    alert('تعذر الاتصال بالخادم');
  }
}

function logout() {
  currentPharmacy = null;
  document.getElementById('pharmacist-dashboard').style.display = 'none';
  renderPharmacyAuthForm();
}

async function refreshStock() {
  const res = await fetch(`${API}/stock/${currentPharmacy.id}`);
  const data = await res.json();
  document.getElementById('stock-list').innerHTML = data.map(m => `
    <div class="row">
      <span>${m.name}</span>
      <button class="toggle-btn ${m.available ? 'yes' : 'no'}" onclick="toggleStock(${m.medicine_id}, ${!m.available})">
        ${m.available ? 'متوفر' : 'غير متوفر'}
      </button>
    </div>
  `).join('');
}

async function toggleStock(medicineId, newValue) {
  await fetch(`${API}/stock/${currentPharmacy.id}/${medicineId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ available: newValue })
  });
  refreshStock();
}

async function deleteMyAccount() {
  if (!confirm('متأكد إنك بدك تحذف حسابك نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.')) return;
  const res = await fetch(`${API}/pharmacies/self`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentPharmacy.username, password: currentPharmacy.password })
  });
  const data = await res.json();
  if (!res.ok) { alert(data.error); return; }
  alert('تم حذف حسابك بنجاح');
  logout();
}

// ---------- لوحة الإدارة ----------

function renderAdminAuthForm() {
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('admin-auth-section').innerHTML = `
    <div class="auth-box">
      <input id="admin-password-input" type="password" placeholder="كلمة مرور الإدارة">
      <button class="primary" onclick="checkAdminPassword()">دخول</button>
    </div>
  `;
}

async function checkAdminPassword() {
  const password = document.getElementById('admin-password-input').value;
  const res = await fetch(`${API}/pharmacies`, { headers: { 'x-admin-password': password } });
  if (!res.ok) { alert('كلمة المرور غير صحيحة'); return; }
  adminPassword = password;
  document.getElementById('admin-auth-section').innerHTML = '';
  document.getElementById('admin-panel').style.display = 'block';
  renderAdminPanel();
}

function adminHeaders() {
  return { 'Content-Type': 'application/json', 'x-admin-password': adminPassword };
}

async function renderAdminPanel() {
  const [pharmacies, medicines] = await Promise.all([
    fetch(`${API}/pharmacies`, { headers: adminHeaders() }).then(r => r.json()),
    fetch(`${API}/medicines`, { headers: adminHeaders() }).then(r => r.json())
  ]);

  document.getElementById('admin-panel').innerHTML = `
    <h3>إضافة صيدلية جديدة</h3>
    <div class="box">
      <input id="ph-name" placeholder="اسم الصيدلية">
      <input id="ph-address" placeholder="العنوان">
      <input id="ph-phone" placeholder="رقم الهاتف">
      <input id="ph-username" placeholder="اسم مستخدم">
      <input id="ph-password" placeholder="كلمة مرور">
      <button class="primary" onclick="addPharmacy()">إضافة الصيدلية</button>
    </div>

    <h3>الصيدليات المسجّلة (${pharmacies.length})</h3>
    <div class="box">
      ${pharmacies.length === 0 ? '<p class="muted">لا يوجد صيدليات مسجّلة بعد.</p>' : pharmacies.map(p => `
        <div class="row">
          <span>${p.name} <span class="muted">(${p.owner_username})</span></span>
          <button class="danger-btn" onclick="deletePharmacyAdmin(${p.id}, '${p.name}')">حذف</button>
        </div>
      `).join('')}
    </div>

    <h3>إضافة دواء جديد</h3>
    <div class="box">
      <input id="med-name" placeholder="اسم الدواء">
      <input id="med-generic" placeholder="المادة الفعالة">
      <input id="med-alt" placeholder="أسماء بديلة (افصل بفاصلة)">
      <button class="primary" onclick="addMedicineAdmin()">إضافة الدواء</button>
    </div>

    <h3>الأدوية المسجّلة (${medicines.length})</h3>
    <div class="box">
      ${medicines.map(m => `
        <div class="row">
          <span>${m.name}</span>
          <button class="danger-btn" onclick="deleteMedicineAdmin(${m.id}, '${m.name}')">حذف</button>
        </div>
      `).join('')}
    </div>
  `;
}

async function addPharmacy() {
  const body = {
    name: document.getElementById('ph-name').value,
    address: document.getElementById('ph-address').value,
    phone: document.getElementById('ph-phone').value,
    username: document.getElementById('ph-username').value,
    password: document.getElementById('ph-password').value,
  };
  const res = await fetch(`${API}/pharmacies/register`, {
    method: 'POST', headers: adminHeaders(), body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) { alert(data.error); return; }
  renderAdminPanel();
}

async function deletePharmacyAdmin(id, name) {
  if (!confirm(`متأكد إنك بدك تحذف صيدلية "${name}"؟`)) return;
  await fetch(`${API}/pharmacies/${id}`, { method: 'DELETE', headers: adminHeaders() });
  renderAdminPanel();
}

async function addMedicineAdmin() {
  const alt_names = document.getElementById('med-alt').value.split(',').map(s => s.trim()).filter(Boolean);
  const body = {
    name: document.getElementById('med-name').value,
    generic_name: document.getElementById('med-generic').value,
    alt_names
  };
  const res = await fetch(`${API}/medicines`, {
    method: 'POST', headers: adminHeaders(), body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) { alert(data.error); return; }
  renderAdminPanel();
}

async function deleteMedicineAdmin(id, name) {
  if (!confirm(`متأكد إنك بدك تحذف دواء "${name}" نهائياً؟`)) return;
  await fetch(`${API}/medicines/${id}`, { method: 'DELETE', headers: adminHeaders() });
  renderAdminPanel();
}

showView('patient');
runSearch();
loadOnDuty();
