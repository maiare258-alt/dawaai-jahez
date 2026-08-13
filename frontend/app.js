const API = '/api';
let currentPharmacy = null;
let adminPassword = null;
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
// التصنيف الحالي لصفحة البحث: 'medicine' (الرئيسية) أو 'cosmetic' (مستحضرات تجميل)
let currentCategory = 'medicine';
// طلبات المريض المرسلة من هذا المتصفح (لتتبع رد الصيدلية عليها)
let myOrders = JSON.parse(localStorage.getItem('myOrders') || '[]');

// ---------- نظام تعدد اللغات (عربي/إنكليزي) — المرحلة 1: الصفحة الرئيسية ----------

let currentLang = localStorage.getItem('lang') || 'ar';

const translations = {
  ar: {
    nav_home: 'الرئيسية', nav_onduty: 'الصيدليات المناوبة', nav_pharmacist: 'لوحة الصيدلي',
    nav_cosmetics: 'مستحضرات تجميل', nav_nursing: 'خدمات تمريض', nav_admin: 'الإدارة',
    hero_title_medicine: 'دوائي جاهز<br>في <span class="hero-highlight">أي وقت</span>، من أي مكان',
    hero_desc_medicine: 'منصة سورية تساعدك على معرفة توفر الدواء في الصيدليات القريبة وطلبه بسهولة.',
    search_placeholder_medicine: 'ابحث عن دواء أو مادة فعالة...',
    search_hint_medicine: 'اكتب اسم الدواء للبحث عن توفره في صيدليات سلمية.',
    hero_title_cosmetic: 'دوائي جاهز<br>مستحضرات <span class="hero-highlight">تجميلك</span>، بأي وقت',
    hero_desc_cosmetic: 'منصة سورية تساعدك على معرفة توفر مستحضرات التجميل في الصيدليات القريبة.',
    search_placeholder_cosmetic: 'ابحث عن مستحضر تجميل...',
    search_hint_cosmetic: 'اكتب اسم المستحضر للبحث عن توفره في صيدليات سلمية.',
    hero_title_nursing: 'دوائي جاهز خدمات تمريض<br><span class="hero-highlight">في أي وقت</span>، من أي مكان',
    hero_desc_nursing: 'منصة سورية تساعدك على معرفة توفر الدواء وخدمات التمريض في مدينة سلمية.',
    search_hint_nursing: 'ابحث عن الممرض لمعرفة توافره في مدينة سلمية.',
    search_btn: 'بحث', cart_btn: 'عربة المشتريات', whatsapp_btn: 'ابحث عبر واتساب',
    feature1_title: 'البحث عن الدواء', feature1_desc: 'اعرف الصيدليات التي توفر الدواء.',
    feature2_title: 'الصيدليات المناوبة', feature2_desc: 'اعرض الصيدليات المناوبة اليوم.',
    feature3_title: 'عربة المشتريات', feature3_desc: 'اجمع الأدوية قبل زيارة الصيدلية.',
    about_title: 'عن دوائي جاهز',
    about_desc: 'دوائي جاهز منصة سورية محلية انطلقت من مدينة سلمية، هدفها مساعدتك على معرفة توفر دوائك في الصيدليات القريبة فوراً، بدل التنقل من صيدلية لصيدلية بحثاً عن دواء قد لا يكون متوفراً.',
    footer_home: 'الرئيسية', footer_onduty: 'الصيدليات المناوبة', footer_contact: 'تواصل معنا',
    footer_center: 'منصة سورية للبحث عن توفر الأدوية في الصيدليات.',
    footer_copy: '© دوائي جاهز — جميع الحقوق محفوظة',
    cart_empty_title: 'عربة المشتريات فارغة', cart_empty_subtitle: 'ابدأ بإضافة الأدوية من نتائج البحث.',
    page_title: 'دوائي جاهز | توفر الأدوية في الصيدليات', lang_toggle: 'English', brand_name: 'دوائي جاهز',
    not_found_title_medicine: 'لم يتم العثور على الدواء', not_found_title_cosmetic: 'لم يتم العثور على المستحضر',
    not_found_subtitle: 'يمكنك تجربة اسم آخر أو البحث بالمادة الفعالة.',
    did_you_mean_results: 'هل تقصد أحد هذه النتائج؟',
    suggest_did_you_mean: 'هل تقصد', q_mark: '؟',
    available_badge: '🟢 متوفر', unavailable_badge: '🔴 غير متوفر',
    active_ingredient_label: 'المادة الفعالة:', add_to_cart_btn: 'إضافة إلى السلة', added_feedback: '✓ تمت الإضافة',
    alt_unavailable_but: 'غير متوفر حالياً، بس في بديل بنفس المادة الفعالة', alt_view_btn: 'عرض',
    server_error_title: 'تعذر الاتصال بالخادم', server_error_subtitle: 'تحقق من اتصالك بالإنترنت وحاول مرة أخرى.',
    cart_panel_title: 'عربة المشتريات', cart_panel_subtitle: 'راجع الأدوية قبل إتمام الطلب.',
    cart_items_count_label: 'عدد الأدوية', checkout_name_placeholder: 'الاسم الكامل',
    checkout_phone_placeholder: 'رقم الهاتف', checkout_btn: 'إتمام الطلب', remove_aria: 'حذف',
    checkout_missing_fields: 'الرجاء إدخال الاسم ورقم الهاتف لإتمام الطلب.',
    order_success_msg: 'تم إرسال طلبك بنجاح! الصيدلية رح تتواصل معك قريباً على الرقم يلي أدخلته.'
  },
  en: {
    nav_home: 'Home', nav_onduty: 'On-Duty Pharmacies', nav_pharmacist: 'Pharmacist Panel',
    nav_cosmetics: 'Cosmetics', nav_nursing: 'Nursing Services', nav_admin: 'Admin',
    hero_title_medicine: 'Dawaai Jahez<br><span class="hero-highlight">Anytime</span>, Anywhere',
    hero_desc_medicine: 'A Syrian platform that helps you find medicine availability at nearby pharmacies and order it easily.',
    search_placeholder_medicine: 'Search for a medicine or active ingredient...',
    search_hint_medicine: 'Type the medicine name to check its availability in Salamiyah pharmacies.',
    hero_title_cosmetic: 'Dawaai Jahez<br>Your <span class="hero-highlight">Cosmetics</span>, Anytime',
    hero_desc_cosmetic: 'A Syrian platform that helps you find cosmetic products availability at nearby pharmacies.',
    search_placeholder_cosmetic: 'Search for a cosmetic product...',
    search_hint_cosmetic: 'Type the product name to check its availability in Salamiyah pharmacies.',
    hero_title_nursing: 'Dawaai Jahez Nursing Services<br><span class="hero-highlight">Anytime</span>, Anywhere',
    hero_desc_nursing: 'A Syrian platform that helps you find medicine and nursing service availability in Salamiyah city.',
    search_hint_nursing: 'Search for a nurse to check their availability in Salamiyah city.',
    search_btn: 'Search', cart_btn: 'Cart', whatsapp_btn: 'Search via WhatsApp',
    feature1_title: 'Medicine Search', feature1_desc: 'Find pharmacies that have your medicine.',
    feature2_title: 'On-Duty Pharmacies', feature2_desc: "See today's on-duty pharmacies.",
    feature3_title: 'Shopping Cart', feature3_desc: 'Collect medicines before visiting the pharmacy.',
    about_title: 'About Dawaai Jahez',
    about_desc: 'Dawaai Jahez is a local Syrian platform launched in Salamiyah, aiming to help you instantly know your medicine availability at nearby pharmacies, instead of going from pharmacy to pharmacy looking for a medicine that might not be available.',
    footer_home: 'Home', footer_onduty: 'On-Duty Pharmacies', footer_contact: 'Contact Us',
    footer_center: 'A Syrian platform for medicine availability search at pharmacies.',
    footer_copy: '© Dawaai Jahez — All rights reserved',
    cart_empty_title: 'Your cart is empty', cart_empty_subtitle: 'Start adding medicines from the search results.',
    page_title: 'Dawaai Jahez | Medicine Availability at Pharmacies', lang_toggle: 'عربي', brand_name: 'Dawaai Jahez',
    not_found_title_medicine: 'Medicine not found', not_found_title_cosmetic: 'Product not found',
    not_found_subtitle: 'You can try another name or search by active ingredient.',
    did_you_mean_results: 'Did you mean one of these?',
    suggest_did_you_mean: 'Did you mean', q_mark: '?',
    available_badge: '🟢 Available', unavailable_badge: '🔴 Unavailable',
    active_ingredient_label: 'Active ingredient:', add_to_cart_btn: 'Add to Cart', added_feedback: '✓ Added',
    alt_unavailable_but: 'is currently unavailable, but there is an alternative with the same active ingredient', alt_view_btn: 'View',
    server_error_title: 'Could not connect to the server', server_error_subtitle: 'Check your internet connection and try again.',
    cart_panel_title: 'Shopping Cart', cart_panel_subtitle: 'Review the items before checkout.',
    cart_items_count_label: 'Number of items', checkout_name_placeholder: 'Full name',
    checkout_phone_placeholder: 'Phone number', checkout_btn: 'Checkout', remove_aria: 'Remove',
    checkout_missing_fields: 'Please enter your name and phone number to complete the order.',
    order_success_msg: 'Your order has been sent successfully! The pharmacy will contact you soon on the number you entered.'
  }
};

