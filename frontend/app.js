const API = '/api';
let currentPharmacy = null;
let adminPassword = null;
let cart = JSON.parse(localStorage.getItem('cart') || '[]');

function showView(view) {
  document.getElementById('view-patient').style.display = view === 'patient' ? 'block' : 'none';
  document.getElementById('view-pharmacist').style.display = view === 'pharmacist' ? 'block' : 'none';
  document.getElementById('view-admin').style.display = view === 'admin' ? 'block' : 'none';
  if (view === 'pharmacist' && !currentPharmacy) renderPharmacyAuthForm();
  if (view === 'admin' && !adminPassword) renderAdminAuthForm();
  updateCartVisibility();
}

// تُظهر زر العربة بس بالصفحة الرئيسية (المريض)، وتخفيه بلوحة الصيدلي/الإدارة/قسم المناوبة
function updateCartVisibility() {
  const patientActive = document.getElementById('view-patient').style.display !== 'none';
  const onDutyActive = document.getElementById('on-duty-section').style.display !== 'none';
  const cartBtn = document.getElementById('cart-toggle-btn');
  const cartSection = document.getElementById('cart-section');
  if (patientActive && !onDutyActive) {
    cartBtn.style.display = 'inline-flex';
  } else {
    cartBtn.style.display = 'none';
    cartSection.style.display = 'none';
  }
}

// ---------- روابط الهيدر (المتحكم الوحيد بالتنقل بالموقع) ----------

function setActiveNav(link) {
  document.querySelectorAll('.site-nav .nav-link').forEach(a => a.classList.remove('active'));
  if (link) link.classList.add('active');
  closeNav();
}

function toggleNav() {
  document.getElementById('site-nav').classList.toggle('open');
}

function closeNav() {
  document.getElementById('site-nav').classList.remove('open');
}

function headerGoHome(link) {
  showView('patient');
  document.getElementById('on-duty-section').style.display = 'none';
  updateCartVisibility();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setActiveNav(link);
}

function headerGoSearch(link) {
  showView('patient');
  const input = document.getElementById('search');
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  input.focus();
  setActiveNav(link);
}

function headerGoOnDuty(link) {
  showView('patient');
  const section = document.getElementById('on-duty-section');
  section.style.display = 'block';
  updateCartVisibility();
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setActiveNav(link);
}

function headerGoPharmacist(link) {
  showView('pharmacist');
  document.getElementById('view-pharmacist').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setActiveNav(link);
}

function headerGoAdmin(link) {
  showView('admin');
  document.getElementById('view-admin').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setActiveNav(link);
}

// ---------- عربة المشتريات ----------

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount() {
  const el = document.getElementById('cart-count');
  if (el) el.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
}

function addToCart(medicineName, genericName, pharmacyName, pharmacyId) {
  const existing = cart.find(item => item.medicineName === medicineName && item.pharmacyId === pharmacyId);
  if (existing) {
    if (existing.quantity >= 3 && !existing.confirmedExcess) {
      const wantsMore = confirm(`لقد أضفت ${existing.quantity} من ${medicineName} من ${pharmacyName} إلى عربتك. هل تريد إضافة المزيد؟`);
      if (!wantsMore) return;
      existing.confirmedExcess = true;
    }
    existing.quantity += 1;
  } else {
    cart.push({ medicineName, genericName, pharmacyName, pharmacyId, quantity: 1, confirmedExcess: false });
  }
  saveCart();
  renderCart();
}

function increaseQuantity(index) {
  const item = cart[index];
  if (item.quantity >= 3 && !item.confirmedExcess) {
    const wantsMore = confirm(`لقد أضفت ${item.quantity} من ${item.medicineName} من ${item.pharmacyName} إلى عربتك. هل تريد إضافة المزيد؟`);
    if (!wantsMore) return;
    item.confirmedExcess = true;
  }
  item.quantity += 1;
  saveCart();
  renderCart();
}

function decreaseQuantity(index) {
  cart[index].quantity -= 1;
  if (cart[index].quantity <= 0) {
    cart.splice(index, 1);
  }
  saveCart();
  renderCart();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  saveCart();
  renderCart();
}

function toggleCart() {
  const section = document.getElementById('cart-section');
  if (section.style.display === 'none') {
    renderCart();
    section.style.display = 'block';
  } else {
    section.style.display = 'none';
  }
}

