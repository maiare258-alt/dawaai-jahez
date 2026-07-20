const API = '/api';
let currentPharmacy = null;

function showView(view) {
  document.getElementById('view-patient').style.display = view === 'patient' ? 'block' : 'none';
  document.getElementById('view-pharmacist').style.display = view === 'pharmacist' ? 'block' : 'none';
  document.getElementById('tab-patient').classList.toggle('active', view === 'patient');
  document.getElementById('tab-pharmacist').classList.toggle('active', view === 'pharmacist');
  if (view === 'pharmacist' && !currentPharmacy) renderAuthForm();
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
          <div class="pharmacy-row">
            <span>${a.pharmacy_name}</span>
            <span class="badge ${a.available ? 'yes' : 'no'}">${a.available ? 'متوفر' : 'غير متوفر'}</span>
          </div>
        `).join('')}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p class="muted">تعذر الاتصال بالخادم. تأكد من تشغيل الخادم وقاعدة البيانات.</p>';
  }
}

function renderAuthForm() {
  document.getElementById('dashboard-section').style.display = 'none';
  document.getElementById('auth-section').innerHTML = `
    <div class="auth-box">
      <h3>دخول الصيدلي</h3>
      <input id="login-username" type="text" placeholder="اسم المستخدم">
      <input id="login-password" type="password" placeholder="كلمة المرور">
      <button class="primary" onclick="login()">دخول</button>
      <p style="text-align:center; margin-top:12px;">
        صيدلية جديدة؟ <button class="link-btn" onclick="renderRegisterForm()">سجّل صيدليتك</button>
      </p>
    </div>
  `;
}

function renderRegisterForm() {
  document.getElementById('auth-section').innerHTML = `
    <div class="auth-box">
      <h3>تسجيل صيدلية جديدة</h3>
      <input id="reg-name" type="text" placeholder="اسم الصيدلية">
      <input id="reg-address" type="text" placeholder="العنوان">
      <input id="reg-phone" type="text" placeholder="رقم الهاتف">
      <input id="reg-username" type="text" placeholder="اسم مستخدم">
      <input id="reg-password" type="password" placeholder="كلمة المرور">
      <button class="primary" onclick="register()">تسجيل</button>
      <p style="text-align:center; margin-top:12px;">
        لديك حساب؟ <button class="link-btn" onclick="renderAuthForm()">دخول</button>
      </p>
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
    currentPharmacy = data;
    loadDashboard();
  } catch (err) {
    alert('تعذر الاتصال بالخادم');
  }
}

async function register() {
  const body = {
    name: document.getElementById('reg-name').value,
    address: document.getElementById('reg-address').value,
    phone: document.getElementById('reg-phone').value,
    username: document.getElementById('reg-username').value,
    password: document.getElementById('reg-password').value,
  };
  try {
    const res = await fetch(`${API}/pharmacies/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return; }
    alert('تم التسجيل بنجاح، يمكنك تسجيل الدخول الآن');
    renderAuthForm();
  } catch (err) {
    alert('تعذر الاتصال بالخادم');
  }
}

function loadDashboard() {
  document.getElementById('auth-section').innerHTML = '';
  document.getElementById('dashboard-section').style.display = 'block';
  document.getElementById('pharmacy-label').innerHTML = `
    <span>صيدلية: ${currentPharmacy.name}</span>
    <button class="link-btn" style="margin-right:16px;" onclick="logout()">تسجيل الخروج</button>
  `;
  refreshStock();
}

function logout() {
  currentPharmacy = null;
  document.getElementById('dashboard-section').style.display = 'none';
  renderAuthForm();
}

async function refreshStock() {
  const res = await fetch(`${API}/stock/${currentPharmacy.id}`);
  const data = await res.json();
  document.getElementById('stock-list').innerHTML = data.map(m => `
    <div class="pharmacy-row">
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

runSearch();