function t(key) {
  return (translations[currentLang] && translations[currentLang][key]) || translations.ar[key] || key;
}

// يحدد أي نص Hero فعّال حالياً (دواء/تجميل/تمريض) ويعيد تطبيقه باللغة الجديدة
function refreshCurrentHeroText() {
  const nursingActive = document.getElementById('view-nursing').style.display !== 'none';
  if (nursingActive) applyNursingHeroText();
  else if (currentCategory === 'cosmetic') applyCosmeticHeroText();
  else applyMedicineHeroText();
}

function applyLanguage() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
  document.title = t('page_title');

  document.getElementById('nav-home').textContent = t('nav_home');
  document.getElementById('nav-onduty').textContent = t('nav_onduty');
  document.getElementById('nav-pharmacist').textContent = t('nav_pharmacist');
  document.getElementById('nav-cosmetics').textContent = t('nav_cosmetics');
  document.getElementById('nav-nursing').textContent = t('nav_nursing');
  document.getElementById('nav-admin').textContent = t('nav_admin');

  refreshCurrentHeroText();
  document.getElementById('search-btn').textContent = t('search_btn');
  document.getElementById('cart-btn-label').textContent = t('cart_btn');
  document.getElementById('whatsapp-btn-label').textContent = t('whatsapp_btn');

  document.getElementById('feature1-title').textContent = t('feature1_title');
  document.getElementById('feature1-desc').textContent = t('feature1_desc');
  document.getElementById('feature2-title').textContent = t('feature2_title');
  document.getElementById('feature2-desc').textContent = t('feature2_desc');
  document.getElementById('feature3-title').textContent = t('feature3_title');
  document.getElementById('feature3-desc').textContent = t('feature3_desc');
  document.getElementById('about-title').textContent = t('about_title');
  document.getElementById('about-desc').textContent = t('about_desc');

  document.getElementById('footer-home').textContent = t('footer_home');
  document.getElementById('footer-onduty').textContent = t('footer_onduty');
  document.getElementById('footer-contact').textContent = t('footer_contact');
  document.getElementById('footer-center').textContent = t('footer_center');
  document.getElementById('footer-copy').textContent = t('footer_copy');

  document.getElementById('lang-toggle-btn').textContent = t('lang_toggle');
  document.getElementById('brand-name').textContent = t('brand_name');

  renderCart(); // لتحديث نص حالة الفراغ لو العربة مفتوحة وفاضية
  if (document.getElementById('search').value.trim()) runSearch(); // تحديث نتائج البحث الحالية لو موجودة
}

function toggleLanguage() {
  currentLang = currentLang === 'ar' ? 'en' : 'ar';
  localStorage.setItem('lang', currentLang);
  applyLanguage();
}

// ---------- نافذة تنبيه مخصصة (بديل alert وconfirm الافتراضيين) ----------

function showModal({ message, type = 'info', showCancel = false, okText = 'حسناً', cancelText = 'إلغاء' }) {
  return new Promise(resolve => {
    const icons = { success: '✅', error: '❌', warning: '⚠️', question: '❓', info: 'ℹ️' };
    document.getElementById('modal-icon').textContent = icons[type] || icons.info;
    document.getElementById('modal-message').textContent = message;
    const okBtn = document.getElementById('modal-btn-ok');
    const cancelBtn = document.getElementById('modal-btn-cancel');
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;
    cancelBtn.style.display = showCancel ? 'inline-block' : 'none';
    const overlay = document.getElementById('custom-modal-overlay');
    overlay.style.display = 'flex';
    document.body.classList.add('modal-open');

    const cleanup = (result) => {
      overlay.style.display = 'none';
      document.body.classList.remove('modal-open');
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      resolve(result);
    };
    okBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
  });
}

function customAlert(message, type = 'info') {
  return showModal({ message, type, showCancel: false });
}

function customConfirm(message, type = 'question') {
  return showModal({ message, type, showCancel: true, okText: 'نعم', cancelText: 'إلغاء' });
}