function renderCart() {
  const container = document.getElementById('cart-section');
  if (cart.length === 0) {
    container.innerHTML = '<div class="box"><p class="muted" style="margin:0;">عربتك فارغة حالياً. أضف أي دواء متوفر من نتائج البحث.</p></div>';
    return;
  }
  container.innerHTML = `
    <div class="box">
      <h3 style="margin-top:0;">مشترياتي</h3>
      ${cart.map((item, i) => `
        <div class="row">
          <span>${item.medicineName}${item.genericName ? ` <span class="muted">(${item.genericName})</span>` : ''} <span class="muted">- ${item.pharmacyName}</span></span>
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <button class="btn-outline blue small" onclick="decreaseQuantity(${i})">-</button>
              <span style="min-width:20px; text-align:center;">${item.quantity}</span>
              <button class="btn-outline blue small" onclick="increaseQuantity(${i})">+</button>
            </div>
            <button class="btn-outline red small" onclick="removeFromCart(${i})">حذف</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function formatTime12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'م' : 'ص';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
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
      <div class="duty-wrap">
        <h3>🟢 الصيدليات المناوبة اليوم</h3>
        <div class="duty-grid">
          ${data.map(p => {
            const extras = [];
            if (p.on_duty_shift && p.on_duty_shift !== 'طوال اليوم') extras.push(p.on_duty_shift);
            if (p.on_duty_start_time && p.on_duty_end_time) extras.push(`${formatTime12(p.on_duty_start_time)} - ${formatTime12(p.on_duty_end_time)}`);
            const timeLine = (p.on_duty_day || '') + (extras.length ? ` (${extras.join('، ')})` : '');
            return `
              <div class="duty-card">
                <div class="duty-card-top">
                  <span class="duty-card-name">${p.name}</span>
                  <span class="duty-status-badge">🟢 مناوبة الآن</span>
                </div>
                ${p.address ? `<div class="duty-card-row"><span class="duty-icon">📍</span> ${p.address}</div>` : ''}
                ${p.phone ? `<div class="duty-card-row"><span class="duty-icon">📞</span> ${p.phone}</div>` : ''}
                <div class="duty-card-row"><span class="duty-icon">🕐</span> ${timeLine}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = '';
  }
}

let searchTimeout;
function onSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    runSearch();
    loadSuggestions();
  }, 300);
}

async function loadSuggestions() {
  const q = document.getElementById('search').value.trim();
  const box = document.getElementById('suggestions');
  if (!q) {
    box.classList.remove('show');
    box.innerHTML = '';
    return;
  }
  try {
    const res = await fetch(`${API}/medicines/suggest?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (data.length === 0) {
      box.classList.remove('show');
      box.innerHTML = '';
      return;
    }
    box.innerHTML = data.map(m => `
      <div class="suggestion-item" onclick="pickSuggestion('${m.name}')">
        هل تقصد <strong>${m.name}</strong>؟
        ${m.generic_name ? `<span class="generic-hint"> (${m.generic_name})</span>` : ''}
      </div>
    `).join('');
    box.classList.add('show');
  } catch (err) {
    box.classList.remove('show');
  }
}

async function pickSuggestion(name) {
  document.getElementById('search').value = name;
  document.getElementById('suggestions').classList.remove('show');
  await runSearch();
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function submitSearch() {
  document.getElementById('suggestions').classList.remove('show');
  await runSearch();
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      let html = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p class="empty-title">لم يتم العثور على الدواء</p>
          <p class="empty-subtitle">يمكنك تجربة اسم آخر أو البحث بالمادة الفعالة.</p>
        </div>`;
      try {
        const sugRes = await fetch(`${API}/medicines/suggest?q=${encodeURIComponent(q)}`);
        const suggestions = await sugRes.json();
        if (suggestions.length > 0) {
          html += `
            <div class="box">
              <p class="muted" style="margin-top:0;">هل تقصد أحد هذه الأدوية؟</p>
              ${suggestions.map(m => `
                <div style="cursor:pointer; color:#185fa5; padding:6px 0;" onclick="pickSuggestion('${m.name}')">
                  ${m.name}${m.generic_name ? ' - ' + m.generic_name : ''}
                </div>
              `).join('')}
            </div>`;
        }
      } catch (err) { /* تجاهل فشل الاقتراحات، النتيجة الأساسية أهم */ }
      container.innerHTML = html;
      return;
    }

    document.getElementById('suggestions').classList.remove('show');
    let cardsHtml = '';
    data.forEach(item => {
      item.availability.forEach(a => {
        cardsHtml += `
          <div class="result-card">
            <div class="result-card-top">
              <span class="result-med-name"><span class="result-icon">💊</span> ${item.medicine.name}</span>
              <span class="badge ${a.available ? 'yes' : 'no'}">${a.available ? '🟢 متوفر' : '🔴 غير متوفر'}</span>
            </div>
            <div class="result-row">المادة الفعالة: ${item.medicine.generic_name || '-'}</div>
            <div class="result-pharmacy"><span class="result-icon">📍</span> ${a.pharmacy_name}${a.address ? ' - ' + a.address : ''}</div>
            ${a.phone ? `<div class="result-row"><span class="result-icon">📞</span> ${a.phone}</div>` : ''}
            ${a.available ? `<button class="result-add-btn-full" onclick="addToCart('${item.medicine.name}', '${item.medicine.generic_name || ''}', '${a.pharmacy_name}', ${a.pharmacy_id})">إضافة إلى السلة</button>` : ''}
          </div>
        `;
      });
    });
    container.innerHTML = cardsHtml;
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
      <div class="password-field">
        <input id="login-password" type="password" placeholder="كلمة المرور">
        <button type="button" class="toggle-password" onclick="togglePassword('login-password', this)">👁</button>
      </div>
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
    <span style="font-weight:500; font-size:16px;">صيدلية: ${currentPharmacy.name}</span>
    <button class="btn-outline blue" onclick="logout()">تسجيل الخروج</button>
  `;
  document.getElementById('duty-checkbox').checked = !!currentPharmacy.on_duty;
  document.getElementById('duty-day').disabled = !currentPharmacy.on_duty;
  document.getElementById('duty-shift').disabled = !currentPharmacy.on_duty;
  document.getElementById('duty-start-time').disabled = !currentPharmacy.on_duty;
  document.getElementById('duty-end-time').disabled = !currentPharmacy.on_duty;
  if (currentPharmacy.on_duty_day) {
    document.getElementById('duty-day').value = currentPharmacy.on_duty_day;
  }
  if (currentPharmacy.on_duty_shift) {
    document.getElementById('duty-shift').value = currentPharmacy.on_duty_shift;
  }
  document.getElementById('duty-start-time').value = currentPharmacy.on_duty_start_time || '';
  document.getElementById('duty-end-time').value = currentPharmacy.on_duty_end_time || '';
  refreshStock();
}

function onDutyToggle() {
  const enabled = document.getElementById('duty-checkbox').checked;
  document.getElementById('duty-day').disabled = !enabled;
  document.getElementById('duty-shift').disabled = !enabled;
  document.getElementById('duty-start-time').disabled = !enabled;
  document.getElementById('duty-end-time').disabled = !enabled;
}

async function saveDuty() {
  const on_duty = document.getElementById('duty-checkbox').checked;
  const on_duty_day = document.getElementById('duty-day').value;
  const on_duty_shift = document.getElementById('duty-shift').value;
  const on_duty_start_time = document.getElementById('duty-start-time').value;
  const on_duty_end_time = document.getElementById('duty-end-time').value;
  try {
    const res = await fetch(`${API}/pharmacies/self/duty`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentPharmacy.username,
        password: currentPharmacy.password,
        on_duty,
        on_duty_day,
        on_duty_shift,
        on_duty_start_time,
        on_duty_end_time
      })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return; }
    currentPharmacy.on_duty = data.on_duty;
    currentPharmacy.on_duty_day = data.on_duty_day;
    currentPharmacy.on_duty_shift = data.on_duty_shift;
    currentPharmacy.on_duty_start_time = data.on_duty_start_time;
    currentPharmacy.on_duty_end_time = data.on_duty_end_time;
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

async function addMedicineSelf() {
  const name = document.getElementById('pharm-med-name').value.trim();
  const generic_name = document.getElementById('pharm-med-generic').value.trim();
  const alt_names = document.getElementById('pharm-med-alt').value.split(',').map(s => s.trim()).filter(Boolean);
  if (!name) { alert('اسم الدواء مطلوب'); return; }
  try {
    const res = await fetch(`${API}/medicines/self`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentPharmacy.username,
        password: currentPharmacy.password,
        name, generic_name, alt_names
      })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return; }
    document.getElementById('pharm-med-name').value = '';
    document.getElementById('pharm-med-generic').value = '';
    document.getElementById('pharm-med-alt').value = '';
    alert('تمت إضافة الدواء بنجاح. فعّل حالة توفره من القائمة تحت.');
    refreshStock();
  } catch (err) {
    alert('تعذر الاتصال بالخادم');
  }
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
      <div class="password-field">
        <input id="admin-password-input" type="password" placeholder="كلمة مرور الإدارة">
        <button type="button" class="toggle-password" onclick="togglePassword('admin-password-input', this)">👁</button>
      </div>
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
      <div class="password-field">
        <input id="ph-password" type="password" placeholder="كلمة مرور">
        <button type="button" class="toggle-password" onclick="togglePassword('ph-password', this)">👁</button>
      </div>
      <button class="primary" onclick="addPharmacy()">إضافة الصيدلية</button>
    </div>

    <h3>الصيدليات المسجّلة (${pharmacies.length})</h3>
    <div class="box">
      ${pharmacies.length === 0 ? '<p class="muted">لا يوجد صيدليات مسجّلة بعد.</p>' : pharmacies.map(p => `
        <div class="row">
          <span>${p.name} <span class="muted">(${p.owner_username})</span></span>
          <button class="btn-outline red small" onclick="deletePharmacyAdmin(${p.id}, '${p.name}')">حذف</button>
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
          <button class="btn-outline red small" onclick="deleteMedicineAdmin(${m.id}, '${m.name}')">حذف</button>
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

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
}

document.addEventListener('click', (e) => {
  const box = document.getElementById('suggestions');
  const input = document.getElementById('search');
  if (box && !box.contains(e.target) && e.target !== input) {
    box.classList.remove('show');
  }
});

showView('patient');
runSearch();
loadOnDuty();
updateCartCount();