function showView(view) {
  document.getElementById('view-patient').style.display = view === 'patient' ? 'block' : 'none';
  document.getElementById('view-pharmacist').style.display = view === 'pharmacist' ? 'block' : 'none';
  document.getElementById('view-admin').style.display = view === 'admin' ? 'block' : 'none';
  document.getElementById('view-nursing').style.display = view === 'nursing' ? 'block' : 'none';
  if (view === 'pharmacist' && !currentPharmacy) renderPharmacyAuthForm();
  if (view === 'admin' && !adminPassword) renderAdminAuthForm();
  if (view !== 'nursing') stopNursingPolling();
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
  updateBellVisibility();
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

function applyMedicineHeroText() {
  document.getElementById('hero-title').innerHTML = t('hero_title_medicine');
  document.getElementById('hero-description').textContent = t('hero_desc_medicine');
  document.getElementById('search').placeholder = t('search_placeholder_medicine');
  document.getElementById('hero-search-hint').textContent = t('search_hint_medicine');
}

function applyCosmeticHeroText() {
  document.getElementById('hero-title').innerHTML = t('hero_title_cosmetic');
  document.getElementById('hero-description').textContent = t('hero_desc_cosmetic');
  document.getElementById('search').placeholder = t('search_placeholder_cosmetic');
  document.getElementById('hero-search-hint').textContent = t('search_hint_cosmetic');
}

function applyNursingHeroText() {
  document.getElementById('hero-title').innerHTML = t('hero_title_nursing');
  document.getElementById('hero-description').textContent = t('hero_desc_nursing');
  document.getElementById('hero-search-hint').textContent = t('search_hint_nursing');
}

function headerGoHome(link) {
  if (currentCategory !== 'medicine') {
    currentCategory = 'medicine';
    applyMedicineHeroText();
    document.getElementById('search').value = '';
    document.getElementById('results').innerHTML = '';
  }
  document.getElementById('hero-search-wrap').style.display = '';
  showView('patient');
  document.getElementById('on-duty-section').style.display = 'none';
  updateCartVisibility();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setActiveNav(link);
}

function headerGoCosmetics(link) {
  currentCategory = 'cosmetic';
  applyCosmeticHeroText();
  document.getElementById('search').value = '';
  document.getElementById('results').innerHTML = '';
  document.getElementById('hero-search-wrap').style.display = '';
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

async function addToCart(medicineName, genericName, pharmacyName, pharmacyId, btn) {
  const existing = cart.find(item => item.medicineName === medicineName && item.pharmacyId === pharmacyId);
  if (existing) {
    if (existing.quantity >= 3 && !existing.confirmedExcess) {
      const wantsMore = await customConfirm(`لقد أضفت ${existing.quantity} من ${medicineName} من ${pharmacyName} إلى عربتك. هل تريد إضافة المزيد؟`, 'question');
      if (!wantsMore) return;
      existing.confirmedExcess = true;
    }
    existing.quantity += 1;
  } else {
    cart.push({ medicineName, genericName, pharmacyName, pharmacyId, quantity: 1, confirmedExcess: false });
  }
  saveCart();
  renderCart();
  showAddedFeedback(btn);
}

// تغيير مؤقت لشكل زر الإضافة نفسه كتأكيد فوري، بدون أي نافذة أو تنبيه منفصل
function showAddedFeedback(btn) {
  if (!btn || btn.dataset.feedbackActive === '1') return;
  const originalText = btn.textContent;
  btn.dataset.feedbackActive = '1';
  btn.disabled = true;
  btn.classList.add('added-success');
  btn.textContent = t('added_feedback');
  setTimeout(() => {
    btn.textContent = originalText;
    btn.classList.remove('added-success');
    btn.disabled = false;
    btn.dataset.feedbackActive = '0';
  }, 1100);
}

async function increaseQuantity(index) {
  const item = cart[index];
  if (item.quantity >= 3 && !item.confirmedExcess) {
    const wantsMore = await customConfirm(`لقد أضفت ${item.quantity} من ${item.medicineName} من ${item.pharmacyName} إلى عربتك. هل تريد إضافة المزيد؟`, 'question');
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
  updateBellVisibility();
}

function renderCart() {
  const container = document.getElementById('cart-section');
  if (cart.length === 0) {
    container.innerHTML = `
      <div class="box cart-empty">
        <div class="cart-empty-icon">🛒</div>
        <p class="cart-empty-title">${t('cart_empty_title')}</p>
        <p class="cart-empty-subtitle">${t('cart_empty_subtitle')}</p>
      </div>
    `;
    return;
  }
  container.innerHTML = `
    <div class="cart-header">
      <h3 class="cart-title">${t('cart_panel_title')}</h3>
      <p class="cart-subtitle">${t('cart_panel_subtitle')}</p>
    </div>
    ${cart.map((item, i) => `
      <div class="cart-item-card">
        <div class="cart-item-top">
          <div>
            <div class="cart-item-name"><span>💊</span> ${item.medicineName}</div>
            ${item.genericName ? `<div class="cart-item-generic">${item.genericName}</div>` : ''}
            <div class="cart-item-pharmacy">${item.pharmacyName}</div>
          </div>
          <button class="cart-remove-btn" onclick="removeFromCart(${i})" aria-label="${t('remove_aria')}">🗑️</button>
        </div>
        <div class="cart-item-bottom">
          <div class="qty-control">
            <button class="qty-btn" onclick="decreaseQuantity(${i})">-</button>
            <span class="qty-value">${item.quantity}</span>
            <button class="qty-btn" onclick="increaseQuantity(${i})">+</button>
          </div>
        </div>
      </div>
    `).join('')}
    <div class="cart-summary">
      <div class="cart-summary-row"><span>${t('cart_items_count_label')}</span><span>${cart.length}</span></div>
      <input id="checkout-name" placeholder="${t('checkout_name_placeholder')}">
      <input id="checkout-phone" placeholder="${t('checkout_phone_placeholder')}" type="tel" inputmode="numeric" oninput="digitsOnly(this)">
      <button class="checkout-btn" onclick="submitOrder()">${t('checkout_btn')}</button>
    </div>
  `;
}

async function submitOrder() {
  const name = document.getElementById('checkout-name').value.trim();
  const phone = document.getElementById('checkout-phone').value.trim();
  if (!name || !phone) {
    customAlert(t('checkout_missing_fields'), 'warning');
    return;
  }
  try {
    const res = await fetch(`${API}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_name: name,
        patient_phone: phone,
        items: cart.map(item => ({
          pharmacyId: item.pharmacyId,
          medicineName: item.medicineName,
          genericName: item.genericName,
          quantity: item.quantity
        }))
      })
    });
    const data = await res.json();
    if (!res.ok) { customAlert(data.error, 'error'); return; }

    // نربط كل طلب باسم صيدليته (من العربة) ونحفظه محلياً لمتابعة رد الصيدلية عليه
    data.orders.forEach(o => {
      const item = cart.find(it => it.pharmacyId === o.pharmacy_id);
      myOrders.push({ id: o.id, pharmacyName: item ? item.pharmacyName : '', status: 'pending' });
    });
    saveMyOrders();
    updateBellVisibility();
    startMyOrdersPolling();

    await customAlert(t('order_success_msg'), 'success');
    cart = [];
    saveCart();
    renderCart();
  } catch (err) {
    customAlert(t('server_error_title'), 'error');
  }
}

// ---------- تتبع حالة طلبات المريض (هل استجابت الصيدلية؟) — عبر أيقونة الجرس ----------

function saveMyOrders() {
  localStorage.setItem('myOrders', JSON.stringify(myOrders));
}

function updateBellVisibility() {
  const btn = document.getElementById('bell-btn');
  if (!btn) return;
  const wrap = document.querySelector('.cart-section-wrap');
  const cartSection = document.getElementById('cart-section');
  const cartOpen = cartSection && cartSection.style.display !== 'none';
  const hasOrders = myOrders.length > 0;
  const showBell = hasOrders && cartOpen;
  btn.style.display = showBell ? 'inline-flex' : 'none';
  if (wrap) wrap.classList.toggle('has-bell', showBell);
  if (!showBell) document.getElementById('bell-panel').style.display = 'none';
}

function updateBellBadge() {
  const badge = document.getElementById('bell-badge');
  const cartBadge = document.getElementById('cart-notify-badge');
  const confirmedCount = myOrders.filter(o => o.status === 'confirmed').length;
  if (badge) {
    badge.textContent = confirmedCount;
    badge.style.display = confirmedCount > 0 ? 'flex' : 'none';
  }
  if (cartBadge) {
    cartBadge.textContent = confirmedCount;
    cartBadge.style.display = confirmedCount > 0 ? 'flex' : 'none';
  }
}

function pulseBell() {
  const btn = document.getElementById('bell-btn');
  if (!btn) return;
  btn.classList.remove('pulse');
  void btn.offsetWidth; // يعيد تشغيل حركة الاهتزاز حتى لو صارت قبل شوي
  btn.classList.add('pulse');
}

function toggleBellPanel() {
  const panel = document.getElementById('bell-panel');
  const willShow = panel.style.display === 'none';
  panel.style.display = willShow ? 'block' : 'none';
  if (willShow) renderBellPanel();
}

function renderBellPanel() {
  const panel = document.getElementById('bell-panel');
  if (!myOrders || myOrders.length === 0) {
    panel.innerHTML = `<div class="bell-panel-empty">ما في إشعارات حالياً</div>`;
    return;
  }
  panel.innerHTML = myOrders.map(o => {
    if (o.status === 'confirmed') {
      return `
        <div class="order-status-banner confirmed">
          <div class="order-status-banner-text">
            <span class="order-status-icon">✅</span>
            <span>تم الاستجابة لطلبك من قبل الصيدلية (${o.pharmacyName})</span>
          </div>
          <button class="order-status-dismiss" onclick="dismissMyOrder(${o.id})" aria-label="إخفاء">✕</button>
        </div>`;
    }
    return `
      <div class="order-status-banner pending">
        <div class="order-status-banner-text">
          <span class="order-status-icon">⏳</span>
          <span>طلبك عند صيدلية (${o.pharmacyName}) قيد المراجعة...</span>
        </div>
      </div>`;
  }).join('');
}

function dismissMyOrder(id) {
  myOrders = myOrders.filter(o => o.id !== id);
  saveMyOrders();
  updateBellBadge();
  updateBellVisibility();
  renderBellPanel();
}

let myOrdersPollInterval = null;

function startMyOrdersPolling() {
  if (myOrdersPollInterval) return;
  checkMyOrdersStatus();
  myOrdersPollInterval = setInterval(checkMyOrdersStatus, 2000);
}

function stopMyOrdersPolling() {
  if (myOrdersPollInterval) {
    clearInterval(myOrdersPollInterval);
    myOrdersPollInterval = null;
  }
}

async function checkMyOrdersStatus() {
  if (!myOrders || myOrders.length === 0) { stopMyOrdersPolling(); updateBellVisibility(); return; }
  try {
    const ids = myOrders.map(o => o.id).join(',');
    const res = await fetch(`${API}/orders/status?ids=${ids}`);
    const rows = await res.json();
    const lengthBefore = myOrders.length;
    let newlyConfirmed = false;
    myOrders = myOrders.filter(local => {
      const found = rows.find(r => r.id === local.id);
      if (!found) return false; // الصيدلية حذفت الطلب من عندها
      if (found.status === 'confirmed' && local.status !== 'confirmed') {
        local.status = 'confirmed';
        newlyConfirmed = true;
      }
      return true;
    });

    // ما منلمس أي عنصر بالصفحة إلا إذا صار تغيير فعلي — تجنباً لأي إعادة رسم بلا داعي
    const changed = newlyConfirmed || myOrders.length !== lengthBefore;
    if (changed) {
      saveMyOrders();
      updateBellBadge();
      updateBellVisibility();
      const panel = document.getElementById('bell-panel');
      if (panel && panel.style.display !== 'none') renderBellPanel();
      if (newlyConfirmed) pulseBell();
    }
    if (myOrders.every(o => o.status === 'confirmed')) stopMyOrdersPolling();
  } catch (err) { /* تجاهل بصمت، رح يعيد المحاولة بالجولة الجاية */ }
}

function whatsappComingSoon() {
  customAlert('البحث عبر واتساب قريباً 💬 لسا عم نجهز رقم رسمي للمشروع.', 'info');
}

function headerGoNursing(link) {
  applyNursingHeroText();
  document.getElementById('hero-search-wrap').style.display = 'none';
  showView('nursing');
  document.getElementById('on-duty-section').style.display = 'none';
  updateCartVisibility();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setActiveNav(link);
  loadNurses().then(startNursingPolling);
}

function footerContactComingSoon() {
  customAlert('سيتم إضافة معلومات التواصل قريباً.', 'info');
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

let lastOnDutySnapshot = null;

async function loadOnDuty() {
  const container = document.getElementById('on-duty-section');
  try {
    const res = await fetch(`${API}/pharmacies/on-duty`);
    const data = await res.json();

    // ما تغيّر شي بالبيانات؟ خلص، ما في داعي نعيد رسم الشاشة ونسبب وميض
    const snapshot = JSON.stringify(data);
    if (snapshot === lastOnDutySnapshot) return;
    lastOnDutySnapshot = snapshot;

    if (data.length === 0) {
      container.innerHTML = `
        <div class="duty-wrap">
          <div class="empty-state">
            <div class="empty-icon">🏥</div>
            <p class="empty-title">لا توجد صيدليات مناوبة حالياً</p>
            <p class="empty-subtitle">تحقق لاحقاً، أو تواصل مع صيدليتك المفضلة مباشرة.</p>
          </div>
        </div>
      `;
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

// ---------- خدمات التمريض ----------

let nursesCache = [];

// تسمح فقط بكتابة أرقام بخانات الهاتف (تمنع الحروف أثناء الكتابة مباشرة)
function digitsOnly(input) {
  input.value = input.value.replace(/[^0-9]/g, '');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function renderStars(count) {
  const rounded = Math.round(count);
  let html = '';
  for (let i = 1; i <= 5; i++) html += i <= rounded ? '★' : '☆';
  return `<span class="star-display">${html}</span>`;
}

function getRatedNurses() {
  return JSON.parse(localStorage.getItem('ratedNurses') || '[]');
}

function hasRatedNurse(nurseId) {
  return getRatedNurses().includes(nurseId);
}

function markNurseAsRated(nurseId) {
  const list = getRatedNurses();
  if (!list.includes(nurseId)) {
    list.push(nurseId);
    localStorage.setItem('ratedNurses', JSON.stringify(list));
  }
}

let openNurseDetailIds = new Set();

function renderNursesList(nurses) {
  if (nurses.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">🩺</div>
        <p class="empty-title">لا يوجد ممرضون مسجّلون حالياً</p>
        <p class="empty-subtitle">سوف يتم إضافة ممرضين موثوقين قريباً.</p>
      </div>`;
  }
  return nurses.map(n => `
    <div class="result-card">
      <div class="result-card-top">
        <span class="result-med-name">👤 ${escapeHtml(n.name)}</span>
        <span class="badge ${n.available ? 'yes' : 'no'}">${n.available ? '🟢 متاح للعمل' : '🔴 غير متاح حالياً'}</span>
      </div>
      <div class="result-row">🎓 ${escapeHtml(n.specialty || 'ممرض عام')}</div>
      <div class="result-row">
        ${n.rating_count > 0
          ? `${renderStars(n.avg_rating)} ${Number(n.avg_rating).toFixed(1)} من ${n.rating_count} تقييم`
          : '<span class="muted">لا توجد تقييمات بعد</span>'}
      </div>
      <button class="btn-outline blue small" onclick="toggleNurseDetail(${n.id})">لمحة عنه</button>
      <div id="nurse-detail-${n.id}" style="display:none; margin-top:12px;"></div>
    </div>
  `).join('');
}

async function loadNurses() {
  const container = document.getElementById('nurses-list');
  container.innerHTML = '<p class="muted">جاري التحميل...</p>';
  openNurseDetailIds.clear();
  try {
    const res = await fetch(`${API}/nurses`);
    const nurses = await res.json();
    nursesCache = nurses;
    lastNursesSnapshot = JSON.stringify(nurses);
    container.innerHTML = renderNursesList(nurses);
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p class="empty-title">تعذر الاتصال بالخادم</p>
        <p class="empty-subtitle">تحقق من اتصالك بالإنترنت وحاول مرة أخرى.</p>
      </div>`;
  }
}

// ---------- تحديث دوري لصفحة التمريض (عشان يظهر رأي المريض فور موافقة الإدارة عليه) ----------

let nursingPollInterval = null;
let lastNursesSnapshot = null;

function startNursingPolling() {
  stopNursingPolling();
  nursingPollInterval = setInterval(pollNurses, 5000);
}

function stopNursingPolling() {
  if (nursingPollInterval) {
    clearInterval(nursingPollInterval);
    nursingPollInterval = null;
  }
}

async function pollNurses() {
  try {
    const res = await fetch(`${API}/nurses`);
    const nurses = await res.json();
    const snapshot = JSON.stringify(nurses);
    if (snapshot === lastNursesSnapshot) return; // ما تغيّر شي، صفر إعادة رسم
    lastNursesSnapshot = snapshot;
    nursesCache = nurses;

    const container = document.getElementById('nurses-list');
    if (!container) { stopNursingPolling(); return; }
    container.innerHTML = renderNursesList(nurses);

    // نعيد فتح أي "لمحة عنه" كانت مفتوحة عند المستخدم، بمحتواها المحدّث
    for (const id of openNurseDetailIds) {
      const panel = document.getElementById(`nurse-detail-${id}`);
      if (panel) {
        panel.style.display = 'block';
        renderNurseDetail(id);
      }
    }
  } catch (err) { /* تجاهل بصمت، رح يعيد المحاولة بالجولة الجاية */ }
}

async function toggleNurseDetail(nurseId) {
  const panel = document.getElementById(`nurse-detail-${nurseId}`);
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    openNurseDetailIds.add(nurseId);
    await renderNurseDetail(nurseId);
  } else {
    panel.style.display = 'none';
    openNurseDetailIds.delete(nurseId);
  }
}

async function renderNurseDetail(nurseId) {
  const panel = document.getElementById(`nurse-detail-${nurseId}`);
  const nurse = nursesCache.find(n => n.id === nurseId);
  panel.innerHTML = '<p class="muted">جاري التحميل...</p>';

  let ratings = [];
  try {
    const res = await fetch(`${API}/nurses/${nurseId}/ratings`);
    ratings = await res.json();
  } catch (err) { /* بنكمل بعرض الملخص حتى لو فشل جلب التعليقات */ }

  const alreadyRated = hasRatedNurse(nurseId);

  panel.innerHTML = `
    <div class="box">
      ${nurse && nurse.university ? `<div class="result-row">🎓 ${escapeHtml(nurse.university)}${nurse.graduation_year ? ' - تخرج ' + escapeHtml(nurse.graduation_year) : ''}</div>` : ''}
      ${nurse && nurse.phone ? `<div class="result-row">📞 ${escapeHtml(nurse.phone)}</div>` : ''}
      <hr style="border:none; border-top:1px solid #eef2f6; margin:14px 0;">
      <p style="font-weight:700; margin:0 0 8px;">آراء المرضى (${ratings.length})</p>
      ${ratings.length === 0
        ? '<p class="muted" style="margin:0 0 12px;">لا توجد آراء منشورة بعد.</p>'
        : ratings.map(r => `
          <div style="padding:8px 0; border-bottom:1px solid #f2f5f8;">
            <div>${renderStars(r.stars)}</div>
            ${r.comment ? `<p style="margin:4px 0 0; font-size:14px; color:#3a4a58;">${escapeHtml(r.comment)}</p>` : ''}
          </div>
        `).join('')
      }
      <hr style="border:none; border-top:1px solid #eef2f6; margin:14px 0;">
      <p style="font-weight:700; margin:0 0 8px;">قيّم هذا الممرض</p>
      ${alreadyRated
        ? '<p class="muted">شكراً، تم إرسال تقييمك مسبقاً وهو الآن قيد مراجعة الإدارة.</p>'
        : `
          <div class="star-picker" id="rating-stars-${nurseId}">
            ${[1, 2, 3, 4, 5].map(i => `<button type="button" onclick="setRatingStars(${nurseId}, ${i})" data-i="${i}" aria-label="${starAriaLabel(i)}" aria-pressed="false">☆</button>`).join('')}
          </div>
          <textarea id="rating-comment-${nurseId}" placeholder="اكتب رأيك (اختياري)" rows="2" style="width:100%; padding:10px 14px; border:1px solid #cfe0ef; border-radius:14px; font-family:inherit; font-size:15px; resize:vertical; margin-bottom:10px;"></textarea>
          <input id="rating-name-${nurseId}" placeholder="اسمك">
          <input id="rating-phone-${nurseId}" placeholder="رقم هاتفك" type="tel" inputmode="numeric" oninput="digitsOnly(this)">
          <button class="primary" onclick="submitNurseRating(${nurseId})">إرسال التقييم</button>
        `}
    </div>
  `;
}

const selectedNurseStars = {};

// وصف عربي صحيح لكل نجمة حسب قواعد العدد (واحدة/اثنتين/3 فما فوق)
function starAriaLabel(i) {
  if (i === 1) return 'قيّم نجمة واحدة من 5';
  if (i === 2) return 'قيّم نجمتين من 5';
  return `قيّم ${i} نجوم من 5`;
}

function setRatingStars(nurseId, stars) {
  selectedNurseStars[nurseId] = stars;
  const container = document.getElementById(`rating-stars-${nurseId}`);
  if (!container) return;
  container.querySelectorAll('button').forEach(btn => {
    const i = Number(btn.dataset.i);
    const active = i <= stars;
    btn.textContent = active ? '★' : '☆';
    btn.classList.toggle('filled', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

async function submitNurseRating(nurseId) {
  const stars = selectedNurseStars[nurseId];
  if (!stars) { customAlert('الرجاء اختيار عدد النجوم أولاً', 'warning'); return; }
  const name = document.getElementById(`rating-name-${nurseId}`).value.trim();
  const phone = document.getElementById(`rating-phone-${nurseId}`).value.trim();
  const comment = document.getElementById(`rating-comment-${nurseId}`).value.trim();
  if (!name || !phone) { customAlert('الاسم ورقم الهاتف مطلوبان', 'warning'); return; }
  try {
    const res = await fetch(`${API}/nurses/${nurseId}/ratings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_name: name, patient_phone: phone, stars, comment })
    });
    const data = await res.json();
    if (!res.ok) { customAlert(data.error, 'error'); return; }
    markNurseAsRated(nurseId);
    await customAlert('تم إرسال تقييمك بنجاح! رح يظهر للعموم بعد موافقة الإدارة عليه.', 'success');
    renderNurseDetail(nurseId);
  } catch (err) {
    customAlert('تعذر الاتصال بالخادم', 'error');
  }
}

function uploadCertificateComingSoon() {
  customAlert('رفع الشهادات (PDF/Word) رح يتفعّل بعد ربط استضافة دائمة للملفات 📄', 'info');
}

let searchTimeout;
let suggestionIndex = -1;
function onSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const q = document.getElementById('search').value.trim();
    // حد أدنى حرفين للبحث الحي بس (البحث الصريح بزر "بحث" أو الاقتراحات غير متأثر إطلاقاً)
    if (q.length < 2) {
      document.getElementById('results').innerHTML = '';
    } else {
      runSearch();
    }
    loadSuggestions();
  }, 300);
}

async function loadSuggestions() {
  const q = document.getElementById('search').value.trim();
  const box = document.getElementById('suggestions');
  suggestionIndex = -1;
  if (!q) {
    box.classList.remove('show');
    box.innerHTML = '';
    return;
  }
  try {
    const res = await fetch(`${API}/medicines/suggest?q=${encodeURIComponent(q)}&category=${currentCategory}`);
    const data = await res.json();
    if (data.length === 0) {
      box.classList.remove('show');
      box.innerHTML = '';
      return;
    }
    box.innerHTML = data.map((m, i) => `
      <div class="suggestion-item" role="option" id="suggestion-${i}" aria-selected="false" onclick="pickSuggestion('${m.name}')">
        ${t('suggest_did_you_mean')} <strong>${m.name}</strong>${t('q_mark')}
        ${m.generic_name ? `<span class="generic-hint"> (${m.generic_name})</span>` : ''}
      </div>
    `).join('');
    box.classList.add('show');
  } catch (err) {
    box.classList.remove('show');
  }
}

function onSearchKeydown(e) {
  const box = document.getElementById('suggestions');
  const isOpen = box.classList.contains('show');
  const items = box.querySelectorAll('.suggestion-item');

  if (e.key === 'ArrowDown') {
    if (!isOpen || items.length === 0) return;
    e.preventDefault();
    suggestionIndex = (suggestionIndex + 1) % items.length;
    highlightSuggestion(items);
  } else if (e.key === 'ArrowUp') {
    if (!isOpen || items.length === 0) return;
    e.preventDefault();
    suggestionIndex = (suggestionIndex - 1 + items.length) % items.length;
    highlightSuggestion(items);
  } else if (e.key === 'Enter') {
    if (isOpen && items.length > 0 && suggestionIndex >= 0) {
      e.preventDefault();
      items[suggestionIndex].click();
    } else {
      // ما في اقتراح محدد: Enter بيبحث مباشرة، بنفس سلوك زر "بحث" بالظبط
      e.preventDefault();
      submitSearch();
    }
  } else if (e.key === 'Escape') {
    if (isOpen) {
      box.classList.remove('show');
      suggestionIndex = -1;
    }
  }
}

function highlightSuggestion(items) {
  items.forEach((el, i) => {
    const active = i === suggestionIndex;
    el.classList.toggle('active', active);
    el.setAttribute('aria-selected', active ? 'true' : 'false');
    if (active) el.scrollIntoView({ block: 'nearest' });
  });
}

async function pickSuggestion(name) {
  document.getElementById('search').value = name;
  document.getElementById('suggestions').classList.remove('show');
  suggestionIndex = -1;
  await runSearch();
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function submitSearch() {
  document.getElementById('suggestions').classList.remove('show');
  suggestionIndex = -1;
  await runSearch();
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function runSearch() {
  const q = document.getElementById('search').value.trim();
  const container = document.getElementById('results');
  if (!q) {
    container.innerHTML = '';
    return;
  }
  try {
    const res = await fetch(`${API}/medicines/search?q=${encodeURIComponent(q)}&category=${currentCategory}`);
    const data = await res.json();

    if (data.length === 0) {
      const notFoundTitle = currentCategory === 'cosmetic' ? t('not_found_title_cosmetic') : t('not_found_title_medicine');
      let html = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p class="empty-title">${notFoundTitle}</p>
          <p class="empty-subtitle">${t('not_found_subtitle')}</p>
        </div>`;
      try {
        const sugRes = await fetch(`${API}/medicines/suggest?q=${encodeURIComponent(q)}&category=${currentCategory}`);
        const suggestions = await sugRes.json();
        if (suggestions.length > 0) {
          html += `
            <div class="box">
              <p class="muted" style="margin-top:0;">${t('did_you_mean_results')}</p>
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
    for (const item of data) {
      const anyAvailable = item.availability.some(a => a.available);
      item.availability.forEach(a => {
        cardsHtml += `
          <div class="result-card">
            <div class="result-card-top">
              <span class="result-med-name"><span class="result-icon">${currentCategory === 'cosmetic' ? '💄' : '💊'}</span> ${item.medicine.name}</span>
              <span class="badge ${a.available ? 'yes' : 'no'}">${a.available ? t('available_badge') : t('unavailable_badge')}</span>
            </div>
            <div class="result-row">${t('active_ingredient_label')} ${item.medicine.generic_name || '-'}</div>
            <div class="result-pharmacy"><span class="result-icon">📍</span> ${a.pharmacy_name}${a.address ? ' - ' + a.address : ''}</div>
            ${a.phone ? `<div class="result-row"><span class="result-icon">📞</span> ${a.phone}</div>` : ''}
            ${a.available ? `<button class="result-add-btn-full" onclick="addToCart('${item.medicine.name}', '${item.medicine.generic_name || ''}', '${a.pharmacy_name}', ${a.pharmacy_id}, this)">${t('add_to_cart_btn')}</button>` : ''}
          </div>
        `;
      });

      if (!anyAvailable && item.medicine.generic_name) {
        try {
          const altRes = await fetch(`${API}/medicines/search?q=${encodeURIComponent(item.medicine.generic_name)}&category=${currentCategory}`);
          const altData = await altRes.json();
          const alternatives = altData
            .filter(alt => alt.medicine.id !== item.medicine.id)
            .map(alt => ({ medicine: alt.medicine, availability: alt.availability.filter(a => a.available) }))
            .filter(alt => alt.availability.length > 0);

          if (alternatives.length > 0) {
            cardsHtml += `
              <div class="alt-suggestion-box">
                <p class="alt-suggestion-title">${currentCategory === 'cosmetic' ? '💄' : '💊'} "${item.medicine.name}" ${t('alt_unavailable_but')} (${item.medicine.generic_name}):</p>
                ${alternatives.map(alt => alt.availability.map(a => `
                  <div class="alt-suggestion-row">
                    <span>${alt.medicine.name} <span class="muted">- ${a.pharmacy_name}</span></span>
                    <button class="btn-outline blue small" onclick="pickSuggestion('${alt.medicine.name}')">${t('alt_view_btn')}</button>
                  </div>
                `).join('')).join('')}
              </div>
            `;
          }
        } catch (err) { /* تجاهل فشل البحث عن بدائل، النتيجة الأساسية أهم */ }
      }
    }
    container.innerHTML = cardsHtml;
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p class="empty-title">${t('server_error_title')}</p>
        <p class="empty-subtitle">${t('server_error_subtitle')}</p>
      </div>`;
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
        <button type="button" class="toggle-password" onclick="togglePassword('login-password', this)" aria-label="إظهار كلمة المرور">👁</button>
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
    if (!res.ok) { customAlert(data.error, 'error'); return; }
    currentPharmacy = { ...data, username, password };
    loadDashboard();
  } catch (err) {
    customAlert('تعذر الاتصال بالخادم', 'error');
  }
}

function loadDashboard() {
  document.getElementById('pharmacist-auth-section').innerHTML = '';
  document.getElementById('pharmacist-dashboard').style.display = 'block';
  document.getElementById('pharmacy-label').innerHTML = `
    <span style="font-weight:500; font-size:16px;">صيدلية: ${currentPharmacy.name}</span>
    <button class="action-pill-btn blue" onclick="logout()">🚪 تسجيل الخروج</button>
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
  loadOrders();
  startOrdersPolling();
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
    if (!res.ok) { customAlert(data.error, 'error'); return; }
    currentPharmacy.on_duty = data.on_duty;
    currentPharmacy.on_duty_day = data.on_duty_day;
    currentPharmacy.on_duty_shift = data.on_duty_shift;
    currentPharmacy.on_duty_start_time = data.on_duty_start_time;
    currentPharmacy.on_duty_end_time = data.on_duty_end_time;
    refreshStock();
    customAlert('تم حفظ حالة المناوبة بنجاح', 'success');
  } catch (err) {
    customAlert('تعذر الاتصال بالخادم', 'error');
  }
}

function logout() {
  currentPharmacy = null;
  stopOrdersPolling();
  document.getElementById('pharmacist-dashboard').style.display = 'none';
  renderPharmacyAuthForm();
}

function updateMedNamePlaceholder(selectId, inputId) {
  const category = document.getElementById(selectId).value;
  document.getElementById(inputId).placeholder = category === 'cosmetic' ? 'اسم المستحضر' : 'اسم الدواء';
}

async function addMedicineSelf() {
  const name = document.getElementById('pharm-med-name').value.trim();
  const generic_name = document.getElementById('pharm-med-generic').value.trim();
  const alt_names = document.getElementById('pharm-med-alt').value.split(',').map(s => s.trim()).filter(Boolean);
  const category = document.getElementById('pharm-med-category').value;
  if (!name) { customAlert('اسم الدواء مطلوب', 'warning'); return; }
  try {
    const res = await fetch(`${API}/medicines/self`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentPharmacy.username,
        password: currentPharmacy.password,
        name, generic_name, alt_names, category
      })
    });
    const data = await res.json();
    if (!res.ok) { customAlert(data.error, 'error'); return; }
    document.getElementById('pharm-med-name').value = '';
    document.getElementById('pharm-med-generic').value = '';
    document.getElementById('pharm-med-alt').value = '';
    document.getElementById('pharm-med-category').value = 'medicine';
    updateMedNamePlaceholder('pharm-med-category', 'pharm-med-name');
    customAlert('تمت الإضافة بنجاح. فعّل حالة توفره من القائمة تحت.', 'success');
    refreshStock();
  } catch (err) {
    customAlert('تعذر الاتصال بالخادم', 'error');
  }
}

async function refreshStock() {
  const res = await fetch(`${API}/stock/${currentPharmacy.id}`);
  const data = await res.json();
  document.getElementById('stock-list').innerHTML = data.map(m => `
    <div class="row">
      <span>${m.name} <span class="muted" style="font-size:12px;">${m.category === 'cosmetic' ? '💄' : '💊'}</span></span>
      <button class="toggle-btn ${m.available ? 'yes' : 'no'}" onclick="toggleStock(${m.medicine_id}, ${!m.available})">
        ${m.available ? '🟢 متوفر' : '🔴 غير متوفر'}
      </button>
    </div>
  `).join('');
  renderDashboardStats(data);
}

function renderDashboardStats(data) {
  const medicines = data.filter(m => m.category !== 'cosmetic');
  const cosmetics = data.filter(m => m.category === 'cosmetic');
  const total = medicines.length;
  const available = medicines.filter(m => m.available).length;
  const unavailable = total - available;
  const cosmeticsTotal = cosmetics.length;
  const cosmeticsAvailable = cosmetics.filter(m => m.available).length;
  const onDutyText = currentPharmacy.on_duty ? 'نعم' : 'لا';
  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${total}</div>
      <div class="stat-label">عدد الأدوية</div>
    </div>
    <div class="stat-card">
      <div class="stat-value stat-green">${available}</div>
      <div class="stat-label">أدوية متوفرة</div>
    </div>
    <div class="stat-card">
      <div class="stat-value stat-red">${unavailable}</div>
      <div class="stat-label">غير المتوفرة</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${cosmeticsAvailable}/${cosmeticsTotal}</div>
      <div class="stat-label">مستحضرات</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${onDutyText}</div>
      <div class="stat-label">المناوبة اليوم</div>
    </div>
  `;
}

let ordersPollInterval = null;

function startOrdersPolling() {
  stopOrdersPolling();
  ordersPollInterval = setInterval(loadOrders, 12000);
}

function stopOrdersPolling() {
  if (ordersPollInterval) {
    clearInterval(ordersPollInterval);
    ordersPollInterval = null;
  }
}

async function loadOrders() {
  try {
    const res = await fetch(`${API}/orders/${currentPharmacy.id}`);
    const orders = await res.json();
    const wrap = document.getElementById('orders-wrap');
    const list = document.getElementById('orders-list');
    if (!orders || orders.length === 0) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = 'block';
    list.innerHTML = orders.map(o => `
      <div class="order-card ${!o.seen ? 'is-new' : ''}">
        <div class="order-card-top">
          <span class="order-patient-name">👤 ${o.patient_name}</span>
          ${!o.seen ? '<span class="order-new-badge">🆕 جديد</span>' : ''}
          ${o.status === 'confirmed' ? '<span class="order-confirmed-badge">✅ تم الحجز</span>' : ''}
        </div>
        <div class="order-row"><span>📞</span> ${o.patient_phone}</div>
        <div class="order-row"><span>🕐</span> ${new Date(o.created_at).toLocaleString('ar-SY')}</div>
        <div class="order-items-list">
          ${o.items.map(it => `<div class="order-item-line">💊 ${it.medicineName}${it.genericName ? ' - ' + it.genericName : ''} × ${it.quantity}</div>`).join('')}
        </div>
        <div class="order-actions-row">
          ${!o.seen ? `<button class="btn-outline blue small" onclick="dismissOrder(${o.id})">تم الاطلاع</button>` : ''}
          ${o.status !== 'confirmed' ? `<button class="btn-outline green small" onclick="confirmOrderAction(${o.id})">✅ تأكيد الحجز</button>` : ''}
          <button class="btn-outline red small" onclick="removeOrder(${o.id})">🗑️ حذف الطلب</button>
        </div>
      </div>
    `).join('');
  } catch (err) { /* تجاهل بصمت لو فشل الجلب، الأهم لوحة الصيدلي نفسها */ }
}

async function dismissOrder(id) {
  await fetch(`${API}/orders/${id}/seen`, { method: 'PUT' });
  loadOrders();
}

async function confirmOrderAction(id) {
  await fetch(`${API}/orders/${id}/confirm`, { method: 'PUT' });
  loadOrders();
}

async function removeOrder(id) {
  const confirmed = await customConfirm('متأكد إنك تعاملت مع هذا الطلب وبدك تحذفه نهائياً؟', 'warning');
  if (!confirmed) return;
  await fetch(`${API}/orders/${id}`, { method: 'DELETE' });
  loadOrders();
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
  const confirmed = await customConfirm('متأكد إنك بدك تحذف حسابك نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.', 'warning');
  if (!confirmed) return;
  const res = await fetch(`${API}/pharmacies/self`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentPharmacy.username, password: currentPharmacy.password })
  });
  const data = await res.json();
  if (!res.ok) { customAlert(data.error, 'error'); return; }
  await customAlert('تم حذف حسابك بنجاح', 'success');
  logout();
}

// ---------- لوحة الإدارة ----------

function renderAdminAuthForm() {
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('admin-auth-section').innerHTML = `
    <div class="auth-box">
      <div class="password-field">
        <input id="admin-password-input" type="password" placeholder="كلمة مرور الإدارة">
        <button type="button" class="toggle-password" onclick="togglePassword('admin-password-input', this)" aria-label="إظهار كلمة المرور">👁</button>
      </div>
      <button class="primary" onclick="checkAdminPassword()">دخول</button>
    </div>
  `;
}

async function checkAdminPassword() {
  const password = document.getElementById('admin-password-input').value;
  const res = await fetch(`${API}/pharmacies`, { headers: { 'x-admin-password': password } });
  if (!res.ok) { customAlert('كلمة المرور غير صحيحة', 'error'); return; }
  adminPassword = password;
  document.getElementById('admin-auth-section').innerHTML = '';
  document.getElementById('admin-panel').style.display = 'block';
  renderAdminPanel();
}

function logoutAdmin() {
  adminPassword = null;
  stopAdminRatingsPolling();
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('admin-panel').innerHTML = '';
  renderAdminAuthForm();
}

function adminHeaders() {
  return { 'Content-Type': 'application/json', 'x-admin-password': adminPassword };
}

async function renderAdminPanel() {
  const [pharmacies, medicines, nurses, pendingRatings] = await Promise.all([
    fetch(`${API}/pharmacies`, { headers: adminHeaders() }).then(r => r.json()),
    fetch(`${API}/medicines`, { headers: adminHeaders() }).then(r => r.json()),
    fetch(`${API}/nurses`).then(r => r.json()),
    fetch(`${API}/nurses/ratings/pending`, { headers: adminHeaders() }).then(r => r.json())
  ]);

  approvedRatingsLoaded = false;
  lastPendingRatingsSnapshot = JSON.stringify(pendingRatings);

  const onDutyCount = pharmacies.filter(p => p.on_duty).length;

  document.getElementById('admin-panel').innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
      <h2 class="dash-title" style="margin-bottom:0;">لوحة الإدارة</h2>
      <button class="action-pill-btn blue" onclick="logoutAdmin()">🚪 تسجيل الخروج</button>
    </div>
    <div class="stats-grid stats-grid-3">
      <div class="stat-card">
        <div class="stat-value">${pharmacies.length}</div>
        <div class="stat-label">عدد الصيدليات</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${medicines.length}</div>
        <div class="stat-label">عدد الأدوية</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-green">${onDutyCount}</div>
        <div class="stat-label">الصيدليات المناوبة اليوم</div>
      </div>
    </div>

    <div class="box" style="margin-bottom:20px;">
      <h3 style="margin-top:0;">🏥 إضافة صيدلية جديدة</h3>
      <input id="ph-name" placeholder="اسم الصيدلية">
      <input id="ph-address" placeholder="العنوان">
      <input id="ph-phone" placeholder="رقم الهاتف">
      <input id="ph-username" placeholder="اسم مستخدم">
      <div class="password-field">
        <input id="ph-password" type="password" placeholder="كلمة مرور">
        <button type="button" class="toggle-password" onclick="togglePassword('ph-password', this)" aria-label="إظهار كلمة المرور">👁</button>
      </div>
      <button class="primary" onclick="addPharmacy()">إضافة الصيدلية</button>
    </div>

    <h3>الصيدليات المسجّلة (${pharmacies.length})</h3>
    <div class="stock-table-wrap" style="margin-bottom:20px;">
      <div class="stock-scroll">
        ${pharmacies.length === 0
          ? '<p class="muted" style="padding:16px 18px; margin:0;">لا يوجد صيدليات مسجّلة بعد.</p>'
          : `<div class="stock-table-header"><span>الصيدلية</span><span class="col-action">إجراء</span></div>
             ${pharmacies.map(p => `
               <div class="row">
                 <span>${p.name} <span class="muted">(${p.owner_username})</span>${p.on_duty ? ' <span class="badge yes" style="margin-right:6px;">🟢 مناوبة</span>' : ''}</span>
                 <button class="btn-outline red small table-action-btn" onclick="deletePharmacyAdmin(${p.id}, '${p.name}')">حذف</button>
               </div>
             `).join('')}`
        }
      </div>
    </div>

    <div class="box" style="margin-bottom:20px;">
      <h3 style="margin-top:0;">💊 إضافة دواء جديد</h3>
      <input id="med-name" placeholder="اسم الدواء">
      <input id="med-generic" placeholder="المادة الفعالة">
      <input id="med-alt" placeholder="أسماء بديلة (افصل بفاصلة)">
      <select id="med-category" onchange="updateMedNamePlaceholder('med-category', 'med-name')">
        <option value="medicine">دواء</option>
        <option value="cosmetic">مستحضر تجميل</option>
      </select>
      <button class="primary" onclick="addMedicineAdmin()">إضافة الدواء</button>
    </div>

    <h3>الأدوية المسجّلة (${medicines.length})</h3>
    <div class="stock-table-wrap" style="margin-bottom:20px;">
      <div class="stock-scroll">
        <div class="stock-table-header"><span>الدواء</span><span class="col-action">إجراء</span></div>
        ${medicines.map(m => `
          <div class="row">
            <span>${m.name} <span class="muted" style="font-size:12px;">${m.category === 'cosmetic' ? '💄 مستحضر تجميل' : '💊 دواء'}</span></span>
            <button class="btn-outline red small table-action-btn" onclick="deleteMedicineAdmin(${m.id}, '${m.name}')">حذف</button>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="box" style="margin-bottom:20px;">
      <h3 style="margin-top:0;">🩺 إضافة ممرض جديد</h3>
      <input id="nurse-name" placeholder="اسم الممرض">
      <input id="nurse-specialty" placeholder="التخصص">
      <input id="nurse-university" placeholder="الجامعة">
      <input id="nurse-grad-year" placeholder="سنة التخرج">
      <input id="nurse-phone" placeholder="رقم الهاتف">
      <button type="button" class="btn-outline blue small" onclick="uploadCertificateComingSoon()" style="margin-bottom:10px;">📄 رفع شهادة (PDF/Word)</button>
      <button class="primary" onclick="addNurseAdmin()">إضافة الممرض</button>
    </div>

    <h3>الممرضون المسجّلون (${nurses.length})</h3>
    <div class="stock-table-wrap" style="margin-bottom:20px;">
      <div class="stock-scroll">
        ${nurses.length === 0
          ? '<p class="muted" style="padding:16px 18px; margin:0;">لا يوجد ممرضون مسجّلون بعد.</p>'
          : `<div class="stock-table-header"><span>الممرض</span><span class="col-action">إجراءات</span></div>
             ${nurses.map(n => `
               <div class="row">
                 <span>${n.name} <span class="muted" style="font-size:12px;">${n.specialty || ''}</span></span>
                 <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
                   <button class="toggle-btn ${n.available ? 'yes' : 'no'}" onclick="toggleNurseAvailabilityAdmin(${n.id}, ${!n.available})">${n.available ? '🟢 متاح' : '🔴 غير متاح'}</button>
                   <button class="btn-outline red small table-action-btn" onclick="deleteNurseAdmin(${n.id}, '${n.name}')">حذف</button>
                 </div>
               </div>
             `).join('')}`
        }
      </div>
    </div>

    <div id="pending-ratings-wrap" style="${pendingRatings.length === 0 ? 'display:none;' : ''}">
      <div class="orders-wrap">
        <h3 style="margin-top:0;">⭐ تقييمات قيد المراجعة (<span id="pending-ratings-count">${pendingRatings.length}</span>)</h3>
        <div id="pending-ratings-list">${renderPendingRatingsCards(pendingRatings)}</div>
      </div>
    </div>

    <div class="box" style="margin-bottom:20px;">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
        <h3 style="margin:0;">💬 التقييمات المنشورة</h3>
        <button class="btn-outline blue small" onclick="toggleApprovedRatingsAdmin()" id="toggle-approved-ratings-btn">عرض التقييمات</button>
      </div>
      <div id="approved-ratings-list" style="display:none; margin-top:14px;"></div>
    </div>
  `;

  startAdminRatingsPolling();
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
  if (!res.ok) { customAlert(data.error, 'error'); return; }
  customAlert(`تمت إضافة صيدلية "${data.name}" بنجاح`, 'success');
  renderAdminPanel();
}

async function deletePharmacyAdmin(id, name) {
  const confirmed = await customConfirm(`متأكد إنك بدك تحذف صيدلية "${name}"؟`, 'warning');
  if (!confirmed) return;
  await fetch(`${API}/pharmacies/${id}`, { method: 'DELETE', headers: adminHeaders() });
  renderAdminPanel();
}

async function addMedicineAdmin() {
  const alt_names = document.getElementById('med-alt').value.split(',').map(s => s.trim()).filter(Boolean);
  const body = {
    name: document.getElementById('med-name').value,
    generic_name: document.getElementById('med-generic').value,
    alt_names,
    category: document.getElementById('med-category').value
  };
  const res = await fetch(`${API}/medicines`, {
    method: 'POST', headers: adminHeaders(), body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) { customAlert(data.error, 'error'); return; }
  customAlert(`تمت إضافة "${data.name}" بنجاح`, 'success');
  renderAdminPanel();
}

async function deleteMedicineAdmin(id, name) {
  const confirmed = await customConfirm(`متأكد إنك بدك تحذف دواء "${name}" نهائياً؟`, 'warning');
  if (!confirmed) return;
  await fetch(`${API}/medicines/${id}`, { method: 'DELETE', headers: adminHeaders() });
  renderAdminPanel();
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
    btn.setAttribute('aria-label', 'إخفاء كلمة المرور');
  } else {
    input.type = 'password';
    btn.textContent = '👁';
    btn.setAttribute('aria-label', 'إظهار كلمة المرور');
  }
}

// ---------- إدارة خدمات التمريض (لوحة الإدارة) ----------

async function addNurseAdmin() {
  const body = {
    name: document.getElementById('nurse-name').value,
    specialty: document.getElementById('nurse-specialty').value,
    university: document.getElementById('nurse-university').value,
    graduation_year: document.getElementById('nurse-grad-year').value,
    phone: document.getElementById('nurse-phone').value,
  };
  const res = await fetch(`${API}/nurses`, {
    method: 'POST', headers: adminHeaders(), body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) { customAlert(data.error, 'error'); return; }
  customAlert(`تمت إضافة "${data.name}" بنجاح`, 'success');
  renderAdminPanel();
}

async function deleteNurseAdmin(id, name) {
  const confirmed = await customConfirm(`متأكد إنك بدك تحذف الممرض "${name}"؟`, 'warning');
  if (!confirmed) return;
  await fetch(`${API}/nurses/${id}`, { method: 'DELETE', headers: adminHeaders() });
  renderAdminPanel();
}

async function toggleNurseAvailabilityAdmin(id, newAvailable) {
  await fetch(`${API}/nurses/${id}/availability`, {
    method: 'PUT', headers: adminHeaders(), body: JSON.stringify({ available: newAvailable })
  });
  renderAdminPanel();
}

async function approveRatingAdmin(id) {
  await fetch(`${API}/nurses/ratings/${id}/approve`, { method: 'PUT', headers: adminHeaders() });
  renderAdminPanel();
}

async function rejectRatingAdmin(id) {
  const confirmed = await customConfirm('متأكد إنك بدك ترفض هذا التقييم؟ رح ينحذف نهائياً.', 'warning');
  if (!confirmed) return;
  await fetch(`${API}/nurses/ratings/${id}`, { method: 'DELETE', headers: adminHeaders() });
  renderAdminPanel();
}

// ---------- تحديث دوري سريع لتقييمات قيد المراجعة (بدون إعادة رسم اللوحة كلها) ----------

function renderPendingRatingsCards(ratings) {
  return ratings.map(r => `
    <div class="order-card is-new">
      <div class="order-card-top">
        <span class="order-patient-name">👤 ${escapeHtml(r.patient_name)} ← ${escapeHtml(r.nurse_name)}</span>
        <span class="order-new-badge">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span>
      </div>
      <div class="order-row"><span>📞</span> ${escapeHtml(r.patient_phone)}</div>
      ${r.comment ? `<div class="order-items-list"><div class="order-item-line">💬 ${escapeHtml(r.comment)}</div></div>` : ''}
      <div class="order-actions-row">
        <button class="btn-outline green small" onclick="approveRatingAdmin(${r.id})">✅ موافقة</button>
        <button class="btn-outline red small" onclick="rejectRatingAdmin(${r.id})">🗑️ رفض</button>
      </div>
    </div>
  `).join('');
}

let adminRatingsPollInterval = null;
let lastPendingRatingsSnapshot = null;

function startAdminRatingsPolling() {
  stopAdminRatingsPolling();
  adminRatingsPollInterval = setInterval(loadPendingRatingsForAdmin, 4000);
}

function stopAdminRatingsPolling() {
  if (adminRatingsPollInterval) {
    clearInterval(adminRatingsPollInterval);
    adminRatingsPollInterval = null;
  }
}

async function loadPendingRatingsForAdmin() {
  if (!adminPassword) { stopAdminRatingsPolling(); return; }
  try {
    const res = await fetch(`${API}/nurses/ratings/pending`, { headers: adminHeaders() });
    const ratings = await res.json();
    const snapshot = JSON.stringify(ratings);
    if (snapshot === lastPendingRatingsSnapshot) return; // ما تغيّر شي، صفر إعادة رسم
    lastPendingRatingsSnapshot = snapshot;

    const wrap = document.getElementById('pending-ratings-wrap');
    const list = document.getElementById('pending-ratings-list');
    const countEl = document.getElementById('pending-ratings-count');
    if (!wrap || !list) return;
    wrap.style.display = ratings.length === 0 ? 'none' : 'block';
    list.innerHTML = renderPendingRatingsCards(ratings);
    if (countEl) countEl.textContent = ratings.length;
  } catch (err) { /* تجاهل بصمت، رح يعيد المحاولة بالجولة الجاية */ }
}

// ---------- التقييمات المنشورة (حذف تعليق مسيء حتى بعد نشره) ----------

let approvedRatingsLoaded = false;

async function toggleApprovedRatingsAdmin() {
  const container = document.getElementById('approved-ratings-list');
  const btn = document.getElementById('toggle-approved-ratings-btn');
  if (container.style.display === 'none') {
    container.style.display = 'block';
    btn.textContent = 'إخفاء التقييمات';
    if (!approvedRatingsLoaded) await loadApprovedRatingsAdmin();
  } else {
    container.style.display = 'none';
    btn.textContent = 'عرض التقييمات';
  }
}

async function loadApprovedRatingsAdmin() {
  const container = document.getElementById('approved-ratings-list');
  container.innerHTML = '<p class="muted">جاري التحميل...</p>';
  try {
    const res = await fetch(`${API}/nurses/ratings/approved`, { headers: adminHeaders() });
    const ratings = await res.json();
    approvedRatingsLoaded = true;
    if (ratings.length === 0) {
      container.innerHTML = '<p class="muted" style="margin:0;">لا توجد تقييمات منشورة بعد.</p>';
      return;
    }
    container.innerHTML = ratings.map(r => `
      <div class="order-card">
        <div class="order-card-top">
          <span class="order-patient-name">👤 ${escapeHtml(r.patient_name)} ← ${escapeHtml(r.nurse_name)}</span>
          <span class="order-new-badge">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span>
        </div>
        ${r.comment ? `<div class="order-items-list"><div class="order-item-line">💬 ${escapeHtml(r.comment)}</div></div>` : ''}
        <div class="order-actions-row">
          <button class="btn-outline red small" onclick="deleteApprovedRatingAdmin(${r.id})">🗑️ حذف نهائي</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p class="muted" style="margin:0;">تعذر تحميل التقييمات.</p>';
  }
}

async function deleteApprovedRatingAdmin(id) {
  const confirmed = await customConfirm('متأكد إنك بدك تحذف هذا التقييم نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.', 'warning');
  if (!confirmed) return;
  await fetch(`${API}/nurses/ratings/${id}`, { method: 'DELETE', headers: adminHeaders() });
  approvedRatingsLoaded = false;
  await loadApprovedRatingsAdmin();
}

document.addEventListener('click', (e) => {
  const box = document.getElementById('suggestions');
  const input = document.getElementById('search');
  if (box && !box.contains(e.target) && e.target !== input) {
    box.classList.remove('show');
    suggestionIndex = -1;
  }
  const bellPanel = document.getElementById('bell-panel');
  const bellBtn = document.getElementById('bell-btn');
  if (bellPanel && bellPanel.style.display !== 'none' && !bellPanel.contains(e.target) && !bellBtn.contains(e.target)) {
    bellPanel.style.display = 'none';
  }
});

showView('patient');
applyLanguage();
runSearch();
loadOnDuty();
updateCartCount();
setInterval(loadOnDuty, 5000);
updateBellVisibility();
updateBellBadge();
if (myOrders.length > 0) startMyOrdersPolling();
