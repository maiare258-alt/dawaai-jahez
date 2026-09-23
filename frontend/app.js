const API = '/api';
let currentPharmacy = null;
let adminPassword = null;
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
// التصنيف الحالي لصفحة البحث: 'medicine' (الرئيسية) أو 'cosmetic' (مستحضرات تجميل)
let currentCategory = 'medicine';
// فلتر المدينة بواجهة المريض. '' = كل المدن (السلوك الافتراضي، مطابق لما قبل الميزة).
// حالة واجهة فقط: لا تُحفظ ولا تؤثر على أي بيانات مخزّنة.
let currentCity = '';
// طلبات المريض المرسلة من هذا المتصفح (لتتبع رد الصيدلية عليها)
let myOrders = JSON.parse(localStorage.getItem('myOrders') || '[]');

// ---------- نظام تعدد اللغات (عربي/إنكليزي) — المرحلة 1: الصفحة الرئيسية ----------

let currentLang = localStorage.getItem('lang') || 'ar';

// المدن المدعومة — مراكز المحافظات السورية + سلمية.
// المفتاح هو ما يُخزَّن بقاعدة البيانات، والقيمة هي الاسم المعروض بكل لغة.
// ⚠️ يجب أن تبقى المفاتيح مطابقة تماماً لـALLOWED_CITIES في routes/pharmacies.js
const CITIES = {
  damascus:    { ar: 'دمشق',      en: 'Damascus' },
  rif_dimashq: { ar: 'ريف دمشق',  en: 'Rif Dimashq' },
  aleppo:      { ar: 'حلب',       en: 'Aleppo' },
  homs:        { ar: 'حمص',       en: 'Homs' },
  hama:        { ar: 'حماة',      en: 'Hama' },
  salamiyah:   { ar: 'سلمية',     en: 'Salamiyah' },
  latakia:     { ar: 'اللاذقية',  en: 'Latakia' },
  tartus:      { ar: 'طرطوس',     en: 'Tartus' },
  idlib:       { ar: 'إدلب',      en: 'Idlib' },
  deir_ez_zor: { ar: 'دير الزور', en: 'Deir ez-Zor' },
  hasakah:     { ar: 'الحسكة',    en: 'Al-Hasakah' },
  raqqa:       { ar: 'الرقة',     en: 'Raqqa' },
  daraa:       { ar: 'درعا',      en: 'Daraa' },
  suwayda:     { ar: 'السويداء',  en: 'As-Suwayda' },
  quneitra:    { ar: 'القنيطرة',  en: 'Quneitra' }
};

// اسم المدينة باللغة الحالية. المفتاح غير المعروف يُعاد كما هو بدل ما يختفي —
// أفضل من عرض فراغ لو أُضيفت مدينة بالخلفية ونُسيت ترجمتها هنا.
// يستدعيها عنصر <select> بالهيرو. إعادة البحث فوراً لو كان المستخدم كاتباً شيئاً أصلاً.
function onCityFilterChange(el) {
  currentCity = el.value;
  const q = document.getElementById('search').value.trim();
  if (q) submitSearch();
}

// تعبئة قائمة المدن بالهيرو — تُستدعى عند الإقلاع وعند تبديل اللغة (لتترجم الأسماء)
function renderCityFilter() {
  const sel = document.getElementById('city-filter');
  if (!sel) return;
  sel.innerHTML = `<option value="">${t('all_cities')}</option>` + cityOptionsHtml(currentCity);
  sel.value = currentCity;
  sel.setAttribute('aria-label', t('filter_by_city_aria'));
  const lbl = document.getElementById('city-filter-label');
  if (lbl) lbl.textContent = `📍 ${t('city_label')}`;
}

// ---------- وقت آخر تحديث للمخزون ----------
// نعرض الوقت نسبياً ("قبل ساعتين") لا تاريخاً مطلقاً: المريض يريد أن يعرف
// هل المعلومة طازجة، لا متى حُدّثت بالضبط. والنسبي مفهوم فوراً بلا حساب ذهني.
//
// الحساب على جهاز المستخدم بمقارنة التوقيتين، فيصح مهما كانت منطقته الزمنية.
function relativeTime(iso) {
  if (!iso) return null;
  const then = new Date(iso);
  if (isNaN(then.getTime())) return null;
  const mins = Math.floor((Date.now() - then.getTime()) / 60000);
  // توقيت مستقبلي (انحراف ساعة الجهاز مثلاً) يُعامل كـ"قبل لحظات" بدل رقم سالب مربك
  if (mins < 2) return t('time_just_now');
  if (mins < 60) return tFormat('time_minutes', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return tFormat('time_hours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return tFormat('time_days', { n: days });
  const weeks = Math.floor(days / 7);
  if (weeks <= 4) return tFormat('time_weeks', { n: weeks });
  return t('time_long_ago');
}

// معلومة قديمة أخطر من غياب المعلومة: بعد 3 أيام ننبّه المريض بدل أن نتركه يثق برقم بائت
const STOCK_STALE_HOURS = 72;
function isStockStale(iso) {
  if (!iso) return true;
  const then = new Date(iso);
  if (isNaN(then.getTime())) return true;
  return (Date.now() - then.getTime()) > STOCK_STALE_HOURS * 3600000;
}

// سطر "آخر تحديث" ببطاقة نتيجة البحث. يُعرض فقط حين يكون للسجل وقت فعلي —
// السجلات القديمة (قبل إضافة العمود) لا نعرف وقتها، وادعاء وقت لم يحدث تضليل.
function stockFreshnessHtml(iso) {
  const rel = relativeTime(iso);
  if (!rel) return '';
  const stale = isStockStale(iso);
  return `<div class="stock-freshness${stale ? ' stale' : ''}">
    <span class="result-icon">${stale ? '⚠️' : '🕒'}</span> ${t('stock_updated_prefix')} ${escapeHtml(rel)}
    ${stale ? `<div class="stock-stale-note">${t('stock_stale_warning')}</div>` : ''}
  </div>`;
}

// شارة التوثيق. تُعرض فقط لمن verified = true فعلاً، فتبقى معلومة حقيقية لا زينة.
function verifiedBadgeHtml(isVerified) {
  if (!isVerified) return '';
  return `<span class="verified-badge" title="${t('verified_badge_title')}">✓ ${t('verified_badge')}</span>`;
}

function cityName(key) {
  if (!key) return '';
  return (CITIES[key] && CITIES[key][currentLang]) || key;
}

// خيارات <option> لقائمة المدن، مرتبة أبجدياً حسب اللغة المعروضة
function cityOptionsHtml(selected) {
  return Object.keys(CITIES)
    .map(k => ({ k, label: cityName(k) }))
    .sort((a, b) => a.label.localeCompare(b.label, currentLang === 'ar' ? 'ar' : 'en'))
    .map(c => `<option value="${c.k}"${c.k === selected ? ' selected' : ''}>${escapeHtml(c.label)}</option>`)
    .join('');
}

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
    about_desc: 'دوائي جاهز منصة سورية محلية انطلقت من مدينة سلمية، هدفها مساعدتك على معرفة توفر دوائك في الصيدليات القريبة فوراً، بدل التنقل من صيدلية لصيدلية بحثاً عن دواء قد لا يكون متوفراً.',
    footer_home: 'الرئيسية', footer_onduty: 'الصيدليات المناوبة', footer_contact: 'تواصل معنا',
    footer_center: 'منصة سورية للبحث عن توفر الأدوية في الصيدليات.',
    footer_copy: '© دوائي جاهز، جميع الحقوق محفوظة',
    cart_empty_title: 'عربة المشتريات فارغة', cart_empty_subtitle: 'ابدأ بإضافة الأدوية من نتائج البحث.',
    lang_toggle: 'English', brand_name: 'دوائي جاهز',
    not_found_title_medicine: 'لم يتم العثور على الدواء', not_found_title_cosmetic: 'لم يتم العثور على المستحضر',
    not_found_subtitle: 'يمكنك تجربة اسم آخر، أو البحث بالمادة الفعالة.',
    did_you_mean_results: 'هل تقصد أحد هذه النتائج؟',
    suggest_did_you_mean: 'هل تقصد', q_mark: '؟',
    available_badge: '🟢 متوفر', unavailable_badge: '🔴 غير متوفر',
    active_ingredient_label: 'المادة الفعالة:', add_to_cart_btn: 'إضافة إلى السلة', added_feedback: '✓ تمت الإضافة',
    alt_unavailable_but: 'غير متوفر حالياً، غير أنّ هناك بديلاً بالمادة الفعالة نفسها', alt_view_btn: 'عرض',
    server_error_title: 'تعذر الاتصال بالخادم', server_error_subtitle: 'تحقق من اتصالك بالإنترنت وحاول مرة أخرى.',
    cart_panel_title: 'عربة المشتريات', cart_panel_subtitle: 'راجع الأدوية قبل إتمام الطلب.',
    cart_items_count_label: 'عدد الأدوية', checkout_name_placeholder: 'الاسم الكامل',
    checkout_phone_placeholder: 'رقم الهاتف', checkout_notes_placeholder: 'ملاحظات إضافية (اختياري)', checkout_btn: 'إتمام الطلب', remove_aria: 'حذف',
    checkout_missing_fields: 'الرجاء إدخال الاسم ورقم الهاتف لإتمام الطلب.',
    order_success_msg: 'أُرسل طلبك بنجاح. ستتواصل معك الصيدلية قريباً على الرقم الذي أدخلته.',
    modal_ok: 'حسناً', modal_cancel: 'إلغاء', modal_yes: 'نعم',
    onduty_title: '🟢 الصيدليات المناوبة اليوم', onduty_now_badge: '🟢 مناوبة الآن',
    onduty_empty_title: 'لا توجد صيدليات مناوبة حالياً',
    onduty_empty_subtitle: 'يمكنك المحاولة لاحقاً، أو التواصل مباشرة مع الصيدلية التي تفضّلها.',
    bell_empty: 'ما في إشعارات حالياً', bell_aria_label: 'إشعارات الطلبات', bell_dismiss_aria: 'إخفاء', bell_clear_all: '🗑️ مسح الكل',
    bell_confirmed_text: 'تم الاستجابة لطلبك من قبل الصيدلية',
    bell_pending_prefix: 'طلبك عند صيدلية', bell_pending_suffix: 'قيد المراجعة...',
    excess_quantity_confirm: 'أضفت {qty} من {name} من {pharmacy} إلى عربتك. هل ترغب في إضافة المزيد؟',
    pharm_login_title: 'دخول الصيدلي',
    pharm_login_no_account: 'إن لم يكن لديك حساب بعد، فتواصل مع فريق دوائي جاهز لتسجيل صيدليتك.',
    username_placeholder: 'اسم المستخدم', password_placeholder: 'كلمة المرور', login_btn: 'دخول',
    pharm_dashboard_title: 'لوحة الصيدلي', pharmacy_label_prefix: 'صيدلية:', logout_btn: '🚪 تسجيل الخروج',
    new_orders_title: '🛎️ طلبات جديدة من المرضى',
    duty_status_title: '🕐 حالة المناوبة', duty_checkbox_label: 'صيدليتي مناوبة اليوم',
    save_duty_btn: 'حفظ حالة المناوبة',
    duty_hours_title: '⏱️ تحديد ساعات المناوبة (اختياري)',
    duty_hours_desc: 'حدِّد التوقيت ليظهر إلى جانب يوم المناوبة.',
    duty_start_label: 'من الساعة', duty_end_label: 'إلى الساعة',
    add_med_title: '💊 إضافة دواء غير موجود بالقائمة',
    add_med_desc: 'إن كان لديك دواء في مخزون صيدليتك ولا يظهر ضمن القائمة، فيمكنك إضافته عبر الحقول أدناه.',
    med_name_placeholder: 'اسم الدواء', med_name_placeholder_cosmetic: 'اسم المستحضر',
    generic_name_placeholder: 'المادة الفعالة (اختياري)', alt_names_placeholder: 'أسماء بديلة، افصل بينها بفاصلة (اختياري)',
    cat_medicine: 'دواء', cat_cosmetic: 'مستحضر تجميل', add_med_btn: 'إضافة الدواء',
    stock_table_medicine: 'الدواء', stock_table_status: 'الحالة', delete_account_btn: '🗑️ حذف حسابي نهائياً',
    manufacture_date_label: 'تاريخ الصنع', expiry_date_label: 'تاريخ الانتهاء', save_dates_btn: 'حفظ التواريخ',
    edit_dates_aria: 'تعديل تاريخي الصنع والانتهاء', expiry_expired_badge: 'منتهية الصلاحية', expiry_soon_badge: 'صلاحية الدواء شارفت على الانتهاء',
    day_sunday: 'الأحد', day_monday: 'الاثنين', day_tuesday: 'الثلاثاء', day_wednesday: 'الأربعاء',
    day_thursday: 'الخميس', day_friday: 'الجمعة', day_saturday: 'السبت',
    shift_allday: 'طوال اليوم', shift_morning: 'صباحاً فقط', shift_evening: 'مساءً فقط',
    stat_total_meds: 'عدد الأدوية', stat_available_meds: 'أدوية متوفرة', stat_unavailable_meds: 'غير المتوفرة',
    stat_cosmetics_short: 'مستحضرات', stat_onduty_today: 'المناوبة اليوم', yes_word: 'نعم', no_word: 'لا',
    med_name_required: 'اسم الدواء مطلوب', med_added_success: 'أُضيف الدواء بنجاح. فعّل حالة توفره من القائمة أدناه.',
    duty_saved_success: 'تم حفظ حالة المناوبة بنجاح',
    assistant_phone_title: '📱 رقم صيدلي مساعد (اختياري)', assistant_phone_desc: 'رقم تواصل إضافي يظهر للمرضى إلى جانب رقمك الأساسي، ويفيد عند ازدحام العمل.',
    assistant_phone_input_placeholder: 'رقم الهاتف المساعد', save_assistant_phone_btn: 'حفظ الرقم المساعد',
    assistant_phone_saved_success: 'تم حفظ الرقم المساعد بنجاح', assistant_phone_label: 'مساعد',
    order_new_badge: '🆕 جديد', order_confirmed_badge: '✅ تم الحجز',
    order_dismiss_btn: 'تم الاطلاع', order_confirm_btn: '✅ تأكيد الحجز', order_delete_btn: '🗑️ حذف الطلب',
    order_delete_confirm: 'هل أنجزت هذا الطلب وترغب في حذفه نهائياً؟',
    delete_account_confirm: 'هل ترغب في حذف حسابك نهائياً؟ لا يمكن التراجع عن هذا الإجراء.',
    account_deleted_success: 'تم حذف حسابك بنجاح',
    admin_dashboard_title: 'لوحة الإدارة', admin_password_placeholder: 'كلمة مرور الإدارة', wrong_password: 'كلمة المرور غير صحيحة',
    stat_pharmacies_count: 'عدد الصيدليات', stat_onduty_pharmacies: 'الصيدليات المناوبة اليوم',
    add_pharmacy_title: '🏥 إضافة صيدلية جديدة', pharmacy_name_placeholder: 'اسم الصيدلية',
    address_placeholder: 'العنوان', phone_placeholder: 'رقم الهاتف', add_pharmacy_btn: 'إضافة الصيدلية',
    registered_pharmacies_title: 'الصيدليات المسجّلة', no_pharmacies_yet: 'لا يوجد صيدليات مسجّلة بعد.',
    pharmacies_table_header: 'الصيدلية', action_col_header: 'إجراء', delete_btn: 'حذف', onduty_badge_short: '🟢 مناوبة',
    delete_pharmacy_confirm: 'هل ترغب في حذف صيدلية "{name}" نهائياً؟', pharmacy_added_success: 'تمت إضافة صيدلية "{name}" بنجاح',
    edit_name_btn: 'تعديل الاسم', save_name_btn: 'حفظ', cancel_edit_btn: 'إلغاء',
    edit_name_aria: 'تعديل اسم الصيدلية',
    change_password_title: '🔑 تغيير كلمة المرور',
    change_password_desc: 'يمكنك تغيير كلمة المرور في أي وقت، وستحتاج إلى كلمتك الحالية للتأكيد.',
    current_password_placeholder: 'كلمة المرور الحالية',
    new_password_placeholder: 'كلمة المرور الجديدة',
    confirm_new_password_placeholder: 'تأكيد كلمة المرور الجديدة',
    change_password_btn: 'تغيير كلمة المرور',
    password_changed_success: 'تم تغيير كلمة المرور بنجاح',
    passwords_not_matching: 'كلمتا المرور الجديدتان غير متطابقتين',
    new_password_required_error: 'كلمة المرور الجديدة مطلوبة',
    new_password_too_short_error: 'كلمة المرور الجديدة قصيرة جداً، والحد الأدنى ثمانية محارف',
    new_password_same_error: 'كلمة المرور الجديدة مطابقة للحالية',
    reset_password_btn: 'إعادة تعيين كلمة المرور', reset_password_btn_short: '🔑 كلمة المرور',
    reset_password_confirm: 'هل ترغب في إعادة تعيين كلمة مرور "{name}"؟ ستُولَّد كلمة جديدة، ولن يتمكن الصيدلي من الدخول بالقديمة. ولن يتأثر المخزون ولا الطلبات.',
    reset_password_done_title: 'كلمة المرور الجديدة لـ"{name}"',
    reset_password_done_hint: 'انسخ كلمة المرور الآن وسلّمها إلى الصيدلي، فلن تظهر مرة أخرى.',
    reset_password_error: 'تعذّرت إعادة تعيين كلمة المرور',
    copy_btn: 'نسخ', copied_msg: 'تم النسخ',
    stats_title: '📊 نظرة عامة على المنصة', stats_load_error: 'تعذّر جلب الإحصاءات',
    stat_pharmacies: 'صيدلية مسجّلة', stat_on_duty: 'مناوبة الآن',
    stat_medicines: 'دواء بالقائمة العامة', stat_cosmetics: 'مستحضر تجميل',
    stat_nurses: 'ممرض', stat_available_stock: 'دواء متوفر بالصيدليات',
    stat_orders_total: 'إجمالي الطلبات', stat_orders_24h: 'طلب آخر ٢٤ ساعة',
    stat_orders_7d: 'طلب آخر ٧ أيام', stat_orders_30d: 'طلب آخر ٣٠ يوماً',
    stats_top_medicines: 'أكثر الأدوية طلباً', stats_top_pharmacies: 'أنشط الصيدليات',
    stats_by_city: 'الصيدليات حسب المدينة',
    stats_orders_count_unit: 'طلب', stats_times_unit: 'مرة', stats_pharmacy_unit: 'صيدلية',
    stats_no_orders_yet: 'لا توجد طلبات بعد، ستظهر هنا فور وصول أول طلب.',
    stats_refresh_btn: 'تحديث',
    page_title: 'دوائي جاهز | ابحث عن توفر الدواء في صيدليات سلمية وسوريا',
    page_description: 'ابحث عن توفر الدواء في الصيدليات القريبة منك في سلمية وسوريا لحظياً، واعرف الصيدليات المناوبة الليلة، واطلب دواءك مباشرة من الصيدلية. منصة سورية مجانية.',
    refresh_results_btn: '↻ تحديث النتائج', refreshing_results: '⏳ جارٍ التحديث...',
    verified_badge: 'موثَّقة', verified_badge_title: 'صيدلية سجّلتها إدارة المنصة بعد التحقق من بياناتها',
    stock_updated_prefix: 'آخر تحديث للمخزون:',
    time_just_now: 'قبل لحظات', time_minutes: 'قبل {n} دقيقة', time_hours: 'قبل {n} ساعة',
    time_days: 'قبل {n} يوم', time_weeks: 'قبل {n} أسبوع', time_long_ago: 'منذ أكثر من شهر',
    stock_never_updated: 'لم يُحدَّث بعد',
    stock_stale_warning: 'قد لا تكون هذه المعلومة محدَّثة، ويُنصح بالاتصال بالصيدلية للتأكد',
    city_placeholder: 'المدينة', city_label: 'المدينة', all_cities: 'كل المدن',
    filter_by_city_aria: 'تصفية النتائج حسب المدينة',
    city_required_error: 'المدينة مطلوبة', invalid_city_error: 'مدينة غير صالحة',
    pharmacy_name_required: 'اسم الصيدلية مطلوب',
    duplicate_pharmacy_name_confirm: 'يوجد اسم مطابق مسبقاً: "{name}" (اسم المستخدم: {username}). هل ترغب في المتابعة؟',
    pharmacy_name_updated: 'تم تحديث اسم الصيدلية إلى "{name}"',
    pharmacy_name_update_error: 'تعذّر تعديل اسم الصيدلية. حاول مرة أخرى.',
    add_medicine_title_admin: '💊 إضافة دواء جديد', registered_medicines_title: 'الأدوية المسجّلة',
    item_added_success: 'تمت إضافة "{name}" بنجاح', delete_medicine_confirm: 'هل ترغب في حذف دواء "{name}" نهائياً؟',
    add_nurse_title: '🩺 إضافة ممرض جديد', nurse_name_placeholder: 'اسم الممرض', specialty_placeholder: 'التخصص',
    university_placeholder: 'الجامعة', grad_year_placeholder: 'سنة التخرج', upload_cert_btn: '📄 رفع شهادة (PDF/Word)',
    add_nurse_btn: 'إضافة الممرض', registered_nurses_title: 'الممرضون المسجّلون', no_nurses_yet: 'لا يوجد ممرضون مسجّلون بعد.',
    nurses_table_header: 'الممرض', actions_header_plural: 'إجراءات',
    nurse_available_short: '🟢 متاح', nurse_unavailable_short: '🔴 غير متاح',
    delete_nurse_confirm: 'هل ترغب في حذف الممرض "{name}" نهائياً؟',
    pending_ratings_title: '⭐ تقييمات قيد المراجعة', approve_btn: '✅ موافقة', reject_btn: '🗑️ رفض',
    reject_rating_confirm: 'هل ترغب في رفض هذا التقييم؟ سيُحذف نهائياً.',
    published_ratings_title: '💬 التقييمات المنشورة', show_ratings_btn: 'عرض التقييمات', hide_ratings_btn: 'إخفاء التقييمات',
    loading_text: 'جاري التحميل...', no_published_ratings: 'لا توجد تقييمات منشورة بعد.',
    delete_final_btn: '🗑️ حذف نهائي', failed_load_ratings: 'تعذر تحميل التقييمات.',
    delete_rating_final_confirm: 'هل ترغب في حذف هذا التقييم نهائياً؟ لا يمكن التراجع عن هذا الإجراء.',
    upload_cert_coming_soon: 'سيُفعَّل رفع الشهادات (PDF/Word) بعد توفير استضافة دائمة للملفات 📄',
    nursing_empty_title: 'لا يوجد ممرضون مسجّلون حالياً', nursing_empty_subtitle: 'سوف يتم إضافة ممرضين موثوقين قريباً.',
    nurse_available_full: '🟢 متاح للعمل', nurse_unavailable_full: '🔴 غير متاح حالياً',
    general_nurse_label: 'ممرض عام', rating_summary_suffix: 'من {count} تقييم',
    no_ratings_yet_short: 'لا توجد تقييمات بعد', view_profile_btn: 'لمحة عنه',
    grad_year_label: 'تخرج', patient_reviews_title: 'آراء المرضى ({count})',
    no_published_reviews: 'لا توجد آراء منشورة بعد.', rate_this_nurse_title: 'قيّم هذا الممرض',
    already_rated_msg: 'شكراً لك، فقد أُرسل تقييمك مسبقاً وهو الآن قيد مراجعة الإدارة.',
    comment_placeholder: 'اكتب رأيك (اختياري)', your_name_placeholder: 'اسمك', your_phone_placeholder: 'رقم هاتفك',
    submit_rating_btn: 'إرسال التقييم',
    star_rate_one: 'قيّم نجمة واحدة من 5', star_rate_two: 'قيّم نجمتين من 5', star_rate_n: 'قيّم {n} نجوم من 5',
    select_stars_first: 'الرجاء اختيار عدد النجوم أولاً', name_phone_required: 'الاسم ورقم الهاتف مطلوبان',
    rating_submitted_success: 'أُرسل تقييمك بنجاح. سيظهر للعموم بعد موافقة الإدارة عليه.',
    nursing_page_title: 'خدمات تمريض 🩺', nursing_page_desc: 'تواصل مع ممرضين موثوقين لتلقّي الرعاية التمريضية في منزلك.',
    show_password_aria: 'إظهار كلمة المرور', hide_password_aria: 'إخفاء كلمة المرور',
    invalid_value_error: 'قيمة غير صالحة',
    admin_duty_title: '🕐 جدول المناوبة',
    admin_duty_desc: 'يمكنك من هنا ضبط مناوبة أي صيدلية دون الحاجة إلى تسجيل الدخول بحسابها، كما يستطيع الصيدلي تعديل مناوبته بنفسه.',
    admin_duty_clear_all: 'إيقاف كل المناوبات',
    admin_duty_clear_confirm: 'هل ترغب في إيقاف مناوبة جميع الصيدليات ({n} صيدلية مناوبة حالياً)؟ يُستخدم هذا الإجراء عادةً عند بدء أسبوع جديد.',
    admin_duty_cleared: 'تم إيقاف {n} مناوبة',
    admin_duty_none_active: 'لا توجد صيدليات مناوبة حالياً',
    admin_duty_on: 'مناوبة',
    admin_duty_off: 'غير مناوبة',
    admin_duty_save: 'حفظ',
    admin_duty_saved: 'تم حفظ المناوبة',
    admin_duty_by_pharmacy: 'عدّلها الصيدلي',
    admin_duty_by_admin: 'عدّلتها الإدارة',
    admin_duty_never: 'لم تُعدَّل بعد',
    admin_duty_search: 'ابحث باسم الصيدلية...',
    admin_duty_no_match: 'لا توجد صيدلية بهذا الاسم',
    admin_duty_active_count: 'مناوبة الآن: {n}',
    stock_unmanaged_badge: 'لم تُسجّل مخزونها',
    stock_unmanaged_note: 'هذه الصيدلية مُدرجة ضمن جدول المناوبة فحسب، ولا تُحدِّث مخزونها على المنصة. يُرجى الاتصال بها للاستفسار عن الدواء.',
    manages_stock_on: 'تُحدّث مخزونها',
    manages_stock_off: 'مناوبة فقط',
    manages_stock_toggle_on: 'تفعيل المخزون',
    manages_stock_toggle_off: 'إيقاف المخزون',
    manages_stock_confirm_on: 'هل ترغب في تفعيل إدارة المخزون لصيدلية "{name}"؟ ستظهر عندئذٍ حالات توفر أدويتها للمرضى في نتائج البحث.',
    manages_stock_confirm_off: 'هل ترغب في إيقاف إدارة المخزون لصيدلية "{name}"؟ ستبقى مُدرجة في جدول المناوبة، ولن تُعرض حالات التوفر، بل ملاحظة تفيد بأنها لم تُسجّل مخزونها.',
    manages_stock_updated: 'تم تحديث حالة الصيدلية',
    name_too_long_error: 'الاسم طويل جداً',
    notes_too_long_error: 'الملاحظات طويلة جداً',
    too_many_items_error: 'عدد الأدوية في الطلب كبير جداً',
    invalid_order_error: 'بيانات الطلب غير صالحة',
    comment_too_long_error: 'التعليق طويل جداً',
    open_now_badge: 'مفتوحة الآن',
    closed_now_badge: 'مغلقة الآن',
    closed_opens_at: 'مغلقة الآن، وتفتح الساعة {time}',
    closed_today_badge: 'مغلقة اليوم',
    cart_closed_btn: 'الصيدلية مغلقة، أرسل الطلب',
    cart_closed_notice: 'الصيدلية مغلقة الآن. سيصلك الرد بعد فتحها الساعة {time}.',
    cart_closed_notice_today: 'الصيدلية مغلقة اليوم. سيصلك الرد بعد فتحها.',
    hours_section_title: '🕒 ساعات دوام الصيدلية',
    hours_section_desc: 'حدِّد ساعات الدوام مرة واحدة، لتُحسب حالة الفتح والإغلاق تلقائياً كل يوم. يمنع هذا وصول طلبات في ساعات متأخرة دون أن يعرف المريض أنك مغلق.',
    hours_opens_label: 'وقت الفتح',
    hours_closes_label: 'وقت الإغلاق',
    hours_save: 'حفظ ساعات الدوام',
    hours_clear: 'مسح الساعات',
    hours_saved: 'حُفظت ساعات الدوام بنجاح',
    hours_cleared: 'مُسحت ساعات الدوام',
    hours_none: 'لم تُحدَّد ساعات الدوام بعد',
    hours_current: 'الدوام الحالي:',
    hours_to: 'حتى',
    hours_overnight_note: 'دوام ممتد بعد منتصف الليل',
    hours_both_required: 'يلزم تحديد وقتي الفتح والإغلاق معاً',
    hours_same_time: 'وقت الفتح مطابق لوقت الإغلاق',
    invalid_time_error: 'وقت غير صالح. استخدم الصيغة ساعة:دقيقة مثل 08:30',
    closed_today_title: 'إغلاق استثنائي لليوم',
    closed_today_desc: 'يُستخدم عند الإغلاق لظرف طارئ أو عطلة. يعود الدوام إلى جدوله المعتاد تلقائياً غداً.',
    closed_today_on: 'إعلان الإغلاق اليوم',
    closed_today_off: 'التراجع عن الإغلاق',
    closed_today_active: 'صيدليتك معلنة مغلقة اليوم.',
    closed_today_saved: 'أُعلن إغلاق الصيدلية اليوم',
    closed_today_removed: 'عاد الدوام إلى جدوله المعتاد',
    duty_overrides_hours: 'صيدليتك مناوبة، لذا تظهر مفتوحة بصرف النظر عن ساعات الدوام.',
    a11y_duty_day: 'يوم المناوبة',
    a11y_duty_shift: 'وردية المناوبة',
    a11y_med_category: 'تصنيف المنتج',
    err_offline: 'لا يوجد اتصال بالإنترنت. تحقق من الشبكة ثم أعد المحاولة.',
    err_timeout_search: 'استغرق الخادم وقتاً أطول من المعتاد. أعد المحاولة بعد قليل.',
    err_timeout_order: 'لم يصل رد الخادم في الوقت المحدد. يمكنك إعادة الإرسال بأمان، فلن يتكرر طلبك.',
    err_network: 'تعذّر الوصول إلى الخادم. تحقق من اتصالك وأعد المحاولة.',
    err_network_order: 'تعذّر إتمام الإرسال. يمكنك إعادة الإرسال بأمان، فلن يتكرر طلبك.',
    err_server: 'حدث خلل في الخادم. أعد المحاولة بعد قليل.',
    offline_banner: 'لا يوجد اتصال بالإنترنت',
    sending_order: 'جارٍ إرسال الطلب...',
    rate_limited_error: 'محاولات كثيرة جداً. حاول بعد قليل.',
    backup_title: '💾 النسخ الاحتياطي وحالة النظام',
    backup_desc: 'خطة الاستضافة المجانية لا توفر نسخاً احتياطياً تلقائياً. نزِّل نسخة دورياً واحفظها في مكان آمن.',
    backup_btn: 'تنزيل نسخة احتياطية',
    backup_preparing: 'جارٍ التحضير...',
    backup_done: 'نُزّلت النسخة الاحتياطية بنجاح',
    backup_failed: 'تعذّر إنشاء النسخة الاحتياطية',
    backup_warning: 'الملف حساس: يتضمن بيانات الحسابات والطلبات. احفظه في مكان آمن ولا تشاركه.',
    backup_last: 'آخر نسخة نزَّلتها من هذا المتصفح:',
    backup_never: 'لم تُنزَّل أي نسخة من هذا المتصفح بعد',
    backup_overdue: 'مضى أكثر من أسبوع على آخر نسخة.',
    system_status_title: 'حالة النظام',
    system_status_ok: 'يعمل بصورة سليمة',
    system_status_degraded: 'قاعدة البيانات لا تستجيب',
    system_status_checking: 'جارٍ الفحص...',
    admin_username_title: '👤 تعديل أسماء المستخدمين',
    admin_username_desc: 'اسم المستخدم هو ما يدخل به الصيدلي إلى لوحته. لا يؤثر تعديله على كلمة المرور ولا المخزون ولا الطلبات ولا المناوبة.',
    admin_username_search: 'ابحث باسم الصيدلية أو اسم المستخدم',
    admin_username_no_match: 'لا توجد صيدلية مطابقة',
    admin_username_current: 'اسم المستخدم الحالي:',
    admin_username_new_placeholder: 'اسم المستخدم الجديد',
    admin_username_save: 'حفظ',
    admin_username_saved: 'عُدِّل اسم المستخدم بنجاح',
    admin_username_confirm: 'هل ترغب في تعديل اسم المستخدم لصيدلية "{name}" من "{old}" إلى "{new}"؟ سيدخل الصيدلي بالاسم الجديد، ولن تتغير كلمة مروره.',
    admin_username_required: 'اسم المستخدم مطلوب',
    admin_username_no_spaces: 'اسم المستخدم لا يقبل المسافات',
    admin_username_too_short: 'اسم المستخدم قصير جداً، والحد الأدنى ثلاثة محارف',
    admin_username_taken: 'اسم المستخدم مستخدم مسبقاً',
    register_listing_type_title: 'نوع الإدراج',
    register_type_full_label: 'صيدلية كاملة',
    register_type_full_desc: 'تدير مخزونها على المنصة، فتظهر حالات توفر أدويتها للمرضى في نتائج البحث.',
    register_type_duty_label: 'مناوبة فقط',
    register_type_duty_desc: 'تظهر في جدول المناوبة دون عرض حالات توفر الأدوية. يمكن تغيير النوع لاحقاً في أي وقت.',
    directions_btn: 'الاتجاهات',
    directions_btn_title: 'افتح الاتجاهات إلى الصيدلية في خرائط جوجل',
    location_section_title: '📍 موقع الصيدلية على الخريطة',
    location_section_desc: 'يكفي تحديد موقع الصيدلية مرة واحدة، ليظهر للمريض زرٌّ يفتح له مسار الوصول إليها في خرائط جوجل.',
    detect_location_btn: '📍 تحديد موقعي الحالي',
    detecting_location: '⏳ جارٍ تحديد الموقع...',
    location_paste_placeholder: 'أو الصق الإحداثيات هنا: 35.011667, 37.053056',
    location_paste_hint: 'من خرائط جوجل: اضغط مطوّلاً على موقع الصيدلية، ثم انسخ السطر الذي يتضمن الحرفين N و E (مثل 35°00\'57.8"N 37°03\'25.3"E) والصقه هنا، فهذه الصيغة لا يقع فيها لبس.',
    save_location_btn: 'حفظ الموقع',
    clear_location_btn: 'مسح الموقع',
    location_saved_success: 'تم حفظ موقع الصيدلية بنجاح',
    location_cleared_success: 'تم مسح موقع الصيدلية',
    location_current_label: 'الموقع المحفوظ حالياً:',
    location_preview_btn: 'معاينة على الخريطة',
    location_none: 'لم يُحدَّد الموقع بعد',
    invalid_location_error: 'الإحداثيات غير صالحة. يُرجى التحقق من الأرقام وإعادة المحاولة.',
    geo_unsupported: 'لا يدعم متصفحك تحديد الموقع. يمكنك إدخال الإحداثيات يدوياً بدلاً من ذلك.',
    geo_denied: 'رُفض إذن الوصول إلى الموقع. يمكنك تفعيله من إعدادات المتصفح، أو إدخال الإحداثيات يدوياً.',
    geo_unavailable: 'تعذّر تحديد الموقع. يُرجى التأكد من تفعيل خدمة تحديد المواقع (GPS) والمحاولة في مكان مكشوف.',
    geo_timeout: 'انقضت مهلة تحديد الموقع. يُرجى إعادة المحاولة.',
    geo_low_accuracy: 'دقة التحديد منخفضة (نحو {n} متر). يُنصح بإعادة المحاولة في مكان مكشوف، أو بالحفظ إن كان الموقع صحيحاً.',
    location_confirm_detected: 'حُدِّد موقعك بدقة تبلغ نحو {n} متر. هل تعتمده موقعاً للصيدلية؟',
    location_outside_syria: 'تقع هذه الإحداثيات خارج سوريا. يُرجى التأكد من عدم عكس الرقمين. هل ترغب في حفظها رغم ذلك؟',
    location_swap_suggest: 'يبدو أن الرقمين معكوسان. الموقع الصحيح على الأرجح: {coords}\n\nهل ترغب في اعتماده بهذه الصيغة؟',
    location_admin_label: 'موقع',
    wa_consult_btn_label: 'استشر صيدلياً',
    wa_consult_title: '💬 استشر صيدلياً عبر واتساب',
    wa_consult_desc: 'وصفة طبية غير واضحة، أو استفسار عن جرعة أو بديل دوائي؟ تواصل مباشرة مع أحد الصيادلة.',
    wa_consult_empty: 'لا توجد حتى الآن صيدليات مفعّلة على واتساب.',
    wa_consult_empty_city: 'لا توجد صيدليات مفعّلة على واتساب في هذه المدينة. يمكنك اختيار "كل المدن" لعرض الجميع.',
    wa_consult_loading: 'جارٍ تحميل الصيدليات...',
    wa_consult_error: 'تعذّر تحميل قائمة الصيدليات. يُرجى إعادة المحاولة.',
    wa_chat_btn: 'مراسلة عبر واتساب',
    wa_close_btn: 'إغلاق',
    wa_disclaimer: 'المنصة وسيط معلوماتي فحسب، والمحادثة تجري مباشرة بينك وبين الصيدلية، وهي لا تُغني عن استشارة الطبيب.',
    wa_result_btn: 'واتساب',
    wa_msg_consult: 'مرحباً، أود استشارتكم بخصوص دواء. وجدتكم عبر موقع دوائي جاهز.',
    wa_msg_medicine: 'مرحباً، أريد شراء دواء "{medicine}" من لديكم عبر الموقع.',
    wa_onduty_now: 'مناوبة الآن',
    whatsapp_phone_section_title: '💬 رقم واتساب الصيدلية',
    whatsapp_phone_input_placeholder: 'رقم واتساب (مثال: 0932985852)',
    save_whatsapp_btn: 'حفظ رقم واتساب',
    whatsapp_saved_success: 'تم حفظ رقم واتساب بنجاح',
    whatsapp_cleared_success: 'تم مسح رقم واتساب',
    invalid_whatsapp_error: 'رقم واتساب غير صالح. يُرجى إدخال رقم هاتف محمول سوري، مثل 0932985852',
    whatsapp_phone_hint: 'لن يظهر زر المراسلة للمرضى إلا إذا أدخلت رقماً. اترك الحقل فارغاً لإخفائه.',
    whatsapp_admin_label: 'واتساب',
    whatsapp_coming_soon: 'البحث عبر واتساب قيد التجهيز 💬 يجري حالياً إعداد رقم رسمي للمنصة.',
    contact_coming_soon: 'سيتم إضافة معلومات التواصل قريباً.',
    footer_faq: 'الأسئلة الشائعة', footer_about: 'حول الموقع',
    faq_title: 'الأسئلة الشائعة',
    faq_section_patient: 'للمرضى والزوار', faq_section_pharmacist: 'للصيادلة',
    faq_q1: 'ما هو موقع "دوائي جاهز"؟',
    faq_a1: 'منصة إلكترونية سورية تساعدك على معرفة مدى توفر دواء معيّن في الصيدليات القريبة منك، والتعرّف على الصيدليات المناوبة، والتواصل مع ممرضين لتقديم خدمات التمريض المنزلي.',
    faq_q2: 'كيف أبحث عن دواء؟',
    faq_a2: 'اكتب اسم الدواء أو المادة الفعالة في خانة البحث الموجودة في الصفحة الرئيسية، فتظهر لك جميع الصيدليات التي يتوفر لديها الدواء حالياً، مع عنوانها ورقم هاتفها.',
    faq_q3: 'هل المعلومات المعروضة محدّثة في كل لحظة؟',
    faq_a3: 'يقوم أصحاب الصيدليات بتحديث المعلومات بأنفسهم كلّما تغيّر مخزونهم. وننصحك دائماً بالتأكد من توفر الدواء مباشرة لدى الصيدلية قبل التوجّه إليها، لا سيما إن كنت بحاجة ماسّة إليه.',
    faq_q4: 'ما الفرق بين "متوفر" و"غير متوفر"؟',
    faq_a4: 'تعني كلمة "متوفر" أنّ الصيدلية قد أشارت إلى وجود هذا الدواء لديها حالياً في المخزون، بينما تعني "غير متوفر" أنها إمّا لا تملكه أصلاً، أو لم تحدّث حالته بعد.',
    faq_q5: 'كيف أعرف الصيدليات المناوبة اليوم؟',
    faq_a5: 'من خلال قائمة "الصيدليات المناوبة" في أعلى الصفحة، حيث تظهر جميع الصيدليات المناوبة حالياً، مع أوقات مناوبتها وأرقام التواصل معها.',
    faq_q6: 'هل يمكنني طلب الدواء وتوصيله لي من الصيدلية؟',
    faq_a6: 'يتيح لك الموقع إرسال طلب بأسماء الأدوية التي تحتاجها مباشرةً إلى الصيدلية، وهي التي تتواصل معك لتأكيد الطلب وتحديد طريقة الاستلام. أمّا الموقع نفسه فلا يبيع أي دواء ولا يتولّى توصيله.',
    faq_q7: 'هل خدمات التمريض المعروضة في الموقع مجانية؟',
    faq_a7: 'يقتصر دور الموقع على تعريفك بالممرضين المتاحين وبيانات التواصل معهم، وأي اتفاق على الخدمة وأجرتها يتمّ مباشرة بينك وبين الممرض.',
    faq_q8: 'كيف أسجّل صيدليتي في الموقع؟',
    faq_a8: 'يتم التسجيل حالياً من خلال التواصل مع فريق إدارة الموقع مباشرة، وبعد ذلك يُنشأ حساب خاص بصيدليتك يمكنك تسجيل الدخول إليه في أي وقت.',
    faq_q9: 'كيف أحدّث حالة توفر دواء معيّن في مخزوني؟',
    faq_a9: 'يوجد بجانب كل دواء في لوحة الصيدلي زر يبيّن حالته (متوفر أو غير متوفر)، وبضغطة واحدة يمكنك تبديل هذه الحالة فوراً.',
    faq_q10: 'كيف أضيف عدداً كبيراً من الأدوية دفعة واحدة؟',
    faq_a10: 'يوفّر لك الموقع خيار "استيراد ملف CSV" من لوحة الصيدلي. حمّل النموذج الفارغ أولاً، وستجد فيه أربعة أعمدة: اسم الدواء، والمادة الفعالة، والأسماء البديلة (يُفصل بينها بفاصلة منقوطة ";" إن وُجد أكثر من اسم)، والتصنيف (دواء أو مستحضر تجميل). املأ هذه الأعمدة لكل دواء في صف جديد، ثم احفظ الملف وارفعه من الصفحة نفسها. والحدّ الأقصى المسموح به لكل عملية استيراد هو خمسمئة دواء.',
    faq_q11: 'ماذا أفعل إن ظهرت الحروف العربية مشوّهة بعد حفظ ملف الـCSV؟',
    faq_a11: 'هذه مشكلة شائعة في برنامج إكسل. حاول حفظ الملف بصيغة "Unicode Text" بدلاً من صيغة "CSV" الاعتيادية، من نافذة "حفظ باسم" نفسها.',
    faq_q12: 'كيف أضيف رقم صيدلي مساعد؟',
    faq_a12: 'من لوحة الصيدلي، في قسم "رقم صيدلي مساعد"، أدخل الرقم ثم اضغط زر الحفظ. وسيظهر هذا الرقم للمريض إلى جانب رقمك الأساسي، وهو مفيد في أوقات ضغط العمل.',
    faq_q13: 'هل يمكنني تسجيل تاريخ صنع الدواء وتاريخ انتهائه؟',
    faq_a13: 'نعم، يوجد بجانب كل دواء في مخزونك زر تقويم صغير يفتح لك خانتين لتاريخ الصنع وتاريخ الانتهاء. وهذه المعلومة داخلية خاصة بك وحدك، ولا تظهر للمريض أبداً، وتساعد الموقع على تنبيهك عندما تقترب صلاحية أحد الأدوية من الانتهاء.',
    faq_q14: 'هل استخدام الموقع مجاني للصيدليات؟',
    faq_a14: 'نعم، استخدام الموقع مجاني بالكامل في الوقت الحالي.',
    about_title: 'حول الموقع',
    about_content_html: `
      <h3>عن دوائي جاهز</h3>
      <p>"دوائي جاهز" منصة إلكترونية سورية تُعنى بتيسير وصول المريض إلى المعلومة الصيدلانية التي يحتاج إليها في وقتها، من معرفة توفر دواء معيّن في الصيدليات القريبة، إلى التعرّف على الصيدليات المناوبة في أي لحظة، وصولاً إلى التواصل مع ممرضين موثوقين لتقديم خدمات التمريض المنزلي.</p>
      <p>نشأ هذا الموقع من حاجة حقيقية يعيشها كثير من الناس في سورية اليوم، تتمثّل في صعوبة معرفة أي صيدلية تملك الدواء المطلوب، وأي صيدلية مناوبة في ساعة متأخرة من الليل. وهدفنا الوحيد هو تقريب المسافة بين المريض والمعلومة، لا أكثر ولا أقل.</p>
      <h3>طبيعة المعلومات المعروضة</h3>
      <p>إنّ جميع المعلومات الظاهرة في الموقع، من توفر الأدوية وحالة المناوبة وبيانات الصيدليات والممرضين، يُدخلها ويحدّثها أصحاب الصيدليات والممرضون أنفسهم، كلّ فيما يخصّه. ولا يتحقق "دوائي جاهز" بنفسه من دقة هذه المعلومات في كل لحظة، ولا يضمن استمرار صحتها في كل وقت.</p>
      <p>لذلك، ننصح كلّ مستخدم بألّا يعتمد اعتماداً كاملاً على أي معلومة تخصّ توفر دواء أو حالة صيدلية، قبل التأكد منها مباشرة عبر التواصل مع الصيدلية المعنية. كما لا يُعد الموقع بديلاً عن استشارة الطبيب أو المختص الصحي عند الحاجة.</p>
      <h3>إخلاء المسؤولية</h3>
      <p>"دوائي جاهز" منصة وسيطة لعرض المعلومات فقط، وليست صيدلية، ولا جهة طبية، ولا جهة رقابية أو تنظيمية. فلا يقوم الموقع ببيع أي دواء أو صرفه، ولا يتدخّل في أي قرار طبي أو صيدلاني، وتبقى كل عملية صرف أو استشارة مسؤولية الصيدلية أو الكادر المختص وحده.</p>
      <p>وبناءً على ذلك، لا يتحمّل القائمون على هذا الموقع أي مسؤولية عن أي ضرر أو خطأ أو سوء فهم قد ينشأ عن استخدام المعلومات المعروضة فيه، سواء تعلّق الأمر بتوفر دواء، أو دقة بيانات صيدلية أو ممرض، أو أي تفاعل يحصل خارج نطاق الموقع بين مستخدميه.</p>
    `,
    invalid_credentials: 'بيانات الدخول غير صحيحة',
    expiry_before_manufacture_error: 'تاريخ الانتهاء لا يمكن أن يكون قبل تاريخ الصنع', invalid_date_format_error: 'صيغة التاريخ غير صالحة',
    order_submit_error: 'حدث خطأ أثناء إرسال الطلب. حاول مرة أخرى، أو تواصل مع الصيدلية مباشرة إذا استمرت المشكلة.',
    phone_digits_only_error: 'رقم الهاتف يجب أن يتكون من أرقام فقط',
    order_missing_fields_error: 'الاسم ورقم الهاتف والأدوية مطلوبة لإتمام الطلب',
    medicine_already_exists_error: 'هذا الدواء موجود مسبقاً في القائمة العامة',
    bulk_import_title: '📥 استيراد أدوية من ملف',
    bulk_import_desc: 'حمّل نموذج فارغ، انسخ فيه بيانات أدوية الشركه، ثم ارفعه هنا لإضافتها دفعة وحدة إلى مخزونك في الصيدليه.',
    bulk_import_hint_alt_format: 'إذا طلعت الحروف العربية مشوّهة بعد الحفظ CSV، جرّب تحفظ الملف بصيغة "Unicode Text" بدلها من نفس نافذة الحفظ بإكسل.',
    download_template_btn: '⬇️ تحميل نموذج فارغ (CSV)',
    choose_file_btn: 'اختيار ملف CSV',
    no_file_chosen: 'ما في ملف مختار',
    bulk_import_preview_title: 'معاينة قبل الاستيراد',
    bulk_import_valid_count: '{count} دواء جاهز للاستيراد',
    bulk_import_invalid_count: '{count} صف فيه مشكلة (رح يتجاهل)',
    bulk_import_confirm_btn: 'تأكيد الاستيراد',
    bulk_import_cancel_btn: 'إلغاء',
    bulk_import_empty_name_issue: 'اسم الدواء مفقود',
    bulk_import_invalid_category_issue: 'تصنيف غير معروف (استخدم دواء أو مستحضر تجميل)',
    bulk_import_parse_error: 'تعذّر قراءة الملف. تأكد إنه بصيغة CSV وبنفس تنسيق النموذج.',
    bulk_import_no_valid_rows: 'ما في أي صف صالح للاستيراد بالملف.',
    bulk_import_success: 'تم الاستيراد: {added} دواء جديد، {linked} مربوط بمخزونك، {skipped} تم تجاهله.',
    bulk_import_col_name: 'الاسم', bulk_import_col_generic: 'المادة الفعالة',
    bulk_import_col_alt: 'أسماء بديلة', bulk_import_col_category: 'التصنيف', bulk_import_col_issue: 'ملاحظة'
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
    about_desc: 'Dawaai Jahez is a local Syrian platform launched in Salamiyah, aiming to help you instantly know your medicine availability at nearby pharmacies, instead of going from pharmacy to pharmacy looking for a medicine that might not be available.',
    footer_home: 'Home', footer_onduty: 'On-Duty Pharmacies', footer_contact: 'Contact Us',
    footer_center: 'A Syrian platform for medicine availability search at pharmacies.',
    footer_copy: '© Dawaai Jahez — All rights reserved',
    cart_empty_title: 'Your cart is empty', cart_empty_subtitle: 'Start adding medicines from the search results.',
    lang_toggle: 'عربي', brand_name: 'Dawaai Jahez',
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
    checkout_phone_placeholder: 'Phone number', checkout_notes_placeholder: 'Additional notes (optional)', checkout_btn: 'Checkout', remove_aria: 'Remove',
    checkout_missing_fields: 'Please enter your name and phone number to complete the order.',
    order_success_msg: 'Your order has been sent successfully! The pharmacy will contact you soon on the number you entered.',
    modal_ok: 'OK', modal_cancel: 'Cancel', modal_yes: 'Yes',
    onduty_title: '🟢 Pharmacies on duty today', onduty_now_badge: '🟢 On duty now',
    onduty_empty_title: 'No pharmacies on duty right now',
    onduty_empty_subtitle: 'Check back later, or contact your usual pharmacy directly.',
    bell_empty: 'No notifications yet', bell_aria_label: 'Order notifications', bell_dismiss_aria: 'Dismiss', bell_clear_all: '🗑️ Clear all',
    bell_confirmed_text: 'Your order was confirmed by the pharmacy',
    bell_pending_prefix: 'Your order at', bell_pending_suffix: 'is under review...',
    excess_quantity_confirm: "You've added {qty} of {name} from {pharmacy} to your cart. Add more?",
    pharm_login_title: 'Pharmacist Login',
    pharm_login_no_account: "If you don't have an account yet, contact the Dawaai Jahez team to register your pharmacy.",
    username_placeholder: 'Username', password_placeholder: 'Password', login_btn: 'Login',
    pharm_dashboard_title: 'Pharmacist Panel', pharmacy_label_prefix: 'Pharmacy:', logout_btn: '🚪 Logout',
    new_orders_title: '🛎️ New patient orders',
    duty_status_title: '🕐 Duty status', duty_checkbox_label: 'My pharmacy is on duty today',
    save_duty_btn: 'Save duty status',
    duty_hours_title: '⏱️ Set duty hours (optional)',
    duty_hours_desc: 'Set a custom time to show alongside the duty day.',
    duty_start_label: 'From', duty_end_label: 'To',
    add_med_title: '💊 Add a medicine not in the list',
    add_med_desc: 'If you have a medicine in stock that is not listed, you can add it in the fields below.',
    med_name_placeholder: 'Medicine name', med_name_placeholder_cosmetic: 'Product name',
    generic_name_placeholder: 'Active ingredient (optional)', alt_names_placeholder: 'Alternative names, separate with commas (optional)',
    cat_medicine: 'Medicine', cat_cosmetic: 'Cosmetic product', add_med_btn: 'Add medicine',
    stock_table_medicine: 'Medicine', stock_table_status: 'Status', delete_account_btn: '🗑️ Delete my account permanently',
    manufacture_date_label: 'Manufacture date', expiry_date_label: 'Expiry date', save_dates_btn: 'Save dates',
    edit_dates_aria: 'Edit manufacture and expiry dates', expiry_expired_badge: 'Expired', expiry_soon_badge: 'Medicine is nearing its expiry date',
    day_sunday: 'Sunday', day_monday: 'Monday', day_tuesday: 'Tuesday', day_wednesday: 'Wednesday',
    day_thursday: 'Thursday', day_friday: 'Friday', day_saturday: 'Saturday',
    shift_allday: 'All day', shift_morning: 'Morning only', shift_evening: 'Evening only',
    stat_total_meds: 'Total medicines', stat_available_meds: 'Available medicines', stat_unavailable_meds: 'Unavailable',
    stat_cosmetics_short: 'Cosmetics', stat_onduty_today: 'On duty today', yes_word: 'Yes', no_word: 'No',
    med_name_required: 'Medicine name is required', med_added_success: 'Added successfully. Enable its availability from the list below.',
    duty_saved_success: 'Duty status saved successfully',
    assistant_phone_title: '📱 Assistant Pharmacist Phone (optional)', assistant_phone_desc: 'An additional contact number shown to patients alongside your main number — useful during busy hours.',
    assistant_phone_input_placeholder: 'Assistant phone number', save_assistant_phone_btn: 'Save assistant phone',
    assistant_phone_saved_success: 'Assistant phone saved successfully', assistant_phone_label: 'assistant',
    order_new_badge: '🆕 New', order_confirmed_badge: '✅ Reserved',
    order_dismiss_btn: 'Mark as seen', order_confirm_btn: '✅ Confirm reservation', order_delete_btn: '🗑️ Delete order',
    order_delete_confirm: "Confirm you've handled this order and want to delete it permanently?",
    delete_account_confirm: 'Are you sure you want to permanently delete your account? This action cannot be undone.',
    account_deleted_success: 'Your account has been deleted successfully',
    admin_dashboard_title: 'Admin Panel', admin_password_placeholder: 'Admin password', wrong_password: 'Incorrect password',
    stat_pharmacies_count: 'Pharmacies count', stat_onduty_pharmacies: 'Pharmacies on duty today',
    add_pharmacy_title: '🏥 Add new pharmacy', pharmacy_name_placeholder: 'Pharmacy name',
    address_placeholder: 'Address', phone_placeholder: 'Phone number', add_pharmacy_btn: 'Add pharmacy',
    registered_pharmacies_title: 'Registered pharmacies', no_pharmacies_yet: 'No pharmacies registered yet.',
    pharmacies_table_header: 'Pharmacy', action_col_header: 'Action', delete_btn: 'Delete', onduty_badge_short: '🟢 On duty',
    delete_pharmacy_confirm: 'Are you sure you want to delete pharmacy "{name}"?', pharmacy_added_success: 'Pharmacy "{name}" added successfully',
    edit_name_btn: 'Edit name', save_name_btn: 'Save', cancel_edit_btn: 'Cancel',
    edit_name_aria: 'Edit pharmacy name',
    change_password_title: '🔑 Change password',
    change_password_desc: 'Change your password any time. You will need your current password to confirm.',
    current_password_placeholder: 'Current password',
    new_password_placeholder: 'New password',
    confirm_new_password_placeholder: 'Confirm new password',
    change_password_btn: 'Change password',
    password_changed_success: 'Password changed successfully',
    passwords_not_matching: 'The two new passwords do not match',
    new_password_required_error: 'New password is required',
    new_password_too_short_error: 'New password is too short, minimum 8 characters',
    new_password_same_error: 'New password is the same as the current one',
    reset_password_btn: 'Reset password', reset_password_btn_short: '🔑 Password',
    reset_password_confirm: 'Reset the password for "{name}"? A new password will be generated and the pharmacist will no longer be able to log in with the old one. Stock and orders are not affected.',
    reset_password_done_title: 'New password for "{name}"',
    reset_password_done_hint: 'Copy it now and hand it to the pharmacist, it will not be shown again.',
    reset_password_error: 'Could not reset the password',
    copy_btn: 'Copy', copied_msg: 'Copied',
    stats_title: '📊 Platform overview', stats_load_error: 'Could not load statistics',
    stat_pharmacies: 'registered pharmacies', stat_on_duty: 'on duty now',
    stat_medicines: 'medicines in general list', stat_cosmetics: 'cosmetic products',
    stat_nurses: 'nurses', stat_available_stock: 'medicines in stock',
    stat_orders_total: 'total orders', stat_orders_24h: 'orders in last 24h',
    stat_orders_7d: 'orders in last 7 days', stat_orders_30d: 'orders in last 30 days',
    stats_top_medicines: 'Most requested medicines', stats_top_pharmacies: 'Most active pharmacies',
    stats_by_city: 'Pharmacies by city',
    stats_orders_count_unit: 'orders', stats_times_unit: 'times', stats_pharmacy_unit: 'pharmacies',
    stats_no_orders_yet: 'No orders yet, they will appear here as soon as the first one arrives.',
    stats_refresh_btn: 'Refresh',
    page_title: 'Dawaai Jahez | Find medicine availability in Syrian pharmacies',
    page_description: 'Instantly check which nearby pharmacy in Salamiyah and across Syria has your medicine, see tonight\'s on-duty pharmacies, and order directly. Free Syrian platform.',
    refresh_results_btn: '↻ Refresh results', refreshing_results: '⏳ Refreshing...',
    verified_badge: 'Verified', verified_badge_title: 'A pharmacy registered by the platform admin after verifying its details',
    stock_updated_prefix: 'Stock last updated:',
    time_just_now: 'just now', time_minutes: '{n} min ago', time_hours: '{n} h ago',
    time_days: '{n} days ago', time_weeks: '{n} weeks ago', time_long_ago: 'over a month ago',
    stock_never_updated: 'not updated yet',
    stock_stale_warning: 'This may not be current, so calling the pharmacy to confirm is recommended',
    city_placeholder: 'City', city_label: 'City', all_cities: 'All cities',
    filter_by_city_aria: 'Filter results by city',
    city_required_error: 'City is required', invalid_city_error: 'Invalid city',
    pharmacy_name_required: 'Pharmacy name is required',
    duplicate_pharmacy_name_confirm: 'A matching name already exists: "{name}" (username: {username}). Do you want to continue?',
    pharmacy_name_updated: 'Pharmacy name updated to "{name}"',
    pharmacy_name_update_error: 'Could not update the pharmacy name. Please try again.',
    add_medicine_title_admin: '💊 Add new medicine', registered_medicines_title: 'Registered medicines',
    item_added_success: '"{name}" added successfully', delete_medicine_confirm: 'Are you sure you want to permanently delete medicine "{name}"?',
    add_nurse_title: '🩺 Add new nurse', nurse_name_placeholder: 'Nurse name', specialty_placeholder: 'Specialty',
    university_placeholder: 'University', grad_year_placeholder: 'Graduation year', upload_cert_btn: '📄 Upload certificate (PDF/Word)',
    add_nurse_btn: 'Add nurse', registered_nurses_title: 'Registered nurses', no_nurses_yet: 'No nurses registered yet.',
    nurses_table_header: 'Nurse', actions_header_plural: 'Actions',
    nurse_available_short: '🟢 Available', nurse_unavailable_short: '🔴 Unavailable',
    delete_nurse_confirm: 'Are you sure you want to delete nurse "{name}"?',
    pending_ratings_title: '⭐ Ratings pending review', approve_btn: '✅ Approve', reject_btn: '🗑️ Reject',
    reject_rating_confirm: 'Are you sure you want to reject this rating? It will be permanently deleted.',
    published_ratings_title: '💬 Published ratings', show_ratings_btn: 'Show ratings', hide_ratings_btn: 'Hide ratings',
    loading_text: 'Loading...', no_published_ratings: 'No published ratings yet.',
    delete_final_btn: '🗑️ Delete permanently', failed_load_ratings: 'Could not load ratings.',
    delete_rating_final_confirm: 'Are you sure you want to permanently delete this rating? This action cannot be undone.',
    upload_cert_coming_soon: 'Certificate upload (PDF/Word) will be enabled once permanent file hosting is set up 📄',
    nursing_empty_title: 'No nurses registered right now', nursing_empty_subtitle: 'Trusted nurses will be added soon.',
    nurse_available_full: '🟢 Available for work', nurse_unavailable_full: '🔴 Currently unavailable',
    general_nurse_label: 'General nurse', rating_summary_suffix: 'from {count} reviews',
    no_ratings_yet_short: 'No ratings yet', view_profile_btn: 'View profile',
    grad_year_label: 'graduated', patient_reviews_title: 'Patient reviews ({count})',
    no_published_reviews: 'No published reviews yet.', rate_this_nurse_title: 'Rate this nurse',
    already_rated_msg: 'Thanks, your rating was already submitted and is now under admin review.',
    comment_placeholder: 'Write your review (optional)', your_name_placeholder: 'Your name', your_phone_placeholder: 'Your phone number',
    submit_rating_btn: 'Submit rating',
    star_rate_one: 'Rate 1 star out of 5', star_rate_two: 'Rate 2 stars out of 5', star_rate_n: 'Rate {n} stars out of 5',
    select_stars_first: 'Please select a star rating first', name_phone_required: 'Name and phone number are required',
    rating_submitted_success: 'Your rating was submitted successfully! It will appear publicly after admin approval.',
    nursing_page_title: 'Nursing Services 🩺', nursing_page_desc: 'Connect with trusted nurses for home nursing care.',
    show_password_aria: 'Show password', hide_password_aria: 'Hide password',
    invalid_value_error: 'Invalid value',
    admin_duty_title: '🕐 On-duty schedule',
    admin_duty_desc: 'Set any pharmacy\'s duty from here without logging into its account. Pharmacists can also set their own.',
    admin_duty_clear_all: 'Clear all duties',
    admin_duty_clear_confirm: 'Clear duty for every pharmacy ({n} currently on duty)? Normally used to start a new week.',
    admin_duty_cleared: '{n} duties cleared',
    admin_duty_none_active: 'No pharmacies are on duty right now',
    admin_duty_on: 'On duty',
    admin_duty_off: 'Off duty',
    admin_duty_save: 'Save',
    admin_duty_saved: 'Duty saved',
    admin_duty_by_pharmacy: 'set by pharmacist',
    admin_duty_by_admin: 'set by admin',
    admin_duty_never: 'never set',
    admin_duty_search: 'Search by pharmacy name...',
    admin_duty_no_match: 'No pharmacy matches that name',
    admin_duty_active_count: 'On duty now: {n}',
    stock_unmanaged_badge: 'Stock not listed',
    stock_unmanaged_note: 'This pharmacy is listed for the on-duty schedule only and does not update its stock here. Call them to ask about the medicine.',
    manages_stock_on: 'Updates stock',
    manages_stock_off: 'On-duty only',
    manages_stock_toggle_on: 'Enable stock',
    manages_stock_toggle_off: 'Disable stock',
    manages_stock_confirm_on: 'Enable stock management for "{name}"? Its medicine availability will be shown to patients in search results.',
    manages_stock_confirm_off: 'Disable stock management for "{name}"? It stays in the on-duty schedule, and instead of availability patients will see a note that its stock is not listed.',
    manages_stock_updated: 'Pharmacy status updated',
    name_too_long_error: 'The name is too long',
    notes_too_long_error: 'The notes are too long',
    too_many_items_error: 'Too many medicines in this order',
    invalid_order_error: 'The order data is not valid',
    comment_too_long_error: 'The comment is too long',
    open_now_badge: 'Open now',
    closed_now_badge: 'Closed now',
    closed_opens_at: 'Closed now, opens at {time}',
    closed_today_badge: 'Closed today',
    cart_closed_btn: 'Pharmacy closed, send order',
    cart_closed_notice: 'This pharmacy is closed now. You will get a reply after it opens at {time}.',
    cart_closed_notice_today: 'This pharmacy is closed today. You will get a reply after it opens.',
    hours_section_title: '🕒 Pharmacy opening hours',
    hours_section_desc: 'Set your hours once, and the open or closed status is calculated automatically every day. This prevents late-night orders arriving without the patient knowing you are closed.',
    hours_opens_label: 'Opens at',
    hours_closes_label: 'Closes at',
    hours_save: 'Save opening hours',
    hours_clear: 'Clear hours',
    hours_saved: 'Opening hours saved successfully',
    hours_cleared: 'Opening hours cleared',
    hours_none: 'Opening hours have not been set yet',
    hours_current: 'Current hours:',
    hours_to: 'to',
    hours_overnight_note: 'Hours extend past midnight',
    hours_both_required: 'Both opening and closing times are required',
    hours_same_time: 'Opening time is the same as closing time',
    invalid_time_error: 'Invalid time. Use the HH:MM format, for example 08:30',
    closed_today_title: 'Exceptional closure for today',
    closed_today_desc: 'Use this when closing for an emergency or a holiday. Hours return to the usual schedule automatically tomorrow.',
    closed_today_on: 'Mark as closed today',
    closed_today_off: 'Undo closure',
    closed_today_active: 'Your pharmacy is marked closed today.',
    closed_today_saved: 'The pharmacy is marked closed today',
    closed_today_removed: 'Hours returned to the usual schedule',
    duty_overrides_hours: 'Your pharmacy is on duty, so it shows as open regardless of opening hours.',
    a11y_duty_day: 'Duty day',
    a11y_duty_shift: 'Duty shift',
    a11y_med_category: 'Product category',
    err_offline: 'No internet connection. Check your network and try again.',
    err_timeout_search: 'The server took longer than usual. Please try again shortly.',
    err_timeout_order: 'The server did not respond in time. You can safely send again; your order will not be duplicated.',
    err_network: 'Could not reach the server. Check your connection and try again.',
    err_network_order: 'The order could not be sent. You can safely send again; your order will not be duplicated.',
    err_server: 'A server error occurred. Please try again shortly.',
    offline_banner: 'No internet connection',
    sending_order: 'Sending order...',
    rate_limited_error: 'Too many attempts. Please try again shortly.',
    backup_title: '💾 Backup and system status',
    backup_desc: 'The free hosting plan provides no automatic backups. Download a copy regularly and keep it somewhere safe.',
    backup_btn: 'Download backup',
    backup_preparing: 'Preparing...',
    backup_done: 'Backup downloaded successfully',
    backup_failed: 'Could not create the backup',
    backup_warning: 'This file is sensitive: it contains account and order data. Keep it safe and do not share it.',
    backup_last: 'Last backup downloaded from this browser:',
    backup_never: 'No backup has been downloaded from this browser yet',
    backup_overdue: 'More than a week has passed since the last backup.',
    system_status_title: 'System status',
    system_status_ok: 'Running normally',
    system_status_degraded: 'The database is not responding',
    system_status_checking: 'Checking...',
    admin_username_title: '👤 Edit usernames',
    admin_username_desc: 'The username is what the pharmacist signs in with. Changing it does not affect the password, stock, orders or duty schedule.',
    admin_username_search: 'Search by pharmacy or username',
    admin_username_no_match: 'No matching pharmacy',
    admin_username_current: 'Current username:',
    admin_username_new_placeholder: 'New username',
    admin_username_save: 'Save',
    admin_username_saved: 'Username updated successfully',
    admin_username_confirm: 'Change the username for "{name}" from "{old}" to "{new}"? The pharmacist will sign in with the new name, and their password will not change.',
    admin_username_required: 'Username is required',
    admin_username_no_spaces: 'The username cannot contain spaces',
    admin_username_too_short: 'Username is too short, minimum three characters',
    admin_username_taken: 'That username is already taken',
    register_listing_type_title: 'Listing type',
    register_type_full_label: 'Full pharmacy',
    register_type_full_desc: 'Manages its stock on the platform, so medicine availability is shown to patients in search results.',
    register_type_duty_label: 'On-duty only',
    register_type_duty_desc: 'Appears in the on-duty schedule without showing medicine availability. The type can be changed later at any time.',
    directions_btn: 'Directions',
    directions_btn_title: 'Open directions to this pharmacy in Google Maps',
    location_section_title: '📍 Pharmacy location on the map',
    location_section_desc: 'Set your location once, and patients get a button that opens directions straight to you.',
    detect_location_btn: '📍 Detect my current location',
    detecting_location: '⏳ Detecting location...',
    location_paste_placeholder: 'Or paste coordinates here: 35.011667, 37.053056',
    location_paste_hint: 'From Google Maps: long-press your pharmacy location, then copy the line containing N and E (e.g. 35°00\'57.8"N 37°03\'25.3"E) and paste it here. That format is unambiguous.',
    save_location_btn: 'Save location',
    clear_location_btn: 'Clear location',
    location_saved_success: 'Pharmacy location saved successfully',
    location_cleared_success: 'Pharmacy location cleared',
    location_current_label: 'Currently saved location:',
    location_preview_btn: 'Preview on map',
    location_none: 'No location set yet',
    invalid_location_error: 'Invalid coordinates. Check the numbers and try again.',
    geo_unsupported: 'Your browser does not support location detection. Use manual paste instead.',
    geo_denied: 'Location permission denied. Enable it in your browser settings, or use manual paste.',
    geo_unavailable: 'Could not determine your location. Make sure GPS is on and try in an open area.',
    geo_timeout: 'Location request timed out. Please try again.',
    geo_low_accuracy: 'Accuracy is low (about {n} m). Try in an open area, or save if the location looks right.',
    location_confirm_detected: 'Your location was detected with about {n} m accuracy. Save it as the pharmacy location?',
    location_outside_syria: 'These coordinates are outside Syria. Make sure you did not swap the two numbers. Save anyway?',
    location_swap_suggest: 'The two numbers look swapped. The correct location is most likely: {coords}\n\nSave it that way?',
    location_admin_label: 'location',
    wa_consult_btn_label: 'Ask a pharmacist',
    wa_consult_title: '💬 Ask a pharmacist on WhatsApp',
    wa_consult_desc: 'Unclear prescription? A question about a dose or an alternative? Message a pharmacist directly.',
    wa_consult_empty: 'No pharmacies have WhatsApp enabled yet.',
    wa_consult_empty_city: 'No pharmacies with WhatsApp in this city. Try selecting "All cities".',
    wa_consult_loading: 'Loading pharmacies...',
    wa_consult_error: 'Could not load pharmacies. Please try again.',
    wa_chat_btn: 'Message on WhatsApp',
    wa_close_btn: 'Close',
    wa_disclaimer: 'This platform is an information service only. The conversation is directly between you and the pharmacy, and does not replace a doctor consultation.',
    wa_result_btn: 'WhatsApp',
    wa_msg_consult: 'Hello, I would like to ask you about a medicine. I found you on Dawaai Jahez.',
    wa_msg_medicine: 'Hello, I would like to buy "{medicine}" from your pharmacy. I found it on Dawaai Jahez.',
    wa_onduty_now: 'On duty now',
    whatsapp_phone_section_title: '💬 Pharmacy WhatsApp number',
    whatsapp_phone_input_placeholder: 'WhatsApp number (e.g. 0932985852)',
    save_whatsapp_btn: 'Save WhatsApp number',
    whatsapp_saved_success: 'WhatsApp number saved successfully',
    whatsapp_cleared_success: 'WhatsApp number cleared',
    invalid_whatsapp_error: 'Invalid WhatsApp number. Enter a Syrian mobile number such as 0932985852',
    whatsapp_phone_hint: 'The message button appears to patients only if you enter a number. Leave it empty to hide it.',
    whatsapp_admin_label: 'WhatsApp',
    whatsapp_coming_soon: "Search via WhatsApp coming soon 💬 We're setting up an official number for the project.",
    contact_coming_soon: 'Contact information will be added soon.',
    footer_faq: 'FAQ', footer_about: 'About Us',
    faq_title: 'Frequently Asked Questions',
    faq_section_patient: 'For Patients & Visitors', faq_section_pharmacist: 'For Pharmacists',
    faq_q1: 'What is "Dawaai Jahez"?',
    faq_a1: 'A Syrian online platform that helps you check medicine availability at nearby pharmacies, find pharmacies currently on duty, and connect with nurses for home nursing services.',
    faq_q2: 'How do I search for a medicine?',
    faq_a2: 'Type the medicine name or its active ingredient in the search box on the homepage, and you\'ll see every pharmacy that currently has it in stock, along with its address and phone number.',
    faq_q3: 'Is the displayed information updated in real time?',
    faq_a3: 'Pharmacy owners update the information themselves whenever their stock changes. We always recommend confirming availability directly with the pharmacy before heading there, especially if you need the medicine urgently.',
    faq_q4: 'What\'s the difference between "available" and "unavailable"?',
    faq_a4: '"Available" means the pharmacy has marked this medicine as currently in stock. "Unavailable" means either they don\'t have it, or they simply haven\'t updated its status yet.',
    faq_q5: 'How do I find today\'s on-duty pharmacies?',
    faq_a5: 'From the "On-Duty Pharmacies" section at the top of the page — you\'ll see every pharmacy currently on duty, along with their duty hours and contact numbers.',
    faq_q6: 'Can I order a medicine and have the pharmacy deliver it?',
    faq_a6: 'The site lets you send a request with the medicines you need directly to the pharmacy, and they will contact you to confirm the order and pickup/delivery arrangement. The site itself does not sell or deliver any medicine.',
    faq_q7: 'Are the nursing services shown on the site free?',
    faq_a7: 'The site only introduces you to available nurses and their contact details. Any agreement on the service and its fee happens directly between you and the nurse.',
    faq_q8: 'How do I register my pharmacy on the site?',
    faq_a8: 'Registration is currently done by contacting the site\'s admin team directly, after which a dedicated account is created for your pharmacy that you can log into anytime.',
    faq_q9: 'How do I update a medicine\'s availability in my stock?',
    faq_a9: 'From the pharmacist dashboard, each medicine has a button showing its status (available/unavailable) — one click toggles it instantly.',
    faq_q10: 'How do I add a large number of medicines at once?',
    faq_a10: 'From the pharmacist dashboard, use the "Import CSV file" option. Download the blank template first — it has 4 columns: medicine name, active ingredient, alternative names (separate multiple names with a semicolon ;), and category (medicine or cosmetic). Fill in a new row per medicine, save the file, and upload it from the same page. The maximum allowed per upload is 500 medicines.',
    faq_q11: 'What if the Arabic text looks corrupted after saving my CSV file?',
    faq_a11: 'This is a common Excel issue. Try saving the file as "Unicode Text" instead of regular "CSV", from the same "Save As" window.',
    faq_q12: 'How do I add an assistant pharmacist phone number?',
    faq_a12: 'From the pharmacist dashboard, in the "Assistant Pharmacist Phone" section — enter the number and click save. It will appear to patients alongside your main number, useful during busy hours.',
    faq_q13: 'Can I record manufacture and expiry dates for medicines?',
    faq_a13: 'Yes, each medicine in your stock has a small calendar button (📅) that opens two fields for manufacture and expiry dates. This information is internal to you only, never shown to patients, and helps the site warn you as a medicine nears its expiry.',
    faq_q14: 'Is using the site free for pharmacies?',
    faq_a14: 'Yes, using the site is currently completely free.',
    about_title: 'About Us',
    about_content_html: `
      <h3>About Dawaai Jahez</h3>
      <p>"Dawaai Jahez" is a Syrian online platform dedicated to making it easier for patients to reach the pharmaceutical information they need, exactly when they need it: checking whether a specific medicine is available at nearby pharmacies, finding which pharmacies are currently on duty, and connecting with trusted nurses for home nursing services.</p>
      <p>This site was born out of a real need many people in Syria face today: the difficulty of knowing which pharmacy has the medicine they're looking for, or which pharmacy is on duty late at night. Our only goal is to close the distance between the patient and the information — nothing more, nothing less.</p>
      <h3>Nature of the Displayed Information</h3>
      <p>All information shown on the site — medicine availability, duty status, and pharmacy and nurse details — is entered and updated by the pharmacy owners and nurses themselves, each for their own listing. Dawaai Jahez does not independently verify the accuracy of this information at any given moment, nor does it guarantee it remains accurate at all times.</p>
      <p>We therefore recommend that every user, before fully relying on any information about medicine availability or a pharmacy's status, confirm it directly by contacting the pharmacy in question. The site is also not a substitute for consulting a doctor or a qualified health professional when needed.</p>
      <h3>Disclaimer</h3>
      <p>Dawaai Jahez is solely an intermediary platform for displaying information. It is not a pharmacy, not a medical entity, and not a regulatory or governmental body. The site does not sell or dispense any medicine, and does not take part in any medical or pharmaceutical decision; every act of dispensing or consultation remains the sole responsibility of the pharmacy or the qualified professional involved.</p>
      <p>Accordingly, those who operate this site bear no responsibility for any harm, error, or misunderstanding that may arise from the use of the information displayed on it — whether related to medicine availability, the accuracy of a pharmacy's or nurse's details, or any interaction that takes place outside the site between its users.</p>
    `,
    invalid_credentials: 'Invalid login credentials',
    expiry_before_manufacture_error: 'Expiry date cannot be before manufacture date', invalid_date_format_error: 'Invalid date format',
    order_submit_error: 'An error occurred while sending the order. Please try again, or contact the pharmacy directly if the issue persists.',
    phone_digits_only_error: 'Phone number must contain digits only',
    order_missing_fields_error: 'Name, phone number, and medicines are required to complete the order',
    medicine_already_exists_error: 'This medicine already exists in the general list',
    bulk_import_title: '📥 Import medicines from file',
    bulk_import_desc: "Download a blank template, copy your company's medicine data into it, then upload it here to add them all at once to your stock.",
    bulk_import_hint_alt_format: 'If the Arabic text looks corrupted after saving as CSV, try saving the file as "Unicode Text" instead, from the same Save As window in Excel.',
    download_template_btn: '⬇️ Download blank template (CSV)',
    choose_file_btn: 'Choose CSV file',
    no_file_chosen: 'No file chosen',
    bulk_import_preview_title: 'Preview before import',
    bulk_import_valid_count: '{count} medicines ready to import',
    bulk_import_invalid_count: '{count} row(s) have an issue (will be skipped)',
    bulk_import_confirm_btn: 'Confirm import',
    bulk_import_cancel_btn: 'Cancel',
    bulk_import_empty_name_issue: 'Medicine name is missing',
    bulk_import_invalid_category_issue: 'Unknown category (use "دواء" or "مستحضر تجميل")',
    bulk_import_parse_error: "Couldn't read the file. Make sure it's a CSV matching the template format.",
    bulk_import_no_valid_rows: 'No valid rows found in the file.',
    bulk_import_success: 'Import complete: {added} new medicines, {linked} linked to your stock, {skipped} skipped.',
    bulk_import_col_name: 'Name', bulk_import_col_generic: 'Active ingredient',
    bulk_import_col_alt: 'Alternative names', bulk_import_col_category: 'Category', bulk_import_col_issue: 'Note'
  }
};

function t(key) {
  return (translations[currentLang] && translations[currentLang][key]) || translations.ar[key] || key;
}

// تعبئة قالب ترجمة فيه عناصر نائبة {مثل هذه}
function tFormat(key, values) {
  let str = t(key);
  for (const [k, v] of Object.entries(values)) str = str.replace(`{${k}}`, v);
  return str;
}

// بعض رسائل الخطأ جاية جاهزة عربي من الباك إند (ملفات routes) — نترجم عرضها هون بدون لمس الباك إند نفسه
const BACKEND_ERROR_MAP = {
  'بيانات الدخول غير صحيحة': 'invalid_credentials',
  'تاريخ الانتهاء لا يمكن أن يكون قبل تاريخ الصنع': 'expiry_before_manufacture_error',
  'صيغة التاريخ غير صالحة': 'invalid_date_format_error',
  'حدث خطأ أثناء إرسال الطلب': 'order_submit_error',
  'رقم الهاتف يجب أن يتكون من أرقام فقط': 'phone_digits_only_error',
  'الاسم ورقم الهاتف والأدوية مطلوبة لإتمام الطلب': 'order_missing_fields_error',
  'هذا الدواء موجود مسبقاً في القائمة العامة': 'medicine_already_exists_error',
  'المدينة مطلوبة': 'city_required_error',
  'مدينة غير صالحة': 'invalid_city_error',
  'كلمة المرور الجديدة مطلوبة': 'new_password_required_error',
  'كلمة المرور الجديدة قصيرة جداً': 'new_password_too_short_error',
  'كلمة المرور الجديدة مطابقة للحالية': 'new_password_same_error',
  'رقم واتساب غير صالح': 'invalid_whatsapp_error',
  'إحداثيات غير صالحة': 'invalid_location_error',
  'قيمة غير صالحة': 'invalid_value_error',
  'اسم المستخدم مطلوب': 'admin_username_required',
  'اسم المستخدم لا يقبل المسافات': 'admin_username_no_spaces',
  'اسم المستخدم قصير جداً': 'admin_username_too_short',
  'اسم المستخدم مستخدم مسبقاً': 'admin_username_taken',
  'وقت غير صالح': 'invalid_time_error',
  'يلزم تحديد وقتي الفتح والإغلاق معاً': 'hours_both_required',
  'وقت الفتح مطابق لوقت الإغلاق': 'hours_same_time',
  'الاسم طويل جداً': 'name_too_long_error',
  'الملاحظات طويلة جداً': 'notes_too_long_error',
  'عدد الأدوية في الطلب كبير جداً': 'too_many_items_error',
  'بيانات الطلب غير صالحة': 'invalid_order_error',
  'التعليق طويل جداً': 'comment_too_long_error',
  'محاولات كثيرة جداً. حاول بعد قليل.': 'rate_limited_error'
};
function translateApiError(rawError) {
  const key = BACKEND_ERROR_MAP[rawError];
  return key ? t(key) : rawError;
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
  document.getElementById('whatsapp-btn-label').textContent = t('wa_consult_btn_label');
  // ---------- لوحة استشارة واتساب ----------
  document.getElementById('wa-panel-title').textContent = t('wa_consult_title');
  document.getElementById('wa-panel-desc').textContent = t('wa_consult_desc');
  document.getElementById('wa-panel-disclaimer').textContent = t('wa_disclaimer');
  document.getElementById('wa-panel-close').textContent = t('wa_close_btn');
  // إعادة بناء القائمة بلغتها الجديدة لو كانت اللوحة مفتوحة وقت التبديل
  if (waPanelOpen) loadWhatsappPharmacies();
  // ---------- حقل رقم واتساب بلوحة الصيدلي ----------
  document.getElementById('whatsapp-phone-section-title').textContent = t('whatsapp_phone_section_title');
  document.getElementById('whatsapp-phone-input').placeholder = t('whatsapp_phone_input_placeholder');
  document.getElementById('whatsapp-phone-hint').textContent = t('whatsapp_phone_hint');
  document.getElementById('save-whatsapp-btn').textContent = t('save_whatsapp_btn');
  // ---------- قسم موقع الصيدلية ----------
  document.getElementById('location-section-title').textContent = t('location_section_title');
  document.getElementById('location-section-desc').textContent = t('location_section_desc');
  document.getElementById('location-paste-input').placeholder = t('location_paste_placeholder');
  document.getElementById('location-paste-hint').textContent = t('location_paste_hint');
  document.getElementById('save-location-btn').textContent = t('save_location_btn');
  document.getElementById('clear-location-btn').textContent = t('clear_location_btn');
  const detectBtn = document.getElementById('detect-location-btn');
  if (detectBtn && !detectBtn.disabled) detectBtn.textContent = t('detect_location_btn');
  renderSavedLocation();

  // ---------- شريط انقطاع الإنترنت ----------
  updateOfflineBanner();

  // ---------- أسماء مقروءة للقوائم المنسدلة ----------
  // كانت هذه القوائم بلا أي اسم، فيعلنها قارئ الشاشة "قائمة منسدلة" فقط دون أن
  // يعرف المستخدم ماذا يختار. نضبطها هنا لا في HTML، لتتبع لغة الواجهة.
  [['duty-day', 'a11y_duty_day'], ['duty-shift', 'a11y_duty_shift'], ['pharm-med-category', 'a11y_med_category']]
    .forEach(([id, key]) => { const el = document.getElementById(id); if (el) el.setAttribute('aria-label', t(key)); });

  // ---------- ساعات الدوام ----------
  document.getElementById('hours-section-title').textContent = t('hours_section_title');
  document.getElementById('hours-section-desc').textContent = t('hours_section_desc');
  document.getElementById('hours-opens-label').textContent = t('hours_opens_label');
  document.getElementById('hours-closes-label').textContent = t('hours_closes_label');
  document.getElementById('save-hours-btn').textContent = t('hours_save');
  document.getElementById('clear-hours-btn').textContent = t('hours_clear');
  document.getElementById('closed-today-title').textContent = t('closed_today_title');
  document.getElementById('closed-today-desc').textContent = t('closed_today_desc');
  renderPharmacyHours();

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
  document.getElementById('footer-faq').textContent = t('footer_faq');
  document.getElementById('footer-about').textContent = t('footer_about');
  document.getElementById('footer-center').textContent = t('footer_center');
  document.getElementById('footer-copy').textContent = t('footer_copy');

  document.getElementById('lang-toggle-btn').textContent = t('lang_toggle');
  document.getElementById('brand-name').textContent = t('brand_name');

  renderCart(); // لتحديث نص حالة الفراغ لو العربة مفتوحة وفاضية
  if (document.getElementById('search').value.trim()) runSearch(); // تحديث نتائج البحث الحالية لو موجودة

  const bellBtnEl = document.getElementById('bell-btn');
  if (bellBtnEl) bellBtnEl.setAttribute('aria-label', t('bell_aria_label'));
  const bellPanelEl = document.getElementById('bell-panel');
  if (bellPanelEl && bellPanelEl.style.display !== 'none') renderBellPanel();
  lastOnDutySnapshot = null; // نجبر إعادة رسم الصيدليات المناوبة حتى لو البيانات نفسها ما تغيّرت
  loadOnDuty();

  // ---------- لوحة الصيدلي ----------
  document.getElementById('pharm-dash-title').textContent = t('pharm_dashboard_title');
  document.getElementById('new-orders-title').textContent = t('new_orders_title');
  document.getElementById('duty-status-title').textContent = t('duty_status_title');
  document.getElementById('duty-checkbox-label').textContent = t('duty_checkbox_label');
  document.getElementById('save-duty-btn').textContent = t('save_duty_btn');
  document.getElementById('duty-hours-title').textContent = t('duty_hours_title');
  document.getElementById('duty-hours-desc').textContent = t('duty_hours_desc');
  document.getElementById('duty-start-label').textContent = t('duty_start_label');
  document.getElementById('duty-end-label').textContent = t('duty_end_label');
  document.getElementById('assistant-phone-title').textContent = t('assistant_phone_title');
  document.getElementById('assistant-phone-desc').textContent = t('assistant_phone_desc');
  document.getElementById('assistant-phone-input').placeholder = t('assistant_phone_input_placeholder');
  document.getElementById('save-assistant-phone-btn').textContent = t('save_assistant_phone_btn');
  document.getElementById('opt-day-sun').textContent = t('day_sunday');
  document.getElementById('opt-day-mon').textContent = t('day_monday');
  document.getElementById('opt-day-tue').textContent = t('day_tuesday');
  document.getElementById('opt-day-wed').textContent = t('day_wednesday');
  document.getElementById('opt-day-thu').textContent = t('day_thursday');
  document.getElementById('opt-day-fri').textContent = t('day_friday');
  document.getElementById('opt-day-sat').textContent = t('day_saturday');
  document.getElementById('opt-shift-allday').textContent = t('shift_allday');
  document.getElementById('opt-shift-morning').textContent = t('shift_morning');
  document.getElementById('opt-shift-evening').textContent = t('shift_evening');
  document.getElementById('add-med-title').textContent = t('add_med_title');
  document.getElementById('add-med-desc').textContent = t('add_med_desc');
  document.getElementById('pharm-med-name').placeholder =
    document.getElementById('pharm-med-category').value === 'cosmetic' ? t('med_name_placeholder_cosmetic') : t('med_name_placeholder');
  document.getElementById('pharm-med-generic').placeholder = t('generic_name_placeholder');
  document.getElementById('pharm-med-alt').placeholder = t('alt_names_placeholder');
  document.getElementById('opt-cat-medicine').textContent = t('cat_medicine');
  document.getElementById('opt-cat-cosmetic').textContent = t('cat_cosmetic');
  document.getElementById('add-med-btn').textContent = t('add_med_btn');
  document.getElementById('bulk-import-title').textContent = t('bulk_import_title');
  document.getElementById('bulk-import-desc').textContent = t('bulk_import_desc');
  document.getElementById('bulk-import-hint-alt').textContent = '💡 ' + t('bulk_import_hint_alt_format');
  document.getElementById('download-template-btn').textContent = t('download_template_btn');
  document.getElementById('choose-file-label').textContent = t('choose_file_btn');
  if (!document.getElementById('bulk-import-file').files.length) {
    document.getElementById('bulk-import-filename').textContent = t('no_file_chosen');
  }
  if (bulkImportParsedRows.length > 0) renderBulkImportPreview();
  document.getElementById('stock-table-medicine').textContent = t('stock_table_medicine');
  document.getElementById('stock-table-status').textContent = t('stock_table_status');
  document.getElementById('delete-account-btn').textContent = t('delete_account_btn');
  if (currentPharmacy) {
    document.getElementById('pharmacy-label').innerHTML = `
      <span style="font-weight:500; font-size:16px;">${t('pharmacy_label_prefix')} ${escapeHtml(currentPharmacy.name)}</span>
      <button class="action-pill-btn blue" onclick="logout()">${t('logout_btn')}</button>
    `;
    renderStockUI();
    renderOrdersUI();
  } else if (document.getElementById('pharmacist-auth-section').innerHTML.trim()) {
    renderPharmacyAuthForm();
  }

  // ---------- نموذج تغيير كلمة المرور بلوحة الصيدلي ----------
  document.getElementById('change-password-title').textContent = t('change_password_title');
  document.getElementById('change-password-desc').textContent = t('change_password_desc');
  document.getElementById('current-password-input').placeholder = t('current_password_placeholder');
  document.getElementById('new-password-input').placeholder = t('new_password_placeholder');
  document.getElementById('confirm-password-input').placeholder = t('confirm_new_password_placeholder');
  document.getElementById('change-password-btn').textContent = t('change_password_btn');

  // ---------- زر تحديث النتائج ----------
  const refreshBtn = document.getElementById('refresh-results-btn');
  if (refreshBtn && !refreshBtn.disabled) refreshBtn.textContent = t('refresh_results_btn');

  // ---------- وسوم محركات البحث ----------
  // تحديث عنوان الصفحة ووصفها مع اللغة: يفيد المستخدم (اسم التبويب) ومحركات البحث معاً.
  document.title = t('page_title');
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', t('page_description'));

  // ---------- فلتر المدينة بالهيرو ----------
  // إعادة تعبئة القائمة عند تبديل اللغة حتى تُترجم أسماء المدن، مع الحفاظ على الاختيار الحالي
  renderCityFilter();

  // ---------- لوحة الإدارة ----------
  if (adminPassword) {
    renderAdminPanelUI();
  } else if (document.getElementById('admin-auth-section').innerHTML.trim()) {
    renderAdminAuthForm();
  }

  // ---------- خدمات التمريض ----------
  document.getElementById('nursing-page-title').textContent = t('nursing_page_title');
  document.getElementById('nursing-page-desc').textContent = t('nursing_page_desc');
  if (document.getElementById('nurses-list').innerHTML.trim()) {
    document.getElementById('nurses-list').innerHTML = renderNursesList(nursesCache);
    for (const id of openNurseDetailIds) {
      const panel = document.getElementById(`nurse-detail-${id}`);
      if (panel) { panel.style.display = 'block'; renderNurseDetail(id); }
    }
  }
}

function toggleLanguage() {
  currentLang = currentLang === 'ar' ? 'en' : 'ar';
  localStorage.setItem('lang', currentLang);
  applyLanguage();
}

// ---------- نافذة تنبيه مخصصة (بديل alert وconfirm الافتراضيين) ----------

function showModal({ message, type = 'info', showCancel = false, okText, cancelText }) {
  okText = okText || t('modal_ok');
  cancelText = cancelText || t('modal_cancel');
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

    // Escape بينفّذ نفس سلوك زر الإلغاء بالضبط — نضيف المستمع وقت الفتح، ونشيله جوا cleanup عشان ما يتراكم أبداً
    const escHandler = (e) => { if (e.key === 'Escape') cleanup(false); };
    document.addEventListener('keydown', escHandler);

    const cleanup = (result) => {
      overlay.style.display = 'none';
      document.body.classList.remove('modal-open');
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      document.removeEventListener('keydown', escHandler);
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
  return showModal({ message, type, showCancel: true, okText: t('modal_yes'), cancelText: t('modal_cancel') });
}

function showView(view) {
  document.getElementById('view-patient').style.display = view === 'patient' ? 'block' : 'none';
  document.getElementById('view-pharmacist').style.display = view === 'pharmacist' ? 'block' : 'none';
  document.getElementById('view-admin').style.display = view === 'admin' ? 'block' : 'none';
  document.getElementById('view-nursing').style.display = view === 'nursing' ? 'block' : 'none';
  if (view === 'pharmacist' && !currentPharmacy) renderPharmacyAuthForm();
  if (view === 'admin' && !adminPassword) renderAdminAuthForm();
  if (view !== 'nursing') stopNursingPolling();
  if (view !== 'admin') stopAdminRatingsPolling();
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
  // لو كنا أصلاً بلوحة الإدارة (مثلاً ضغط نفس الرابط مرتين)، ما منعيد الجلب — الفحص الدوري أصلاً شغال ومستمر
  const wasOnAdmin = document.getElementById('view-admin').style.display !== 'none';
  showView('admin');
  if (adminPassword && !wasOnAdmin) renderAdminPanel();
  document.getElementById('view-admin').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setActiveNav(link);
}

// ---------- عربة المشتريات ----------

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCartCount();
  // أي تعديل على السلة يجعلها طلباً مختلفاً، فتأخذ مفتاح تفرّد جديداً.
  // بدون هذا، لو فشل إرسال ثم أضاف المريض دواءً وأعاد الإرسال، لأعاد الخادم
  // الطلب القديم بمفتاحه القديم وضاع الدواء المضاف.
  pendingOrderKey = null;
}

function updateCartCount() {
  const el = document.getElementById('cart-count');
  if (el) el.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
}

async function addToCart(medicineId, pharmacyId, btn) {
  const item = lastSearchResultsCache.find(it => it.medicine.id === medicineId);
  if (!item) return;
  const avail = item.availability.find(a => a.pharmacy_id === pharmacyId);
  if (!avail) return;

  // الصيدلية مغلقة: نضبط توقع المريض قبل الإضافة بدل منعه.
  // المنع يحرمه من إرسال طلب ليلي ليُجهَّز صباحاً، وهو سلوك مفيد. والإشعار
  // يمنع ما أردنا منعه فعلاً: أن ينتظر رداً فورياً أو يتصل في ساعة متأخرة.
  const notice = btn && btn.getAttribute('data-closed-notice');
  if (notice) {
    const proceed = await customConfirm(notice, 'warning');
    if (!proceed) return;
  }
  const medicineName = item.medicine.name;
  const genericName = item.medicine.generic_name;
  const pharmacyName = avail.pharmacy_name;
  const existing = cart.find(c => c.medicineName === medicineName && c.pharmacyId === pharmacyId);
  if (existing) {
    if (existing.quantity >= 3 && !existing.confirmedExcess) {
      const wantsMore = await customConfirm(tFormat('excess_quantity_confirm', { qty: existing.quantity, name: medicineName, pharmacy: pharmacyName }), 'question');
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
    const wantsMore = await customConfirm(tFormat('excess_quantity_confirm', { qty: item.quantity, name: item.medicineName, pharmacy: item.pharmacyName }), 'question');
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
  const bellRow = renderBellRow();
  if (cart.length === 0) {
    // السلة فاضية: هون بس بيظهر الجرس (بزاوية البطاقة العلوية اليمنى)
    container.innerHTML = `
      <div class="box cart-empty">
        ${bellRow}
        <div class="cart-empty-icon">🛒</div>
        <p class="cart-empty-title">${t('cart_empty_title')}</p>
        <p class="cart-empty-subtitle">${t('cart_empty_subtitle')}</p>
      </div>
    `;
    return;
  }
  // السلة فيها أدوية: صفر جرس إطلاقاً
  container.innerHTML = `
    <div class="cart-header">
      <h3 class="cart-title">${t('cart_panel_title')}</h3>
      <p class="cart-subtitle">${t('cart_panel_subtitle')}</p>
    </div>
    ${cart.map((item, i) => `
      <div class="cart-item-card">
        <div class="cart-item-top">
          <div>
            <div class="cart-item-name"><span>💊</span> ${escapeHtml(item.medicineName)}</div>
            ${item.genericName ? `<div class="cart-item-generic">${escapeHtml(item.genericName)}</div>` : ''}
            <div class="cart-item-pharmacy">${escapeHtml(item.pharmacyName)}</div>
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
      <input id="checkout-name" placeholder="${t('checkout_name_placeholder')}" aria-label="${t('checkout_name_placeholder')}">
      <input id="checkout-phone" placeholder="${t('checkout_phone_placeholder')}" aria-label="${t('checkout_phone_placeholder')}" type="tel" inputmode="numeric" oninput="digitsOnly(this)">
      <textarea id="checkout-notes" placeholder="${t('checkout_notes_placeholder')}" rows="2" style="width:100%; padding:10px 14px; border:1px solid #cfe0ef; border-radius:14px; font-family:inherit; font-size:15px; resize:vertical; margin-bottom:10px;"></textarea>
      <button class="checkout-btn" onclick="submitOrder()">${t('checkout_btn')}</button>
    </div>
  `;
}

let orderSubmitInProgress = false;

async function submitOrder() {
  if (orderSubmitInProgress) return; // منع إرسال مكرر لو الطلب السابق لسا قيد التنفيذ (مثلاً وقت تأخر استيقاظ سيرفر Render)
  const name = document.getElementById('checkout-name').value.trim();
  const phone = document.getElementById('checkout-phone').value.trim();
  const notes = document.getElementById('checkout-notes').value.trim();
  if (!name || !phone) {
    customAlert(t('checkout_missing_fields'), 'warning');
    return;
  }
  const btn = document.querySelector('.checkout-btn');
  const originalLabel = btn ? btn.textContent : '';
  orderSubmitInProgress = true;
  // نص تحميل صريح: على الشبكة البطيئة كان الزر يخفت فقط، فلا يعرف المريض
  // إن كان شيء يحدث أم أن ضغطته لم تُسجَّل.
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.textContent = t('sending_order'); }
  // المفتاح نفسه عبر كل إعادات المحاولة لهذه السلة
  if (!pendingOrderKey) pendingOrderKey = newRequestKey();
  try {
    // 30 ثانية للإرسال لا 20: عملية كتابة قد تتأخر أكثر، وإنهاؤها مبكراً يدفع
    // المريض لإعادة المحاولة دون داعٍ (وإن كان المفتاح يحميه من التكرار).
    const res = await fetchWithTimeout(`${API}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_name: name,
        patient_phone: phone,
        notes: notes || null,
        request_key: pendingOrderKey,
        items: cart.map(item => ({
          pharmacyId: item.pharmacyId,
          medicineName: item.medicineName,
          genericName: item.genericName,
          quantity: item.quantity
        }))
      })
    }, 30000);
    // الرد قد لا يكون JSON (صفحة خطأ من الوسيط أثناء إعادة النشر مثلاً)،
    // فنقرؤه بحذر بدل أن يُطلق استثناءً يُفسَّر خطأً في الشبكة.
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = res.status >= 500 ? t('err_server') : translateApiError(data.error);
      customAlert(msg, 'error');
      return;
    }

    // نجح الإرسال: المفتاح انتهى دوره، والسلة التالية تأخذ مفتاحاً جديداً
    pendingOrderKey = null;

    // نربط كل طلب باسم صيدليته (من العربة) ونحفظه محلياً لمتابعة رد الصيدلية عليه
    data.orders.forEach(o => {
      const item = cart.find(it => it.pharmacyId === o.pharmacy_id);
      myOrders.push({ id: o.id, pharmacyName: item ? item.pharmacyName : '', status: 'pending' });
    });
    saveMyOrders();
    updateBellBadge();
    startMyOrdersPolling();

    await customAlert(t('order_success_msg'), 'success');
    cart = [];
    saveCart();
    renderCart();
  } catch (err) {
    // لا نمسح المفتاح هنا عن قصد: الفشل قد يكون ملتبساً (وصل الطلب وضاع الرد)،
    // فإعادة المحاولة بالمفتاح نفسه تعيد الطلب الموجود بدل تكراره.
    const kind = classifyFetchError(err);
    const msg = kind === 'offline' ? t('err_offline')
              : kind === 'timeout' ? t('err_timeout_order')
              : t('err_network_order');
    customAlert(msg, 'error');
  } finally {
    orderSubmitInProgress = false;
    // لو نجح الطلب، renderCart() أصلاً بتعيد بناء الزر من جديد (مفعّل تلقائياً)
    // ولو فشل، الزر نفسه لسا موجود بالـDOM فلازم نرجعه يشتغل يدوياً
    const stillThere = document.querySelector('.checkout-btn');
    if (stillThere) {
      stillThere.disabled = false;
      stillThere.style.opacity = '';
      if (originalLabel) stillThere.textContent = originalLabel;
    }
  }
}

// ---------- تتبع حالة طلبات المريض (هل استجابت الصيدلية؟) — عبر أيقونة الجرس ----------

function saveMyOrders() {
  localStorage.setItem('myOrders', JSON.stringify(myOrders));
}

function updateBellBadge() {
  const confirmedCount = myOrders.filter(o => o.status === 'confirmed').length;
  const badge = document.getElementById('bell-badge');
  if (badge) {
    badge.textContent = confirmedCount;
    badge.style.display = confirmedCount > 0 ? 'flex' : 'none';
  }
  const cartBadge = document.getElementById('cart-notify-badge');
  if (cartBadge) {
    cartBadge.textContent = confirmedCount;
    cartBadge.style.display = confirmedCount > 0 ? 'flex' : 'none';
  }
}

// يبني زر الجرس من جديد مع كل استدعاء لـrenderCart — عنصر عادي بترتيب محتوى السلة (صفر
// position:absolute على مستوى الصفحة)، فمستحيل يظهر برا صندوق السلة أو بأي صفحة تانية.
// بيظهر بس لما يكون في طلبات مرسلة فعلاً، وبيختفي تلقائياً مع أي إعادة رسم تصفّر الطلبات.
function renderBellRow() {
  if (!myOrders || myOrders.length === 0) return '';
  const confirmedCount = myOrders.filter(o => o.status === 'confirmed').length;
  return `
    <div class="cart-bell-row">
      <div class="cart-bell-wrap">
        <button id="bell-btn" class="bell-btn" onclick="toggleBellPanel()" aria-label="${t('bell_aria_label')}">
          <span class="bell-icon">🔔</span>
          <span class="bell-badge" id="bell-badge" style="${confirmedCount > 0 ? '' : 'display:none;'}">${confirmedCount}</span>
        </button>
        <div id="bell-panel" class="bell-panel" style="display:none"></div>
      </div>
    </div>`;
}

function toggleBellPanel() {
  const panel = document.getElementById('bell-panel');
  if (!panel) return;
  const willShow = panel.style.display === 'none';
  panel.style.display = willShow ? 'block' : 'none';
  if (willShow) renderBellPanel();
}

function renderBellPanel() {
  const panel = document.getElementById('bell-panel');
  if (!panel) return;
  if (!myOrders || myOrders.length === 0) {
    panel.innerHTML = `<div class="bell-panel-empty">${t('bell_empty')}</div>`;
    return;
  }
  const clearAllBtn = `
    <div class="orders-status-header">
      <button class="orders-clear-all-btn" onclick="dismissAllMyOrders()">${t('bell_clear_all')}</button>
    </div>`;
  const items = myOrders.map(o => {
    if (o.status === 'confirmed') {
      return `
        <div class="order-status-banner confirmed">
          <div class="order-status-banner-text">
            <span class="order-status-icon">✅</span>
            <span>${t('bell_confirmed_text')} (${escapeHtml(o.pharmacyName)})</span>
          </div>
          <button class="order-status-dismiss" onclick="dismissMyOrder(${o.id})" aria-label="${t('bell_dismiss_aria')}">✕</button>
        </div>`;
    }
    return `
      <div class="order-status-banner pending">
        <div class="order-status-banner-text">
          <span class="order-status-icon">⏳</span>
          <span>${t('bell_pending_prefix')} (${escapeHtml(o.pharmacyName)}) ${t('bell_pending_suffix')}</span>
        </div>
        <button class="order-status-dismiss" onclick="dismissMyOrder(${o.id})" aria-label="${t('bell_dismiss_aria')}">✕</button>
      </div>`;
  }).join('');
  panel.innerHTML = clearAllBtn + items;
}

// تحديث خفيف: بيحدّث العداد دائماً، وبيعيد رسم السلة كاملة بس لو كانت مفتوحة فعلاً وقت الحذف
// (لازم renderCart كاملة هون لأنه صف الجرس نفسه لازم يختفي لو صفرنا آخر طلب)
function refreshBellUI() {
  updateBellBadge();
  const cartSection = document.getElementById('cart-section');
  if (cartSection && cartSection.style.display !== 'none') renderCart();
}

function dismissMyOrder(id) {
  myOrders = myOrders.filter(o => o.id !== id);
  saveMyOrders();
  refreshBellUI();
}

// مسح كل إشعارات حالة الطلبات دفعة وحدة (مفيد لتنظيف طلبات تجريبية/مكررة قديمة بضغطة وحدة)
function dismissAllMyOrders() {
  myOrders = [];
  saveMyOrders();
  stopMyOrdersPolling();
  refreshBellUI();
}

let myOrdersPollInterval = null;

function startMyOrdersPolling() {
  if (myOrdersPollInterval) return;
  checkMyOrdersStatus();
  myOrdersPollInterval = setInterval(whenVisible(checkMyOrdersStatus), POLL_MY_ORDERS_MS);
}

function stopMyOrdersPolling() {
  if (myOrdersPollInterval) {
    clearInterval(myOrdersPollInterval);
    myOrdersPollInterval = null;
  }
}

async function checkMyOrdersStatus() {
  if (!myOrders || myOrders.length === 0) { stopMyOrdersPolling(); return; }
  try {
    const ids = myOrders.map(o => o.id).join(',');
    const res = await fetch(`${API}/orders/status?ids=${ids}`);
    const rows = await res.json();
    let newlyConfirmed = false;
    myOrders.forEach(local => {
      const found = rows.find(r => r.id === local.id);
      // لو الصيدلية حذفت الطلب من عندها (عادةً بعد ما تسلّمه/تجاوبت عليه)، منعتبره "تم التأكيد" ومنخليه
      // ظاهر بإشعارات المريض — لحد ما يمسحه هو بنفسه يدوياً، بدل ما يختفي تلقائياً من غير علمه
      if (!found) {
        if (local.status !== 'confirmed') { local.status = 'confirmed'; newlyConfirmed = true; }
        return;
      }
      if (found.status === 'confirmed' && local.status !== 'confirmed') {
        local.status = 'confirmed';
        newlyConfirmed = true;
      }
    });

    // ما منلمس أي عنصر بالصفحة إلا إذا صار تغيير فعلي — تجنباً لأي إعادة رسم بلا داعي
    if (newlyConfirmed) {
      saveMyOrders();
      refreshBellUI();
    }
    if (myOrders.every(o => o.status === 'confirmed')) stopMyOrdersPolling();
  } catch (err) { /* تجاهل بصمت، رح يعيد المحاولة بالجولة الجاية */ }
}

// ================= حالة الفتح والإغلاق =================
// المشكلة التي تحلها: مريض يبحث ليلاً فيرى "متوفر"، فيرسل طلباً لا يأتيه رد،
// ثم يتصل بالصيدلي في ساعة متأخرة فيزعجه.
//
// الحساب آلي من ساعات الدوام المحفوظة، لا بزر يضغطه الصيدلي يومياً. الزر اليدوي
// يفترض التزاماً مرتين كل يوم طوال السنة، وأول ليلة يُنسى فيها تعود المشكلة أسوأ.

const DAMASCUS_TZ = 'Asia/Damascus';

// الوقت الحالي بدمشق بالدقائق منذ منتصف الليل.
// نحسب بتوقيت دمشق صراحةً لا بتوقيت جهاز المريض: قد يفتح الموقع من الخليج أو
// أوروبا، والصيدلية في سوريا. وIntl يتولى التوقيت الصيفي إن وُجد.
function damascusNowMinutes() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: DAMASCUS_TZ, hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  const h = Number(parts.find(p => p.type === 'hour').value);
  const m = Number(parts.find(p => p.type === 'minute').value);
  return h * 60 + m;
}

function damascusTodayDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DAMASCUS_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

// "HH:MM" إلى دقائق. نُرجع null لأي قيمة تالفة بدل صفر، فالصفر وقت صحيح
// (منتصف الليل) وخلطه بالتالف يُنتج حالة خاطئة.
function timeToMinutes(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

// تنسيق الوقت للعرض. نعرضه كما هو بنظام 24 ساعة: مألوف في سوريا، ويتجنّب
// التباس ص/م الذي قد يجعل المريض يظن أن الصيدلية تفتح الثامنة مساءً.
function formatTime(hhmm) {
  return typeof hhmm === 'string' ? hhmm : '';
}

// حالة الصيدلية الآن.
// تُرجع null حين لا نعرف: صيدلية بلا ساعات محفوظة لا تُعرض لها أي حالة، فلا
// ندّعي ما لا نعرف — نفس مبدأ زر واتساب وزر الاتجاهات.
//
// ترتيب الأولويات مقصود:
//   1) المناوبة تتجاوز كل شيء: صيدلية مناوبة الليلة مفتوحة وإن قال جدولها غير ذلك.
//   2) الإغلاق الاستثنائي لليوم يتجاوز الجدول المعتاد.
//   3) الجدول المعتاد.
function pharmacyOpenState(p) {
  if (!p) return null;

  if (p.on_duty === true) {
    return { open: true, reason: 'duty', opensAt: p.opens_at || null };
  }

  const opens = timeToMinutes(p.opens_at);
  const closes = timeToMinutes(p.closes_at);
  const hasHours = opens !== null && closes !== null && opens !== closes;

  // إغلاق استثنائي معلن لليوم نفسه. نقارن التاريخ لا نكتفي بوجود القيمة،
  // فيسقط الإعلان تلقائياً غداً دون أي إجراء من الصيدلي.
  if (p.closed_override_date && p.closed_override_date === damascusTodayDate()) {
    return { open: false, reason: 'today', opensAt: hasHours ? p.opens_at : null };
  }

  if (!hasHours) return null;

  const now = damascusNowMinutes();
  // دوام ممتد بعد منتصف الليل (مثل 09:00 إلى 01:00): وقت الإغلاق أصغر من الفتح،
  // فالفترة المفتوحة هي اتحاد المجالين لا ما بينهما.
  const isOpen = closes > opens
    ? (now >= opens && now < closes)
    : (now >= opens || now < closes);

  return { open: isOpen, reason: 'schedule', opensAt: p.opens_at };
}

// شارة الحالة ببطاقة النتيجة وبطاقة المناوبة
function openStateBadgeHtml(p) {
  const st = pharmacyOpenState(p);
  if (!st) return '';
  if (st.open) return `<span class="open-badge open">🟢 ${t('open_now_badge')}</span>`;
  if (st.reason === 'today') return `<span class="open-badge closed">🔴 ${t('closed_today_badge')}</span>`;
  return `<span class="open-badge closed">🔴 ${tFormat('closed_opens_at', { time: formatTime(st.opensAt) })}</span>`;
}

// ================= الاتجاهات على الخريطة =================
// قرار تصميمي: رابط خرائط جوجل، لا خريطة مدمجة.
// السبب: الخريطة المدمجة تتطلب مفتاح Google Maps API وحساب فوترة ببطاقة — غير متاح
// من سوريا. والرابط مجاني تماماً، ويعطي المريض أكثر مما تعطيه أي خريطة مدمجة:
// ملاحة صوتية ومساراً وزحاماً مباشرة داخل تطبيق الخرائط على هاتفه.
//
// قرار ثانٍ: لا يظهر الزر إلا لصيدلية لها إحداثيات محفوظة — نفس مبدأ زر واتساب.
// البديل (بحث بالاسم والمدينة) يقود المريض غالباً إلى لا نتيجة، وزر لا يوصل
// إلى شيء يقرأه المريض كعطل في المنصة لا كنقص في بيانات الصيدلية.

// هل للصيدلية موقع صالح؟ نتحقق من الاثنين معاً: إحداثي واحد بلا الآخر بلا معنى.
function hasLocation(lat, lng) {
  // نرفض الفراغ صراحةً قبل التحويل: Number(null) و Number('') يعطيان صفراً،
  // فنصف موقع (خط عرض موجود وخط طول مفقود) كان يمر كنقطة (35.01, 0) —
  // موقع حقيقي على الخريطة لكنه ليس موقع الصيدلية إطلاقاً.
  const blank = v => v === undefined || v === null
    || (typeof v === 'string' && v.trim() === '')
    || (typeof v !== 'number' && typeof v !== 'string');
  if (blank(lat) || blank(lng)) return false;

  const a = Number(lat), b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a === 0 && b === 0) return false;           // خطأ شائع لا موقع حقيقي
  return a >= -90 && a <= 90 && b >= -180 && b <= 180;
}

// رابط الاتجاهات. api=1 هي الصيغة العامة الموثَّقة من جوجل: تفتح التطبيق على
// الهاتف والموقع على الحاسوب، وتبدأ المسار من موقع المستخدم الحالي تلقائياً.
function directionsLink(lat, lng) {
  if (!hasLocation(lat, lng)) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${Number(lat)},${Number(lng)}`;
}

// رابط معاينة نقطة (يستخدمه الصيدلي للتأكد من موقعه المحفوظ)
function mapPreviewLink(lat, lng) {
  if (!hasLocation(lat, lng)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${Number(lat)},${Number(lng)}`;
}

// noopener/noreferrer إلزامي أمنياً مع target=_blank: بدونه تتحكم الصفحة المفتوحة
// بصفحتنا عبر window.opener.
function openDirections(lat, lng) {
  const url = directionsLink(lat, lng);
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function onDirectionsClick(btn) {
  openDirections(btn.getAttribute('data-lat'), btn.getAttribute('data-lng'));
}

// زر الاتجاهات ببطاقة النتيجة وبطاقة المناوبة
function directionsBtnHtml(lat, lng) {
  if (!hasLocation(lat, lng)) return '';
  return `<button type="button" class="directions-btn" data-lat="${escapeHtml(String(lat))}"
            data-lng="${escapeHtml(String(lng))}" title="${t('directions_btn_title')}"
            onclick="onDirectionsClick(this)">
            <span class="directions-icon">🗺️</span> ${t('directions_btn')}
          </button>`;
}

// ================= تكامل واتساب =================
// قرار تصميمي: روابط wa.me مباشرة، صفر WhatsApp Business API.
// السبب: الـAPI الرسمي يتطلب حساب أعمال موثَّقاً ورقماً مخصصاً وتكلفة شهرية لكل محادثة
// وموافقة من Meta، وخادماً يستقبل Webhooks لا ينام — وخطة Render المجانية تنام.
// رابط wa.me يحقق الهدف نفسه للمريض بصفر تكلفة وصفر تبعية خارجية.
//
// قرار ثانٍ: المنصة لا تتوسط المحادثة. المريض يراسل الصيدلية مباشرة، فلا تتحول
// المنصة (ولا مالكها) إلى مكتب دعم يتلقى أسئلة دوائية ليلاً — وهذا يجعل النموذج
// قابلاً للتوسع فعلاً.

// بناء رابط واتساب. نرجّع null لا رابطاً معطوباً حين لا يوجد رقم،
// حتى يقرر المستدعي إخفاء الزر بدل عرض رابط ميت.
function waLink(phone, message) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message || '')}`;
}

// فتح محادثة واتساب. noopener/noreferrer إلزامي أمنياً مع target=_blank:
// بدونه تستطيع الصفحة المفتوحة التحكم بصفحتنا عبر window.opener.
function openWhatsapp(phone, message) {
  const url = waLink(phone, message);
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

// زر واتساب داخل بطاقة نتيجة البحث — برسالة جاهزة تذكر اسم الدواء.
// فائدتها مزدوجة: المريض لا يكتب شيئاً، والصيدلي يعرف عمّ يُسأل فور فتح المحادثة.
function waResultBtnHtml(phone, medicineName) {
  if (!phone) return '';
  const msg = tFormat('wa_msg_medicine', { medicine: medicineName });
  // نمرّر القيم عبر data-* لا داخل onclick: أسماء الأدوية قد تحوي علامات اقتباس
  // تكسر السمة، وescapeHtml وحده لا يكفي داخل سياق JavaScript.
  return `<button type="button" class="wa-result-btn" data-wa-phone="${escapeHtml(phone)}"
            data-wa-msg="${escapeHtml(msg)}" onclick="onWaResultClick(this)">
            <span class="wa-icon">💬</span> ${t('wa_result_btn')}
          </button>`;
}

function onWaResultClick(btn) {
  openWhatsapp(btn.getAttribute('data-wa-phone'), btn.getAttribute('data-wa-msg'));
}

// ---------- لوحة الاستشارة الدوائية ----------
// مدخل مستقل عن البحث عن دواء عن قصد: أسئلة الوصفة غير الواضحة والجرعة والبديل
// الدوائي لا تبدأ باسم دواء، فلا يخدمها زر داخل نتيجة بحث.
let waPanelOpen = false;

function openWhatsappPanel() {
  const panel = document.getElementById('wa-panel');
  if (!panel) return;
  waPanelOpen = true;
  panel.style.display = 'flex';
  document.body.classList.add('wa-panel-lock');   // منع تمرير الصفحة خلف اللوحة
  loadWhatsappPharmacies();
  // نقل التركيز للوحة: ضروري لمستخدمي لوحة المفاتيح وقارئات الشاشة
  const closeBtn = document.getElementById('wa-panel-close');
  if (closeBtn) closeBtn.focus();
}

function closeWhatsappPanel() {
  const panel = document.getElementById('wa-panel');
  if (!panel) return;
  waPanelOpen = false;
  panel.style.display = 'none';
  document.body.classList.remove('wa-panel-lock');
}

// إغلاق بالنقر على الخلفية فقط، لا على محتوى اللوحة نفسه
function onWaOverlayClick(e, el) {
  if (e.target === el) closeWhatsappPanel();
}

async function loadWhatsappPharmacies() {
  const list = document.getElementById('wa-panel-list');
  if (!list) return;
  list.innerHTML = `<p class="muted" style="padding:14px 2px;">${t('wa_consult_loading')}</p>`;
  try {
    // نحترم فلتر المدينة المختار بالصفحة الرئيسية: المريض يريد صيدلية يمكنه زيارتها
    const cityParam = currentCity ? `?city=${encodeURIComponent(currentCity)}` : '';
    const res = await fetch(`${API}/pharmacies/whatsapp${cityParam}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    // اللوحة قد تُغلق بينما الطلب جارٍ — نتجاهل النتيجة حينها بدل الكتابة فوق DOM مخفي
    if (!waPanelOpen) return;

    if (!Array.isArray(data) || data.length === 0) {
      list.innerHTML = `<p class="muted" style="padding:14px 2px;">${currentCity ? t('wa_consult_empty_city') : t('wa_consult_empty')}</p>`;
      return;
    }
    list.innerHTML = data.map(p => {
      const msg = t('wa_msg_consult');
      return `
        <div class="wa-pharmacy-row">
          <div class="wa-pharmacy-info">
            <span class="wa-pharmacy-name"><bdi>${escapeHtml(p.name)}</bdi>${verifiedBadgeHtml(p.verified)}</span>
            <span class="wa-pharmacy-meta">
              ${p.city ? `<span>📍 <bdi>${escapeHtml(cityName(p.city))}</bdi></span>` : ''}
              ${p.address ? `<span class="admin-ph-sep">•</span><span><bdi>${escapeHtml(p.address)}</bdi></span>` : ''}
              ${p.on_duty ? `<span class="badge yes">${t('wa_onduty_now')}</span>` : ''}
            </span>
          </div>
          <button type="button" class="wa-chat-btn" data-wa-phone="${escapeHtml(p.whatsapp_phone)}"
                  data-wa-msg="${escapeHtml(msg)}" onclick="onWaResultClick(this)">
            <span class="wa-icon">💬</span> ${t('wa_chat_btn')}
          </button>
        </div>`;
    }).join('');
  } catch (err) {
    if (!waPanelOpen) return;
    list.innerHTML = `<p class="muted" style="padding:14px 2px;">${t('wa_consult_error')}</p>`;
  }
}

// Escape يغلق اللوحة — متوقَّع في أي نافذة منبثقة، وضروري لمن يتنقل بلوحة المفاتيح.
// نستخدم capture ونتحقق من فتح اللوحة أولاً حتى لا نعترض Escape الخاص بأي عنصر آخر.
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && waPanelOpen) {
    e.preventDefault();
    closeWhatsappPanel();
  }
});

function whatsappComingSoon() {
  customAlert(t('whatsapp_coming_soon'), 'info');
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
  customAlert(t('contact_coming_soon'), 'info');
}

// نافذة عامة لعرض محتوى طويل (الأسئلة الشائعة، حول الموقع) — منفصلة عن showModal المخصصة للتنبيهات القصيرة
let infoModalEscHandler = null;

function openInfoModal() {
  document.getElementById('info-modal-overlay').style.display = 'flex';
  document.body.classList.add('modal-open');
  infoModalEscHandler = (e) => { if (e.key === 'Escape') closeInfoModal(); };
  document.addEventListener('keydown', infoModalEscHandler);
}

function closeInfoModal() {
  document.getElementById('info-modal-overlay').style.display = 'none';
  document.body.classList.remove('modal-open');
  if (infoModalEscHandler) {
    document.removeEventListener('keydown', infoModalEscHandler);
    infoModalEscHandler = null;
  }
}

// أزواج مفاتيح (سؤال، جواب) — مقسّمة لقسمين (مريض/زائر، ثم صيدلي) — النصوص كلها ثابتة من قاموس الترجمة، مش بيانات مستخدم
const FAQ_PATIENT_KEYS = [
  ['faq_q1', 'faq_a1'], ['faq_q2', 'faq_a2'], ['faq_q3', 'faq_a3'], ['faq_q4', 'faq_a4'],
  ['faq_q5', 'faq_a5'], ['faq_q6', 'faq_a6'], ['faq_q7', 'faq_a7']
];
const FAQ_PHARMACIST_KEYS = [
  ['faq_q8', 'faq_a8'], ['faq_q9', 'faq_a9'], ['faq_q10', 'faq_a10'],
  ['faq_q11', 'faq_a11'], ['faq_q12', 'faq_a12'], ['faq_q13', 'faq_a13'], ['faq_q14', 'faq_a14']
];

function renderFaqItems(keys) {
  return keys.map(([qKey, aKey]) => `
    <details class="faq-item">
      <summary>${escapeHtml(t(qKey))}</summary>
      <p>${escapeHtml(t(aKey))}</p>
    </details>
  `).join('');
}

function showFaq() {
  document.getElementById('info-modal-title').textContent = t('faq_title');
  document.getElementById('info-modal-body').innerHTML = `
    <h3>${escapeHtml(t('faq_section_patient'))}</h3>
    ${renderFaqItems(FAQ_PATIENT_KEYS)}
    <h3>${escapeHtml(t('faq_section_pharmacist'))}</h3>
    ${renderFaqItems(FAQ_PHARMACIST_KEYS)}
  `;
  openInfoModal();
}

function showAboutUs() {
  document.getElementById('info-modal-title').textContent = t('about_title');
  document.getElementById('info-modal-body').innerHTML = t('about_content_html');
  openInfoModal();
}

function formatTime12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  const mm = String(m).padStart(2, '0');
  if (currentLang === 'en') {
    return `${hour12}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  return `${hour12}:${mm} ${h >= 12 ? 'م' : 'ص'}`;
}

// أيام الأسبوع وفترات المناوبة قيم ثابتة معروفة (مش نص حر)، فآمن نترجم عرضها فقط
const DUTY_DAY_EN = { 'الأحد': 'Sunday', 'الاثنين': 'Monday', 'الثلاثاء': 'Tuesday', 'الأربعاء': 'Wednesday', 'الخميس': 'Thursday', 'الجمعة': 'Friday', 'السبت': 'Saturday' };
const DUTY_SHIFT_EN = { 'طوال اليوم': 'All day', 'صباحاً': 'Morning only', 'مساءً': 'Evening only' };
function translateDutyDay(day) { return currentLang === 'en' ? (DUTY_DAY_EN[day] || day) : day; }
function translateDutyShift(shift) { return currentLang === 'en' ? (DUTY_SHIFT_EN[shift] || shift) : shift; }

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
            <p class="empty-title">${t('onduty_empty_title')}</p>
            <p class="empty-subtitle">${t('onduty_empty_subtitle')}</p>
          </div>
        </div>
      `;
      return;
    }
    container.innerHTML = `
      <div class="duty-wrap">
        <h3>${t('onduty_title')}</h3>
        <div class="duty-grid">
          ${data.map(p => {
            const extras = [];
            if (p.on_duty_shift && p.on_duty_shift !== 'طوال اليوم') extras.push(translateDutyShift(p.on_duty_shift));
            if (p.on_duty_start_time && p.on_duty_end_time) extras.push(`${formatTime12(p.on_duty_start_time)} - ${formatTime12(p.on_duty_end_time)}`);
            const timeLine = translateDutyDay(p.on_duty_day || '') + (extras.length ? ` (${extras.join('، ')})` : '');
            return `
              <div class="duty-card">
                <div class="duty-card-top">
                  <span class="duty-card-name"><bdi>${escapeHtml(p.name)}</bdi>${verifiedBadgeHtml(p.verified)}${openStateBadgeHtml(p)}${p.city ? ` <span class="muted" style="font-size:13px;">- <bdi>${escapeHtml(cityName(p.city))}</bdi></span>` : ''}</span>
                  ${hasLocation(p.latitude, p.longitude) ? `<div class="duty-card-actions">${directionsBtnHtml(p.latitude, p.longitude)}</div>` : ''}
                  <span class="duty-status-badge">${t('onduty_now_badge')}</span>
                </div>
                ${p.address ? `<div class="duty-card-row"><span class="duty-icon">📍</span> ${escapeHtml(p.address)}</div>` : ''}
                ${p.phone ? `<div class="duty-card-row"><span class="duty-icon">📞</span> ${escapeHtml(p.phone)}</div>` : ''}
                ${p.assistant_phone ? `<div class="duty-card-row"><span class="duty-icon">📱</span> ${escapeHtml(p.assistant_phone)} <span class="muted" style="font-size:12px;">(${t('assistant_phone_label')})</span></div>` : ''}
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

// آخر نتائج بحث كاملة (دواء/مستحضر تجميل) — نستخدمها لتمرير مُعرّفات رقمية بس بالـonclick بدل النص الخام (حماية من كسر السمة)
let lastSearchResultsCache = [];

// ذاكرة مؤقتة لآخر بيانات مخزون/طلبات الصيدلي — عشان تبديل اللغة يعيد الرسم بس، بدون طلبات شبكة جديدة
let pharmacistStockCache = [];
let pharmacistOrdersCache = [];

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
        <p class="empty-title">${t('nursing_empty_title')}</p>
        <p class="empty-subtitle">${t('nursing_empty_subtitle')}</p>
      </div>`;
  }
  return nurses.map(n => `
    <div class="result-card">
      <div class="result-card-top">
        <span class="result-med-name">👤 ${escapeHtml(n.name)}</span>
        <span class="badge ${n.available ? 'yes' : 'no'}">${n.available ? t('nurse_available_full') : t('nurse_unavailable_full')}</span>
      </div>
      <div class="result-row">🎓 ${escapeHtml(n.specialty || t('general_nurse_label'))}</div>
      <div class="result-row">
        ${n.rating_count > 0
          ? `${renderStars(n.avg_rating)} ${Number(n.avg_rating).toFixed(1)} ${tFormat('rating_summary_suffix', { count: n.rating_count })}`
          : `<span class="muted">${t('no_ratings_yet_short')}</span>`}
      </div>
      <button class="btn-outline blue small" onclick="toggleNurseDetail(${n.id})">${t('view_profile_btn')}</button>
      <div id="nurse-detail-${n.id}" style="display:none; margin-top:12px;"></div>
    </div>
  `).join('');
}

async function loadNurses() {
  const container = document.getElementById('nurses-list');
  container.innerHTML = `<p class="muted">${t('loading_text')}</p>`;
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
        <p class="empty-title">${t('server_error_title')}</p>
        <p class="empty-subtitle">${t('server_error_subtitle')}</p>
      </div>`;
  }
}

// ---------- تحديث دوري لصفحة التمريض (عشان يظهر رأي المريض فور موافقة الإدارة عليه) ----------

let nursingPollInterval = null;
let lastNursesSnapshot = null;

function startNursingPolling() {
  stopNursingPolling();
  nursingPollInterval = setInterval(whenVisible(pollNurses), POLL_NURSES_MS);
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
  panel.innerHTML = `<p class="muted">${t('loading_text')}</p>`;

  let ratings = [];
  try {
    const res = await fetch(`${API}/nurses/${nurseId}/ratings`);
    ratings = await res.json();
  } catch (err) { /* بنكمل بعرض الملخص حتى لو فشل جلب التعليقات */ }

  const alreadyRated = hasRatedNurse(nurseId);

  panel.innerHTML = `
    <div class="box">
      ${nurse && nurse.university ? `<div class="result-row">🎓 ${escapeHtml(nurse.university)}${nurse.graduation_year ? ` - ${t('grad_year_label')} ${escapeHtml(nurse.graduation_year)}` : ''}</div>` : ''}
      ${nurse && nurse.phone ? `<div class="result-row">📞 ${escapeHtml(nurse.phone)}</div>` : ''}
      <hr style="border:none; border-top:1px solid #eef2f6; margin:14px 0;">
      <p style="font-weight:700; margin:0 0 8px;">${tFormat('patient_reviews_title', { count: ratings.length })}</p>
      ${ratings.length === 0
        ? `<p class="muted" style="margin:0 0 12px;">${t('no_published_reviews')}</p>`
        : ratings.map(r => `
          <div style="padding:8px 0; border-bottom:1px solid #f2f5f8;">
            <div>${renderStars(r.stars)}</div>
            ${r.comment ? `<p style="margin:4px 0 0; font-size:14px; color:#3a4a58;">${escapeHtml(r.comment)}</p>` : ''}
          </div>
        `).join('')
      }
      <hr style="border:none; border-top:1px solid #eef2f6; margin:14px 0;">
      <p style="font-weight:700; margin:0 0 8px;">${t('rate_this_nurse_title')}</p>
      ${alreadyRated
        ? `<p class="muted">${t('already_rated_msg')}</p>`
        : `
          <div class="star-picker" id="rating-stars-${nurseId}">
            ${[1, 2, 3, 4, 5].map(i => `<button type="button" onclick="setRatingStars(${nurseId}, ${i})" data-i="${i}" aria-label="${starAriaLabel(i)}" aria-pressed="false">☆</button>`).join('')}
          </div>
          <textarea id="rating-comment-${nurseId}" placeholder="${t('comment_placeholder')}" rows="2" style="width:100%; padding:10px 14px; border:1px solid #cfe0ef; border-radius:14px; font-family:inherit; font-size:15px; resize:vertical; margin-bottom:10px;"></textarea>
          <input id="rating-name-${nurseId}" placeholder="${t('your_name_placeholder')}" aria-label="${t('your_name_placeholder')}">
          <input id="rating-phone-${nurseId}" placeholder="${t('your_phone_placeholder')}" aria-label="${t('your_phone_placeholder')}" type="tel" inputmode="numeric" oninput="digitsOnly(this)">
          <button class="primary" onclick="submitNurseRating(${nurseId})">${t('submit_rating_btn')}</button>
        `}
    </div>
  `;
}

const selectedNurseStars = {};

// وصف عربي صحيح لكل نجمة حسب قواعد العدد (واحدة/اثنتين/3 فما فوق)
function starAriaLabel(i) {
  if (i === 1) return t('star_rate_one');
  if (i === 2) return t('star_rate_two');
  return tFormat('star_rate_n', { n: i });
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
  if (!stars) { customAlert(t('select_stars_first'), 'warning'); return; }
  const name = document.getElementById(`rating-name-${nurseId}`).value.trim();
  const phone = document.getElementById(`rating-phone-${nurseId}`).value.trim();
  const comment = document.getElementById(`rating-comment-${nurseId}`).value.trim();
  if (!name || !phone) { customAlert(t('name_phone_required'), 'warning'); return; }
  try {
    const res = await fetch(`${API}/nurses/${nurseId}/ratings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_name: name, patient_phone: phone, stars, comment })
    });
    const data = await res.json();
    if (!res.ok) { customAlert(translateApiError(data.error), 'error'); return; }
    markNurseAsRated(nurseId);
    await customAlert(t('rating_submitted_success'), 'success');
    renderNurseDetail(nurseId);
  } catch (err) {
    customAlert(t('server_error_title'), 'error');
  }
}

function uploadCertificateComingSoon() {
  customAlert(t('upload_cert_coming_soon'), 'info');
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
      <div class="suggestion-item" role="option" id="suggestion-${i}" aria-selected="false" onclick="pickSuggestion(this)">
        ${t('suggest_did_you_mean')} <strong class="suggestion-name-text">${escapeHtml(m.name)}</strong>${t('q_mark')}
        ${m.generic_name ? `<span class="generic-hint"> (${escapeHtml(m.generic_name)})</span>` : ''}
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

async function pickSuggestion(el) {
  const nameEl = el.querySelector('.suggestion-name-text');
  const name = nameEl ? nameEl.textContent : '';
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

// إظهار شريط "تحديث النتائج" فقط حين توجد نتائج معروضة فعلاً
function setResultsToolbar(visible) {
  const bar = document.getElementById('results-toolbar');
  if (bar) bar.style.display = visible ? 'flex' : 'none';
}

// إعادة تنفيذ البحث نفسه بنقرة. السبب: نتائج البحث لقطة للحظة تنفيذها، وقد يبدّل
// الصيدلي التوفر بينما المريض ينظر إليها — فبدل أن يمسح الكلمة ويكتبها من جديد، ينقر هنا.
async function refreshResults(btn) {
  if (btn) { btn.disabled = true; btn.textContent = t('refreshing_results'); }
  try {
    await runSearch();
  } finally {
    // الزر قد يكون أُعيد بناؤه أثناء التحديث، فنجلبه من جديد بدل الاعتماد على المرجع القديم
    const b = document.getElementById('refresh-results-btn');
    if (b) { b.disabled = false; b.textContent = t('refresh_results_btn'); }
  }
}

async function runSearch() {
  const q = document.getElementById('search').value.trim();
  const container = document.getElementById('results');
  if (!q) {
    container.innerHTML = '';
    setResultsToolbar(false);
    return;
  }
  container.innerHTML = `<p class="muted">${t('loading_text')}</p>`;
  // لو المستخدم غيّر أو مسح خانة البحث وقت ما كنا منتظرين رد السيرفر، نتجاهل هالرد القديم بالكامل —
  // تفادياً لمشكلة نتيجة بحث قديمة ترجع وتطلع فوق نتيجة أحدث أو فوق خانة بحث فاضية
  const stillCurrent = () => document.getElementById('search').value.trim() === q;
  try {
    const cityParam = currentCity ? `&city=${encodeURIComponent(currentCity)}` : '';
    const res = await fetchWithTimeout(`${API}/medicines/search?q=${encodeURIComponent(q)}&category=${currentCategory}${cityParam}`, {}, 20000);
    const data = await res.json();
    if (!stillCurrent()) return;
    lastSearchResultsCache = data;
    setResultsToolbar(true);

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
                <div style="cursor:pointer; color:#185fa5; padding:6px 0;" onclick="pickSuggestion(this)">
                  <span class="suggestion-name-text">${escapeHtml(m.name)}</span>${m.generic_name ? ' - ' + escapeHtml(m.generic_name) : ''}
                </div>
              `).join('')}
            </div>`;
        }
      } catch (err) { /* تجاهل فشل الاقتراحات، النتيجة الأساسية أهم */ }
      if (!stillCurrent()) return;
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
              <span class="result-med-name"><span class="result-icon">${currentCategory === 'cosmetic' ? '💄' : '💊'}</span> ${escapeHtml(item.medicine.name)}</span>
              ${a.manages_stock
                ? `<span class="badge ${a.available ? 'yes' : 'no'}">${a.available ? t('available_badge') : t('unavailable_badge')}</span>`
                : `<span class="badge neutral">${t('stock_unmanaged_badge')}</span>`}
              ${openStateBadgeHtml(a)}
            </div>
            <div class="result-row">${t('active_ingredient_label')} ${escapeHtml(item.medicine.generic_name) || '-'}</div>
            <div class="result-pharmacy">
              <span class="result-icon">📍</span>
              <span class="result-pharmacy-info">
                <span class="result-pharmacy-name"><bdi>${escapeHtml(a.pharmacy_name)}</bdi>${verifiedBadgeHtml(a.verified)}</span>
                ${(a.city || a.address) ? `<span class="result-pharmacy-meta">
                  ${a.city ? `<bdi>${escapeHtml(cityName(a.city))}</bdi>` : ''}
                  ${(a.city && a.address) ? '<span class="admin-ph-sep">•</span>' : ''}
                  ${a.address ? `<bdi>${escapeHtml(a.address)}</bdi>` : ''}
                </span>` : ''}
              </span>
            </div>
            ${a.phone ? `<div class="result-row"><span class="result-icon">📞</span> ${escapeHtml(a.phone)}</div>` : ''}
            ${a.assistant_phone ? `<div class="result-row"><span class="result-icon">📱</span> ${escapeHtml(a.assistant_phone)} <span class="muted" style="font-size:12px;">(${t('assistant_phone_label')})</span></div>` : ''}
            ${a.manages_stock
              ? stockFreshnessHtml(a.stock_updated_at)
              : `<div class="stock-unmanaged-note">${t('stock_unmanaged_note')}</div>`}
            <div class="result-actions">
              ${(a.manages_stock && a.available) ? (() => {
                const st = pharmacyOpenState(a);
                const closed = st && !st.open;
                return `<button class="result-add-btn-full${closed ? ' closed' : ''}"
                          onclick="addToCart(${item.medicine.id}, ${a.pharmacy_id}, this)"
                          ${closed ? `data-closed-notice="${escapeHtml(st.reason === 'today' ? t('cart_closed_notice_today') : tFormat('cart_closed_notice', { time: formatTime(st.opensAt) }))}"` : ''}>
                          ${closed ? t('cart_closed_btn') : t('add_to_cart_btn')}
                        </button>`;
              })() : ''}
              ${(a.whatsapp_phone || hasLocation(a.latitude, a.longitude)) ? `<div class="result-actions-secondary">
                ${waResultBtnHtml(a.whatsapp_phone, item.medicine.name)}
                ${directionsBtnHtml(a.latitude, a.longitude)}
              </div>` : ''}
            </div>
          </div>
        `;
      });

      if (!anyAvailable && item.medicine.generic_name) {
        try {
          const altCityParam = currentCity ? `&city=${encodeURIComponent(currentCity)}` : '';
          const altRes = await fetch(`${API}/medicines/search?q=${encodeURIComponent(item.medicine.generic_name)}&category=${currentCategory}${altCityParam}`);
          const altData = await altRes.json();
          const alternatives = altData
            .filter(alt => alt.medicine.id !== item.medicine.id)
            .map(alt => ({ medicine: alt.medicine, availability: alt.availability.filter(a => a.available) }))
            .filter(alt => alt.availability.length > 0);

          if (alternatives.length > 0) {
            cardsHtml += `
              <div class="alt-suggestion-box">
                <p class="alt-suggestion-title">${currentCategory === 'cosmetic' ? '💄' : '💊'} "${escapeHtml(item.medicine.name)}" ${t('alt_unavailable_but')} (${escapeHtml(item.medicine.generic_name)}):</p>
                ${alternatives.map(alt => alt.availability.map(a => `
                  <div class="alt-suggestion-row">
                    <span>${escapeHtml(alt.medicine.name)} <span class="muted">- ${escapeHtml(a.pharmacy_name)}</span></span>
                    <button class="btn-outline blue small" onclick="pickSuggestion(this)"><span class="suggestion-name-text" hidden>${escapeHtml(alt.medicine.name)}</span>${t('alt_view_btn')}</button>
                  </div>
                `).join('')).join('')}
              </div>
            `;
          }
        } catch (err) { /* تجاهل فشل البحث عن بدائل، النتيجة الأساسية أهم */ }
      }
    }
    if (!stillCurrent()) return;
    container.innerHTML = cardsHtml;
  } catch (err) {
    if (!stillCurrent()) return;
    // رسالة تذكر السبب وما يفعله المريض، مع زر إعادة محاولة مباشر بدل أن
    // يضطر لمسح كلمة البحث وإعادة كتابتها.
    const kind = classifyFetchError(err);
    const subtitle = kind === 'offline' ? t('err_offline')
                   : kind === 'timeout' ? t('err_timeout_search')
                   : t('err_network');
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${kind === 'offline' ? '📡' : '⚠️'}</div>
        <p class="empty-title">${t('server_error_title')}</p>
        <p class="empty-subtitle">${subtitle}</p>
        <button type="button" class="refresh-results-btn" style="margin-top:12px;" onclick="runSearch()">${t('refresh_results_btn')}</button>
      </div>`;
  }
}

// ---------- لوحة الصيدلي ----------

function renderPharmacyAuthForm() {
  document.getElementById('pharmacist-dashboard').style.display = 'none';
  document.getElementById('pharmacist-auth-section').innerHTML = `
    <div class="auth-box">
      <h3 style="margin-top:0;">${t('pharm_login_title')}</h3>
      <p class="muted" style="margin-top:-8px;">${t('pharm_login_no_account')}</p>
      <input id="login-username" type="text" placeholder="${t('username_placeholder')}" onkeydown="if(event.key==='Enter') login()">
      <div class="password-field">
        <input id="login-password" type="password" placeholder="${t('password_placeholder')}" onkeydown="if(event.key==='Enter') login()">
        <button type="button" class="toggle-password" onclick="togglePassword('login-password', this)" aria-label="${t('show_password_aria')}">👁</button>
      </div>
      <button class="primary" onclick="login()">${t('login_btn')}</button>
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
    if (!res.ok) { customAlert(translateApiError(data.error), 'error'); return; }
    currentPharmacy = { ...data, username, password };
    loadDashboard();
  } catch (err) {
    customAlert(t('server_error_title'), 'error');
  }
}

function loadDashboard() {
  document.getElementById('pharmacist-auth-section').innerHTML = '';
  document.getElementById('pharmacist-dashboard').style.display = 'block';
  document.getElementById('pharmacy-label').innerHTML = `
    <span style="font-weight:500; font-size:16px;">${t('pharmacy_label_prefix')} ${escapeHtml(currentPharmacy.name)}</span>
    <button class="action-pill-btn blue" onclick="logout()">${t('logout_btn')}</button>
  `;
  document.getElementById('duty-checkbox').checked = !!currentPharmacy.on_duty;
  document.getElementById('assistant-phone-input').value = currentPharmacy.assistant_phone || '';
  document.getElementById('whatsapp-phone-input').value = currentPharmacy.whatsapp_phone || '';
  document.getElementById('location-paste-input').value =
    hasLocation(currentPharmacy.latitude, currentPharmacy.longitude)
      ? `${currentPharmacy.latitude}, ${currentPharmacy.longitude}` : '';
  renderSavedLocation();
  document.getElementById('hours-opens-input').value = currentPharmacy.opens_at || '';
  document.getElementById('hours-closes-input').value = currentPharmacy.closes_at || '';
  renderPharmacyHours();
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
    if (!res.ok) { customAlert(translateApiError(data.error), 'error'); return; }
    currentPharmacy.on_duty = data.on_duty;
    currentPharmacy.on_duty_day = data.on_duty_day;
    currentPharmacy.on_duty_shift = data.on_duty_shift;
    currentPharmacy.on_duty_start_time = data.on_duty_start_time;
    currentPharmacy.on_duty_end_time = data.on_duty_end_time;
    refreshStock();
    customAlert(t('duty_saved_success'), 'success');
  } catch (err) {
    customAlert(t('server_error_title'), 'error');
  }
}

// ---------- ساعات الدوام (لوحة الصيدلي) ----------

// عرض الدوام المحفوظ وحالة الإغلاق الاستثنائي
function renderPharmacyHours() {
  const box = document.getElementById('hours-current');
  if (!box) return;
  const p = currentPharmacy || {};
  const opens = p.opens_at, closes = p.closes_at;
  const hasHours = timeToMinutes(opens) !== null && timeToMinutes(closes) !== null && opens !== closes;

  let html = '';
  if (!hasHours) {
    html = `<span class="muted">${t('hours_none')}</span>`;
  } else {
    // ننبّه للدوام الممتد بعد منتصف الليل: الصيدلي قد يظن أنه أخطأ الإدخال
    const overnight = timeToMinutes(closes) < timeToMinutes(opens);
    html = `<span class="muted">${t('hours_current')}</span>
      <bdi class="hours-value">${escapeHtml(opens)} ${t('hours_to')} ${escapeHtml(closes)}</bdi>
      ${overnight ? `<span class="hours-overnight">${t('hours_overnight_note')}</span>` : ''}`;
  }

  const closedToday = p.closed_override_date && p.closed_override_date === damascusTodayDate();
  if (closedToday) html += `<span class="hours-closed-today">${t('closed_today_active')}</span>`;
  if (p.on_duty) html += `<span class="hours-duty-note">${t('duty_overrides_hours')}</span>`;

  box.innerHTML = html;

  const btn = document.getElementById('closed-today-btn');
  if (btn) btn.textContent = closedToday ? t('closed_today_off') : t('closed_today_on');
}

async function savePharmacyHours() {
  const opens = document.getElementById('hours-opens-input').value.trim();
  const closes = document.getElementById('hours-closes-input').value.trim();
  await submitPharmacyHours(opens, closes);
}

async function clearPharmacyHours() {
  await submitPharmacyHours('', '');
}

async function submitPharmacyHours(opens, closes) {
  const btn = document.getElementById('save-hours-btn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${API}/pharmacies/self/hours`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentPharmacy.username,
        password: currentPharmacy.password,
        opens_at: opens,
        closes_at: closes
      })
    });
    const data = await res.json();
    if (!res.ok) { await customAlert(translateApiError(data.error), 'error'); return; }

    currentPharmacy.opens_at = data.opens_at;
    currentPharmacy.closes_at = data.closes_at;
    document.getElementById('hours-opens-input').value = data.opens_at || '';
    document.getElementById('hours-closes-input').value = data.closes_at || '';
    renderPharmacyHours();
    await customAlert(data.opens_at ? t('hours_saved') : t('hours_cleared'), 'success');
  } catch (err) {
    await customAlert(t('server_error_title'), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function toggleClosedToday() {
  const closedNow = currentPharmacy.closed_override_date
    && currentPharmacy.closed_override_date === damascusTodayDate();
  const btn = document.getElementById('closed-today-btn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${API}/pharmacies/self/closed-today`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentPharmacy.username,
        password: currentPharmacy.password,
        closed: !closedNow
      })
    });
    const data = await res.json();
    if (!res.ok) { await customAlert(translateApiError(data.error), 'error'); return; }

    currentPharmacy.closed_override_date = data.closed_override_date;
    renderPharmacyHours();
    await customAlert(data.closed_override_date ? t('closed_today_saved') : t('closed_today_removed'), 'success');
  } catch (err) {
    await customAlert(t('server_error_title'), 'error');
  } finally {
    const b = document.getElementById('closed-today-btn');
    if (b) b.disabled = false;
  }
}

// ---------- تحديد موقع الصيدلية (لوحة الصيدلي) ----------

// عتبة الدقة التي ننبّه عندها. GPS داخل مبنى قد يعطي دقة مئات الأمتار،
// وحفظ نقطة كهذه يرسل المريض لشارع مجاور — فننبّه ولا نمنع، لأن الصيدلي
// وحده يعرف إن كانت النقطة صحيحة رغم ضعف الدقة المعلَنة.
const LOCATION_ACCURACY_WARN_METERS = 100;

// حدود سوريا التقريبية — تُستخدم للتنبيه فقط لا للمنع.
// فائدتها الحقيقية: كشف انعكاس الرقمين، وهو الخطأ الأشيع عند اللصق من خرائط
// جوجل بواجهة عربية، حيث يعرض المتصفح السطر الرقمي معكوساً بصرياً فينسخ
// المستخدم ما يراه لا ما هو مخزَّن — فينتهي الموقع في تركيا بدل سوريا.
const SYRIA_BOUNDS = { minLat: 32.0, maxLat: 37.5, minLng: 35.5, maxLng: 42.5 };
function isInsideSyria(lat, lng) {
  return lat >= SYRIA_BOUNDS.minLat && lat <= SYRIA_BOUNDS.maxLat
      && lng >= SYRIA_BOUNDS.minLng && lng <= SYRIA_BOUNDS.maxLng;
}

// صيغة الدرجات والدقائق والثواني: 35°00'57.8"N 37°03'25.3"E
// نقبلها لأنها الصيغة الوحيدة غير القابلة للالتباس: حرف N/S يحدد خط العرض
// وE/W يحدد خط الطول، فلا يهم ترتيب ظهورهما ولا اتجاه عرض الواجهة.
function parseDmsCoordinates(text) {
  const re = /(\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)\s*'\s*(\d+(?:\.\d+)?)\s*"?\s*([NSEW])/gi;
  const found = {};
  let m;
  while ((m = re.exec(text)) !== null) {
    const deg = Number(m[1]), min = Number(m[2]), sec = Number(m[3]);
    const dir = m[4].toUpperCase();
    let val = deg + min / 60 + sec / 3600;
    if (dir === 'S' || dir === 'W') val = -val;
    if (dir === 'N' || dir === 'S') found.lat = Math.round(val * 1e6) / 1e6;
    else found.lng = Math.round(val * 1e6) / 1e6;
  }
  if (found.lat === undefined || found.lng === undefined) return null;
  return hasLocation(found.lat, found.lng) ? { lat: found.lat, lng: found.lng } : null;
}

// يقبل ما تنسخه خرائط جوجل مباشرة: "35.011667, 37.053056"
// أو صيغة الدرجات: 35°00'57.8"N 37°03'25.3"E
// ويتسامح مع الفاصلة العربية والمسافات والأقواس وعلامات الاتجاه غير المرئية.
function parsePastedCoordinates(raw) {
  if (!raw) return null;
  // الدرجات أولاً: صيغة قاطعة لا تحتمل انعكاساً، فنفضّلها متى وُجدت
  const dms = parseDmsCoordinates(String(raw));
  if (dms) return dms;
  const cleaned = String(raw)
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')   // محارف اتجاه غير مرئية من اللصق
    .replace(/[()]/g, ' ')
    .replace(/،/g, ',')                             // الفاصلة العربية
    .replace(/[٠-٩]/g, ch => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)))
    .trim();
  const parts = cleaned.split(/[,\s]+/).filter(Boolean);
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]), lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!hasLocation(lat, lng)) return null;
  return { lat, lng };
}

// عرض الموقع المحفوظ حالياً بلوحة الصيدلي
function renderSavedLocation() {
  const box = document.getElementById('location-current');
  if (!box) return;
  const lat = currentPharmacy && currentPharmacy.latitude;
  const lng = currentPharmacy && currentPharmacy.longitude;
  if (!hasLocation(lat, lng)) {
    box.innerHTML = `<span class="muted">${t('location_none')}</span>`;
    return;
  }
  const preview = mapPreviewLink(lat, lng);
  box.innerHTML = `
    <span class="muted">${t('location_current_label')}</span>
    <bdi class="location-coords">${escapeHtml(String(lat))}, ${escapeHtml(String(lng))}</bdi>
    <a class="location-preview-link" href="${preview}" target="_blank" rel="noopener noreferrer">${t('location_preview_btn')}</a>`;
}

// قراءة موقع الجهاز. enableHighAccuracy يطلب GPS لا تقدير الشبكة —
// أبطأ قليلاً لكنه الفارق بين دقة أمتار ودقة كيلومتر.
function detectMyLocation() {
  const btn = document.getElementById('detect-location-btn');
  if (!navigator.geolocation) { customAlert(t('geo_unsupported'), 'warning'); return; }
  if (btn) { btn.disabled = true; btn.textContent = t('detecting_location'); }

  const restore = () => { if (btn) { btn.disabled = false; btn.textContent = t('detect_location_btn'); } };

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      restore();
      const lat = Math.round(pos.coords.latitude * 1e6) / 1e6;
      const lng = Math.round(pos.coords.longitude * 1e6) / 1e6;
      const acc = Math.round(pos.coords.accuracy || 0);

      // تأكيد قبل الحفظ: الصيدلي قد يضغط الزر وهو في بيته لا صيدليته
      const proceed = await customConfirm(tFormat('location_confirm_detected', { n: acc }), 'warning');
      if (!proceed) return;
      if (acc > LOCATION_ACCURACY_WARN_METERS) {
        const anyway = await customConfirm(tFormat('geo_low_accuracy', { n: acc }), 'warning');
        if (!anyway) return;
      }
      document.getElementById('location-paste-input').value = `${lat}, ${lng}`;
      await savePharmacyLocation(lat, lng);
    },
    (err) => {
      restore();
      let key = 'geo_unavailable';
      if (err && err.code === 1) key = 'geo_denied';
      else if (err && err.code === 3) key = 'geo_timeout';
      customAlert(t(key), 'warning');
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
}

// حفظ من الحقل الملصوق
async function saveLocationFromInput() {
  const raw = document.getElementById('location-paste-input').value.trim();
  if (!raw) { await customAlert(t('invalid_location_error'), 'warning'); return; }
  const parsed = parsePastedCoordinates(raw);
  if (!parsed) { await customAlert(t('invalid_location_error'), 'warning'); return; }

  let { lat, lng } = parsed;

  // كشف الانعكاس: إن كان الزوج خارج سوريا بينما عكسه داخلها، فالسبب شبه مؤكد
  // أن المستخدم نسخ السطر الرقمي كما رآه من واجهة عربية تعرضه معكوساً.
  // نقترح التصحيح ولا نفرضه — الصيدلي وحده يعرف موقعه.
  if (!isInsideSyria(lat, lng) && isInsideSyria(lng, lat)) {
    const suggested = `${lng}, ${lat}`;
    const swap = await customConfirm(tFormat('location_swap_suggest', { coords: suggested }), 'warning');
    if (swap) { const tmp = lat; lat = lng; lng = tmp; }
  } else if (!isInsideSyria(lat, lng)) {
    // خارج سوريا والعكس لا يساعد: قد يكون مقصوداً (توسع مستقبلي) فننبّه ونسمح
    const anyway = await customConfirm(t('location_outside_syria'), 'warning');
    if (!anyway) return;
  }

  document.getElementById('location-paste-input').value = `${lat}, ${lng}`;
  await savePharmacyLocation(lat, lng);
}

async function clearPharmacyLocation() {
  await savePharmacyLocation('', '');
}

// الحفظ الفعلي. الخلفية هي مصدر الحقيقة للتنسيق، فنعرض ما أعادته لا ما كُتب.
async function savePharmacyLocation(lat, lng) {
  const saveBtn = document.getElementById('save-location-btn');
  if (saveBtn) saveBtn.disabled = true;
  try {
    const res = await fetch(`${API}/pharmacies/self/location`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentPharmacy.username,
        password: currentPharmacy.password,
        latitude: lat,
        longitude: lng
      })
    });
    const data = await res.json();
    if (!res.ok) { await customAlert(translateApiError(data.error), 'error'); return; }

    currentPharmacy.latitude = data.latitude;
    currentPharmacy.longitude = data.longitude;
    document.getElementById('location-paste-input').value =
      hasLocation(data.latitude, data.longitude) ? `${data.latitude}, ${data.longitude}` : '';
    renderSavedLocation();
    await customAlert(hasLocation(data.latitude, data.longitude) ? t('location_saved_success') : t('location_cleared_success'), 'success');
  } catch (err) {
    await customAlert(t('server_error_title'), 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function saveWhatsappPhone() {
  const raw = document.getElementById('whatsapp-phone-input').value.trim();
  const btn = document.getElementById('save-whatsapp-btn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${API}/pharmacies/self/whatsapp`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentPharmacy.username,
        password: currentPharmacy.password,
        whatsapp_phone: raw
      })
    });
    const data = await res.json();
    if (!res.ok) { await customAlert(translateApiError(data.error), 'error'); return; }

    // نحفظ الرقم المنسّق العائد من الخلفية لا ما كتبه الصيدلي:
    // الخلفية هي مصدر الحقيقة للتنسيق، فيرى الصيدلي الصيغة المخزَّنة فعلاً.
    currentPharmacy.whatsapp_phone = data.whatsapp_phone || null;
    document.getElementById('whatsapp-phone-input').value = data.whatsapp_phone || '';
    await customAlert(data.whatsapp_phone ? t('whatsapp_saved_success') : t('whatsapp_cleared_success'), 'success');
  } catch (err) {
    await customAlert(t('server_error_title'), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function saveAssistantPhone() {
  const assistant_phone = document.getElementById('assistant-phone-input').value.trim();
  try {
    const res = await fetch(`${API}/pharmacies/self/assistant-phone`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentPharmacy.username,
        password: currentPharmacy.password,
        assistant_phone
      })
    });
    const data = await res.json();
    if (!res.ok) { customAlert(translateApiError(data.error), 'error'); return; }
    currentPharmacy.assistant_phone = data.assistant_phone;
    customAlert(t('assistant_phone_saved_success'), 'success');
  } catch (err) {
    customAlert(t('server_error_title'), 'error');
  }
}

function logout() {
  currentPharmacy = null;
  stopOrdersPolling();
  pharmacistStockCache = [];
  pharmacistOrdersCache = [];
  ordersLoadedOnce = false;
  document.getElementById('pharmacist-dashboard').style.display = 'none';
  renderPharmacyAuthForm();
}

function updateMedNamePlaceholder(selectId, inputId) {
  const category = document.getElementById(selectId).value;
  document.getElementById(inputId).placeholder = category === 'cosmetic' ? t('med_name_placeholder_cosmetic') : t('med_name_placeholder');
}

async function addMedicineSelf() {
  const name = document.getElementById('pharm-med-name').value.trim();
  const generic_name = document.getElementById('pharm-med-generic').value.trim();
  const alt_names = document.getElementById('pharm-med-alt').value.split(',').map(s => s.trim()).filter(Boolean);
  const category = document.getElementById('pharm-med-category').value;
  if (!name) { customAlert(t('med_name_required'), 'warning'); return; }
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
    if (!res.ok) { customAlert(translateApiError(data.error), 'error'); return; }
    document.getElementById('pharm-med-name').value = '';
    document.getElementById('pharm-med-generic').value = '';
    document.getElementById('pharm-med-alt').value = '';
    document.getElementById('pharm-med-category').value = 'medicine';
    updateMedNamePlaceholder('pharm-med-category', 'pharm-med-name');
    customAlert(t('med_added_success'), 'success');
    refreshStock();
  } catch (err) {
    customAlert(t('server_error_title'), 'error');
  }
}

// ---------- استيراد دفعة أدوية من ملف CSV ----------

let bulkImportParsedRows = [];

function downloadBulkImportTemplate() {
  const headers = currentLang === 'en'
    ? ['Name', 'Active ingredient', 'Alternative names', 'Category']
    : ['اسم الدواء', 'المادة الفعالة', 'أسماء بديلة', 'التصنيف'];
  const example = currentLang === 'en'
    ? ['Panadol', 'Paracetamol', 'Panadol Extra;Acetaminophen', 'Medicine']
    : ['بنادول', 'باراسيتامول', 'بندول;panadol', 'دواء'];
  const csv = '\uFEFF' + headers.join(',') + '\n' + example.join(',') + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dawaai-jahez-medicines-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// نص خانة التصنيف بالملف ممكن يجي عربي أو إنكليزي (حسب لغة النموذج يلي استخدمها الصيدلي) — نتحقق من الاثنين
function parseCategoryLabel(raw) {
  const v = (raw || '').trim().toLowerCase();
  if (!v) return { value: 'medicine', invalid: false };
  if (v === 'دواء' || v === 'medicine') return { value: 'medicine', invalid: false };
  if (v === 'مستحضر تجميل' || v === 'cosmetic' || v === 'cosmetic product') return { value: 'cosmetic', invalid: false };
  return { value: null, invalid: true };
}

// تقسيم بسيط لسطر بفاصل معيّن (فاصلة أو تاب، حسب صيغة الملف المكتشفة)
function parseCsvLine(line, delimiter) {
  return line.split(delimiter).map(s => s.trim());
}

function handleBulkImportFile(event) {
  const file = event.target.files[0];
  document.getElementById('bulk-import-filename').textContent = file ? file.name : t('no_file_chosen');
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const bytes = new Uint8Array(e.target.result);
      // نتعرّف على ترميز الملف من العلامة (BOM) بأوله، عشان ندعم أكتر من صيغة حفظ ممكنة بإكسل:
      // UTF-8 (نموذجنا الأصلي أو CSV UTF-8) | UTF-16 (صيغة "Unicode Text" بإكسل) | بدون علامة (الأغلب CSV العادية بترميز الجهاز العربي)
      let encoding, offset;
      if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        encoding = 'utf-8'; offset = 3;
      } else if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
        encoding = 'utf-16le'; offset = 2;
      } else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
        encoding = 'utf-16be'; offset = 2;
      } else {
        encoding = 'windows-1256'; offset = 0;
      }
      const decoder = new TextDecoder(encoding);
      const text = decoder.decode(bytes.slice(offset));

      const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim() !== '');
      if (lines.length === 0) { customAlert(t('bulk_import_parse_error'), 'error'); return; }
      // صيغة "Unicode Text" بإكسل بتفصل الأعمدة بـ Tab بدل الفاصلة — نكتشف هيك أوتوماتيكياً
      const delimiter = lines[0].includes('\t') ? '\t' : ',';
      const dataLines = lines.slice(1); // أول سطر عناوين الأعمدة، نتجاوزه
      bulkImportParsedRows = dataLines.map(line => {
        const [name, generic_name, altRaw, categoryRaw] = parseCsvLine(line, delimiter);
        const alt_names = (altRaw || '').split(';').map(s => s.trim()).filter(Boolean);
        const { value: category, invalid: invalidCategory } = parseCategoryLabel(categoryRaw);
        const issues = [];
        if (!name) issues.push(t('bulk_import_empty_name_issue'));
        if (invalidCategory) issues.push(t('bulk_import_invalid_category_issue'));
        return { name: name || '', generic_name: generic_name || '', alt_names, category: category || 'medicine', issues };
      });
      renderBulkImportPreview();
    } catch (err) {
      customAlert(t('bulk_import_parse_error'), 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function renderBulkImportPreview() {
  const container = document.getElementById('bulk-import-preview');
  const validRows = bulkImportParsedRows.filter(r => r.issues.length === 0);
  const invalidRows = bulkImportParsedRows.filter(r => r.issues.length > 0);

  if (bulkImportParsedRows.length === 0) {
    container.style.display = 'block';
    container.innerHTML = `<p class="muted">${t('bulk_import_no_valid_rows')}</p>`;
    return;
  }

  container.style.display = 'block';
  container.innerHTML = `
    <p style="font-weight:700; margin-bottom:6px;">${t('bulk_import_preview_title')}</p>
    <p class="muted" style="margin-top:0;">
      ${tFormat('bulk_import_valid_count', { count: validRows.length })}
      ${invalidRows.length > 0 ? ' — ' + tFormat('bulk_import_invalid_count', { count: invalidRows.length }) : ''}
    </p>
    <div class="stock-table-wrap" style="margin-bottom:14px;">
      <div class="stock-scroll" style="max-height:260px;">
        <div class="stock-table-header">
          <span>${t('bulk_import_col_name')}</span>
          <span class="col-status">${t('bulk_import_col_category')}</span>
        </div>
        ${bulkImportParsedRows.map(r => `
          <div class="row" style="${r.issues.length > 0 ? 'opacity:0.6;' : ''}">
            <span>
              ${escapeHtml(r.name || '-')}
              ${r.generic_name ? `<span class="muted" style="font-size:12px;"> - ${escapeHtml(r.generic_name)}</span>` : ''}
              ${r.issues.length > 0 ? `<br><span style="color:#c0392b; font-size:12px;">⚠️ ${r.issues.join(' / ')}</span>` : ''}
            </span>
            <span class="muted" style="font-size:13px; min-width:104px; text-align:center;">${r.category === 'cosmetic' ? t('cat_cosmetic') : t('cat_medicine')}</span>
          </div>
        `).join('')}
      </div>
    </div>
    <div style="display:flex; gap:10px;">
      <button class="primary" onclick="confirmBulkImport()" ${validRows.length === 0 ? 'disabled' : ''}>${t('bulk_import_confirm_btn')}</button>
      <button type="button" class="btn-outline blue small" onclick="cancelBulkImport()">${t('bulk_import_cancel_btn')}</button>
    </div>
  `;
}

async function confirmBulkImport() {
  const validRows = bulkImportParsedRows.filter(r => r.issues.length === 0)
    .map(({ name, generic_name, alt_names, category }) => ({ name, generic_name, alt_names, category }));
  if (validRows.length === 0) return;
  try {
    const res = await fetch(`${API}/medicines/bulk-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentPharmacy.username, password: currentPharmacy.password, items: validRows })
    });
    const data = await res.json();
    if (!res.ok) { customAlert(translateApiError(data.error), 'error'); return; }
    await customAlert(tFormat('bulk_import_success', { added: data.added, linked: data.linked, skipped: data.skipped }), 'success');
    cancelBulkImport();
    refreshStock();
  } catch (err) {
    customAlert(t('server_error_title'), 'error');
  }
}

function cancelBulkImport() {
  bulkImportParsedRows = [];
  document.getElementById('bulk-import-preview').style.display = 'none';
  document.getElementById('bulk-import-preview').innerHTML = '';
  document.getElementById('bulk-import-file').value = '';
  document.getElementById('bulk-import-filename').textContent = t('no_file_chosen');
}

async function refreshStock() {
  // نعرض "جاري التحميل" بس لو أول مرة (الكاش لسا فاضية) — تفادياً لأي وميض بالتحديثات اللاحقة (بعد تبديل توفر دواء مثلاً)
  const isFirstLoad = pharmacistStockCache.length === 0;
  if (isFirstLoad) {
    document.getElementById('stock-list').innerHTML = `<p class="muted">${t('loading_text')}</p>`;
  }
  try {
    // no-store: وقت التحديث يتغيّر بالثانية، وأي تخزين مؤقت بالمتصفح يعرض وقتاً بائتاً
    const res = await fetch(`${API}/stock/${currentPharmacy.id}`, { cache: 'no-store' });
    const data = await res.json();
    pharmacistStockCache = data;
    renderStockUI();
  } catch (err) {
    // فشل أول تحميل بس — لازم نستبدل "جاري التحميل" برسالة خطأ واضحة، عشان ما تضل عالقة للأبد
    if (isFirstLoad) {
      document.getElementById('stock-list').innerHTML = `<p class="muted">${t('server_error_title')}</p>`;
    }
  }
}

// إعادة رسم قائمة المخزون وبطاقات الإحصاء من آخر بيانات محفوظة، بدون أي طلب شبكة — تُستخدم عند تبديل اللغة
// تحسب حالة انتهاء صلاحية دواء معين بناءً على تاريخ الانتهاء (لو محدد) — أداة داخلية للصيدلي فقط، صفر ظهور للمريض
function expiryStatus(expiryDate) {
  if (!expiryDate) return null;
  const daysLeft = Math.ceil((new Date(expiryDate) - new Date()) / 86400000);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'soon';
  return null;
}

function renderStockUI() {
  const data = pharmacistStockCache;
  document.getElementById('stock-list').innerHTML = data.map(m => {
    const status = expiryStatus(m.expiry_date);
    // نُظهر للصيدلي نفس ما يراه المريض عن عمر معلومته — حافز مباشر للتحديث
    const rel = relativeTime(m.updated_at);
    const freshness = rel
      ? `<span class="muted stock-row-time${isStockStale(m.updated_at) ? ' stale' : ''}">🕒 ${escapeHtml(rel)}</span>`
      : `<span class="muted stock-row-time stale">🕒 ${t('stock_never_updated')}</span>`;
    const badge = status === 'expired'
      ? `<span class="expiry-badge expired">⚠️ ${t('expiry_expired_badge')}</span>`
      : status === 'soon'
      ? `<span class="expiry-badge soon">⏳ ${t('expiry_soon_badge')}</span>`
      : '';
    return `
    <div class="row-wrap">
      <div class="row">
        <span>${escapeHtml(m.name)} <span class="muted" style="font-size:12px;">${m.category === 'cosmetic' ? '💄' : '💊'}</span> ${badge}${freshness}</span>
        <div style="display:flex; gap:6px; align-items:center;">
          <button type="button" class="btn-outline blue small" onclick="toggleStockDates(${m.medicine_id})" aria-label="${t('edit_dates_aria')}">📅</button>
          <button class="toggle-btn ${m.available ? 'yes' : 'no'}" onclick="toggleStock(${m.medicine_id}, ${!m.available})">
            ${m.available ? t('available_badge') : t('unavailable_badge')}
          </button>
        </div>
      </div>
      <div id="stock-dates-${m.medicine_id}" class="stock-dates-panel" style="display:none;"></div>
    </div>
  `;
  }).join('');
  renderDashboardStats(data);
}

// فتح/إغلاق لوحة تعديل تاريخي الصنع والانتهاء لدواء معين
function toggleStockDates(medicineId) {
  const panel = document.getElementById(`stock-dates-${medicineId}`);
  if (!panel) return;
  if (panel.style.display === 'none') {
    const m = pharmacistStockCache.find(x => x.medicine_id === medicineId);
    panel.innerHTML = `
      <div class="stock-dates-inputs">
        <label>${t('manufacture_date_label')}
          <input type="date" id="mfg-date-${medicineId}" value="${m && m.manufacture_date ? m.manufacture_date.slice(0, 10) : ''}">
        </label>
        <label>${t('expiry_date_label')}
          <input type="date" id="exp-date-${medicineId}" value="${m && m.expiry_date ? m.expiry_date.slice(0, 10) : ''}">
        </label>
      </div>
      <button type="button" class="btn-outline blue small" onclick="saveStockDates(${medicineId})">${t('save_dates_btn')}</button>
    `;
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
}

async function saveStockDates(medicineId) {
  const m = pharmacistStockCache.find(x => x.medicine_id === medicineId);
  if (!m) return;
  const manufactureDate = document.getElementById(`mfg-date-${medicineId}`).value || null;
  const expiryDate = document.getElementById(`exp-date-${medicineId}`).value || null;
  const res = await fetch(`${API}/stock/${currentPharmacy.id}/${medicineId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      available: m.available,
      username: currentPharmacy.username,
      password: currentPharmacy.password,
      manufactureDate, expiryDate
    })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    customAlert(translateApiError(data.error) || t('server_error_title'), 'error');
    return;
  }
  refreshStock();
}

function renderDashboardStats(data) {
  const medicines = data.filter(m => m.category !== 'cosmetic');
  const cosmetics = data.filter(m => m.category === 'cosmetic');
  const total = medicines.length;
  const available = medicines.filter(m => m.available).length;
  const unavailable = total - available;
  const cosmeticsTotal = cosmetics.length;
  const cosmeticsAvailable = cosmetics.filter(m => m.available).length;
  const onDutyText = currentPharmacy.on_duty ? t('yes_word') : t('no_word');
  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${total}</div>
      <div class="stat-label">${t('stat_total_meds')}</div>
    </div>
    <div class="stat-card">
      <div class="stat-value stat-green">${available}</div>
      <div class="stat-label">${t('stat_available_meds')}</div>
    </div>
    <div class="stat-card">
      <div class="stat-value stat-red">${unavailable}</div>
      <div class="stat-label">${t('stat_unavailable_meds')}</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${cosmeticsAvailable}/${cosmeticsTotal}</div>
      <div class="stat-label">${t('stat_cosmetics_short')}</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${onDutyText}</div>
      <div class="stat-label">${t('stat_onduty_today')}</div>
    </div>
  `;
}

let ordersPollInterval = null;

function startOrdersPolling() {
  stopOrdersPolling();
  ordersPollInterval = setInterval(whenVisible(loadOrders), POLL_PHARMACY_ORDERS_MS);
}

function stopOrdersPolling() {
  if (ordersPollInterval) {
    clearInterval(ordersPollInterval);
    ordersPollInterval = null;
  }
}

// نتتبّع أول تحميل لكل جلسة دخول فقط، عشان مؤشر "جاري التحميل" ما يتكرر مع كل polling (تفادياً للوميض)
let ordersLoadedOnce = false;

async function loadOrders() {
  const wasFirstLoad = !ordersLoadedOnce;
  if (wasFirstLoad) {
    document.getElementById('orders-wrap').style.display = 'block';
    document.getElementById('orders-list').innerHTML = `<p class="muted">${t('loading_text')}</p>`;
  }
  try {
    const res = await fetch(`${API}/orders/${currentPharmacy.id}`, {
      headers: {
        'x-pharmacy-username': encodeURIComponent(currentPharmacy.username),
        'x-pharmacy-password': encodeURIComponent(currentPharmacy.password)
      }
    });
    if (!res.ok) {
      let bodyText = '';
      try { bodyText = await res.text(); } catch (e) { bodyText = '(تعذّرت قراءة نص الرد)'; }
      throw new Error(`HTTP ${res.status} — ${bodyText}`);
    }
    const orders = await res.json();
    pharmacistOrdersCache = orders;
    renderOrdersUI();
  } catch (err) {
    // تشخيص مؤقت: بنعرض رسالة الخطأ الحقيقية بدل الرسالة العامة، لحد ما نعرف السبب الجذري بالضبط
    if (wasFirstLoad) {
      document.getElementById('orders-list').innerHTML =
        `<p class="muted" style="direction:ltr; text-align:left; word-break:break-word; font-family:monospace; font-size:13px;">
          🔧 رسالة تشخيص مؤقتة — خذلها لقطة شاشة وابعتهالي:<br><br>${escapeHtml(err.message || String(err))}
        </p>`;
    }
  }
  ordersLoadedOnce = true;
}

// إعادة رسم قائمة الطلبات من آخر بيانات محفوظة، بدون أي طلب شبكة — تُستخدم عند تبديل اللغة
function renderOrdersUI() {
  const orders = pharmacistOrdersCache;
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
        <span class="order-patient-name">👤 ${escapeHtml(o.patient_name)}</span>
        ${!o.seen ? `<span class="order-new-badge">${t('order_new_badge')}</span>` : ''}
        ${o.status === 'confirmed' ? `<span class="order-confirmed-badge">${t('order_confirmed_badge')}</span>` : ''}
      </div>
      <div class="order-row"><span>📞</span> ${escapeHtml(o.patient_phone)}</div>
      <div class="order-row"><span>🕐</span> ${new Date(o.created_at).toLocaleString(currentLang === 'en' ? 'en-US' : 'ar-SY')}</div>
      <div class="order-items-list">
        ${o.items.map(it => `<div class="order-item-line">💊 ${escapeHtml(it.medicineName)}${it.genericName ? ' - ' + escapeHtml(it.genericName) : ''} × ${it.quantity}</div>`).join('')}
      </div>
      ${o.notes ? `<div class="order-notes-row">📝 ${escapeHtml(o.notes)}</div>` : ''}
      <div class="order-actions-row">
        ${!o.seen ? `<button class="btn-outline blue small" onclick="dismissOrder(${o.id})">${t('order_dismiss_btn')}</button>` : ''}
        ${o.status !== 'confirmed' ? `<button class="btn-outline green small" onclick="confirmOrderAction(${o.id})">${t('order_confirm_btn')}</button>` : ''}
        <button class="btn-outline red small" onclick="removeOrder(${o.id})">${t('order_delete_btn')}</button>
      </div>
    </div>
  `).join('');
}

// ترويسات مصادقة الصيدلي. تُشفَّر لأن الترويسات لا تقبل أحرفاً غير لاتينية،
// واسم المستخدم قد يكون عربياً. الخلفية تفكّها قبل الاستخدام.
function pharmacyHeaders() {
  return {
    'x-pharmacy-username': encodeURIComponent(currentPharmacy.username),
    'x-pharmacy-password': encodeURIComponent(currentPharmacy.password)
  };
}

async function dismissOrder(id) {
  await fetch(`${API}/orders/${id}/seen`, { method: 'PUT', headers: pharmacyHeaders() });
  loadOrders();
}

async function confirmOrderAction(id) {
  await fetch(`${API}/orders/${id}/confirm`, { method: 'PUT', headers: pharmacyHeaders() });
  loadOrders();
}

async function removeOrder(id) {
  const confirmed = await customConfirm(t('order_delete_confirm'), 'warning');
  if (!confirmed) return;
  await fetch(`${API}/orders/${id}`, { method: 'DELETE', headers: pharmacyHeaders() });
  loadOrders();
}

async function toggleStock(medicineId, newValue) {
  // تحديث فوري بالواجهة قبل انتظار رد السيرفر (Optimistic update).
  // السبب: الخادم قد يستغرق ثوانيَ للرد (خصوصاً بعد استيقاظه على الخطة المجانية)،
  // فكان الصيدلي يضغط الزر ولا يرى "قبل لحظات" تظهر إلا بعد تأخير أو بعد تحديث الصفحة.
  // الآن يرى الأثر لحظة الضغط، ثم يُعاد الجلب من السيرفر ليؤكد الحالة الحقيقية.
  const cached = pharmacistStockCache.find(x => x.medicine_id === medicineId);
  const previous = cached ? { available: cached.available, updated_at: cached.updated_at } : null;
  if (cached) {
    cached.available = newValue;
    cached.updated_at = new Date().toISOString();
    renderStockUI();
  }

  try {
    const res = await fetch(`${API}/stock/${currentPharmacy.id}/${medicineId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: newValue, username: currentPharmacy.username, password: currentPharmacy.password })
    });
    if (!res.ok) throw new Error('save failed');
  } catch (err) {
    // فشل الحفظ: نرجّع الحالة السابقة بدل ترك الصيدلي يظن أن التغيير حُفظ وهو لم يُحفظ
    if (cached && previous) {
      cached.available = previous.available;
      cached.updated_at = previous.updated_at;
      renderStockUI();
    }
    await customAlert(t('server_error_title'), 'error');
    return;
  }
  refreshStock();
}

async function deleteMyAccount() {
  const confirmed = await customConfirm(t('delete_account_confirm'), 'warning');
  if (!confirmed) return;
  const res = await fetch(`${API}/pharmacies/self`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentPharmacy.username, password: currentPharmacy.password })
  });
  const data = await res.json();
  if (!res.ok) { customAlert(translateApiError(data.error), 'error'); return; }
  await customAlert(t('account_deleted_success'), 'success');
  logout();
}

// ---------- لوحة الإدارة ----------

function renderAdminAuthForm() {
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('admin-auth-section').innerHTML = `
    <div class="auth-box">
      <div class="password-field">
        <input id="admin-password-input" type="password" placeholder="${t('admin_password_placeholder')}" onkeydown="if(event.key==='Enter') checkAdminPassword()">
        <button type="button" class="toggle-password" onclick="togglePassword('admin-password-input', this)" aria-label="${t('show_password_aria')}">👁</button>
      </div>
      <button class="primary" onclick="checkAdminPassword()">${t('login_btn')}</button>
    </div>
  `;
}

async function checkAdminPassword() {
  const password = document.getElementById('admin-password-input').value;
  try {
    const res = await fetch(`${API}/pharmacies`, { headers: { 'x-admin-password': password } });
    if (!res.ok) { customAlert(t('wrong_password'), 'error'); return; }
    adminPassword = password;
    document.getElementById('admin-auth-section').innerHTML = '';
    document.getElementById('admin-panel').style.display = 'block';
    renderAdminPanel();
  } catch (err) {
    // ترويسات HTTP لازم تكون بترميز ASCII — أي حرف غير إنكليزي (عربي مثلاً) برقم مرور الإدارة بيخلي fetch نفسها ترمي استثناء قبل ما توصل السيرفر
    customAlert(t('wrong_password'), 'error');
  }
}

function logoutAdmin() {
  adminPassword = null;
  stopAdminRatingsPolling();
  adminPanelLoadedOnce = false;
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('admin-panel').innerHTML = '';
  renderAdminAuthForm();
}

function adminHeaders() {
  return { 'Content-Type': 'application/json', 'x-admin-password': adminPassword };
}

// ذاكرة مؤقتة لآخر بيانات جُلبت من السيرفر — عشان تبديل اللغة يعيد الرسم بس، بدون طلبات شبكة جديدة
let adminDataCache = { pharmacies: [], medicines: [], nurses: [], pendingRatings: [], stats: null };

// نتتبّع أول تحميل لكل جلسة دخول إدارة فقط، عشان مؤشر "جاري التحميل" ما يتكرر بعد كل إجراء إداري (تفادياً للوميض)
let adminPanelLoadedOnce = false;
// معرّف الصيدلية التي يجري تعديل اسمها حالياً بلوحة الإدارة (null = صفر تعديل جارٍ).
// حالة واجهة بحتة، ما بتنحفظ ولا بتنرسل للسيرفر — بس بتخلي renderAdminPanelUI ترسم
// صف التعديل بدل الصف العادي، بنفس أسلوب باقي اللوحة (إعادة رسم من الكاش، صفر طلب شبكة).
let editingPharmacyId = null;
// النص المكتوب حالياً بحقل التعديل. ضروري لأن أي إعادة رسم للوحة (أبرزها تبديل اللغة،
// الذي يستدعي renderAdminPanelUI) بتعيد بناء الحقل من الكاش، فيضيع ما كتبه المستخدم.
// بحفظ المسودة هون، النص بيبقى سليماً عبر أي إعادة رسم مهما كان مصدرها.
let editingPharmacyNameDraft = '';

async function renderAdminPanel() {
  const wasFirstLoad = !adminPanelLoadedOnce;
  if (wasFirstLoad) {
    document.getElementById('admin-panel').innerHTML = `<p class="muted" style="padding:20px;">${t('loading_text')}</p>`;
  }
  try {
    const [pharmacies, medicines, nurses, pendingRatings, stats] = await Promise.all([
      fetch(`${API}/pharmacies`, { headers: adminHeaders() }).then(r => r.json()),
      fetch(`${API}/medicines`, { headers: adminHeaders() }).then(r => r.json()),
      fetch(`${API}/nurses`).then(r => r.json()),
      fetch(`${API}/nurses/ratings/pending`, { headers: adminHeaders() }).then(r => r.json()),
      // فشل الإحصاءات وحدها يجب ألا يُسقط اللوحة كلها — تُعاد null فيُخفى القسم فقط
      fetch(`${API}/stats`, { headers: adminHeaders() }).then(r => r.ok ? r.json() : null).catch(() => null)
    ]);
    adminDataCache = { pharmacies, medicines, nurses, pendingRatings, stats };
    renderAdminPanelUI();
    adminPanelLoadedOnce = true;
  } catch (err) {
    // فشل أول تحميل بس — نستبدل "جاري التحميل" برسالة خطأ واضحة، بدل ما تضل عالقة للأبد.
    // فشل بعد إجراء إداري عادي (مش أول مرة) بيتجاهل بصمت — اللوحة بمحتواها القديم تضل ظاهرة بدل ما تُمحى
    if (wasFirstLoad) {
      document.getElementById('admin-panel').innerHTML = `<p class="muted" style="padding:20px;">${t('server_error_title')}</p>`;
    }
  }
}

// إعادة رسم اللوحة من آخر بيانات محفوظة بدون أي طلب شبكة جديد — تُستخدم عند تبديل اللغة بس
// ---------- قسم الإحصاءات بلوحة الإدارة ----------
// يُبنى من كائن stats القادم من GET /api/stats. لو كان null (فشل الطلب) يُخفى القسم
// بالكامل بدل عرض أصفار مضلّلة — رقم خاطئ أسوأ من غياب الرقم.
function renderStatsSection(stats) {
  if (!stats || !stats.totals) return '';
  const s = stats.totals;

  // صف واحد من جدول ترتيب: اسم على جهة، رقم على الأخرى
  const rankRow = (label, value, unit) => `
    <div class="row">
      <span>${escapeHtml(label)}</span>
      <span class="muted">${value} ${escapeHtml(unit)}</span>
    </div>`;

  const emptyNote = `<p class="muted" style="padding:8px 0; margin:0;">${t('stats_no_orders_yet')}</p>`;

  const topMeds = (stats.topMedicines || []).length
    ? stats.topMedicines.map(m => rankRow(m.name, m.count, t('stats_times_unit'))).join('')
    : emptyNote;

  const topPhs = (stats.topPharmacies || []).length
    ? stats.topPharmacies.map(p =>
        rankRow(p.city ? `${p.name} - ${cityName(p.city)}` : p.name, p.orders_count, t('stats_orders_count_unit'))
      ).join('')
    : emptyNote;

  const byCity = (stats.byCity || []).length
    ? stats.byCity.map(c => rankRow(cityName(c.city), c.count, t('stats_pharmacy_unit'))).join('')
    : '';

  return `
    <div class="box" style="margin-bottom:20px;">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
        <h3 style="margin:0;">${t('stats_title')}</h3>
        <button class="btn-outline blue small" onclick="renderAdminPanel()">${t('stats_refresh_btn')}</button>
      </div>

      <div class="stats-grid" style="margin-top:14px;">
        <div class="stat-card">
          <div class="stat-value">${s.orders_total}</div>
          <div class="stat-label">${t('stat_orders_total')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value stat-green">${s.orders_24h}</div>
          <div class="stat-label">${t('stat_orders_24h')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${s.orders_7d}</div>
          <div class="stat-label">${t('stat_orders_7d')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${s.orders_30d}</div>
          <div class="stat-label">${t('stat_orders_30d')}</div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${s.available_stock}</div>
          <div class="stat-label">${t('stat_available_stock')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${s.cosmetics}</div>
          <div class="stat-label">${t('stat_cosmetics')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${s.nurses}</div>
          <div class="stat-label">${t('stat_nurses')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value stat-green">${s.pharmacies_on_duty}</div>
          <div class="stat-label">${t('stat_on_duty')}</div>
        </div>
      </div>

      <h4 style="margin:18px 0 8px;">${t('stats_top_medicines')}</h4>
      ${topMeds}

      <h4 style="margin:18px 0 8px;">${t('stats_top_pharmacies')}</h4>
      ${topPhs}

      ${byCity ? `<h4 style="margin:18px 0 8px;">${t('stats_by_city')}</h4>${byCity}` : ''}
    </div>
  `;
}

function renderAdminPanelUI() {
  const { pharmacies, medicines, nurses, pendingRatings, stats } = adminDataCache;

  approvedRatingsLoaded = false;
  lastPendingRatingsSnapshot = JSON.stringify(pendingRatings);

  const onDutyCount = pharmacies.filter(p => p.on_duty).length;

  document.getElementById('admin-panel').innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
      <h2 class="dash-title" style="margin-bottom:0;">${t('admin_dashboard_title')}</h2>
      <button class="action-pill-btn blue" onclick="logoutAdmin()">${t('logout_btn')}</button>
    </div>
    <div class="stats-grid stats-grid-3">
      <div class="stat-card">
        <div class="stat-value">${pharmacies.length}</div>
        <div class="stat-label">${t('stat_pharmacies_count')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${medicines.length}</div>
        <div class="stat-label">${t('stat_total_meds')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-green">${onDutyCount}</div>
        <div class="stat-label">${t('stat_onduty_pharmacies')}</div>
      </div>
    </div>

    ${renderStatsSection(stats)}

    <div class="box" style="margin-bottom:20px;">
      <h3 style="margin-top:0;">${t('add_pharmacy_title')}</h3>
      <input id="ph-name" placeholder="${t('pharmacy_name_placeholder')}">
      <input id="ph-address" placeholder="${t('address_placeholder')}">
      <select id="ph-city" aria-label="${t('city_label')}">
        <option value="">${t('city_placeholder')}</option>
        ${cityOptionsHtml('')}
      </select>
      <input id="ph-phone" placeholder="${t('phone_placeholder')}">
      <input id="ph-whatsapp" type="tel" inputmode="numeric" placeholder="${t('whatsapp_phone_input_placeholder')}">
      <fieldset class="listing-type-group">
        <legend>${t('register_listing_type_title')}</legend>
        <label class="listing-type-option">
          <input type="radio" name="ph-listing-type" value="duty" checked>
          <span class="listing-type-text">
            <span class="listing-type-label">${t('register_type_duty_label')}</span>
            <span class="listing-type-desc">${t('register_type_duty_desc')}</span>
          </span>
        </label>
        <label class="listing-type-option">
          <input type="radio" name="ph-listing-type" value="full">
          <span class="listing-type-text">
            <span class="listing-type-label">${t('register_type_full_label')}</span>
            <span class="listing-type-desc">${t('register_type_full_desc')}</span>
          </span>
        </label>
      </fieldset>
      <input id="ph-username" placeholder="${t('username_placeholder')}">
      <div class="password-field">
        <input id="ph-password" type="password" placeholder="${t('password_placeholder')}">
        <button type="button" class="toggle-password" onclick="togglePassword('ph-password', this)" aria-label="${t('show_password_aria')}">👁</button>
      </div>
      <button class="primary" onclick="addPharmacy()">${t('add_pharmacy_btn')}</button>
    </div>

    <h3>${t('registered_pharmacies_title')} (${pharmacies.length})</h3>
    <div class="stock-table-wrap" style="margin-bottom:20px;">
      <div class="stock-scroll">
        ${pharmacies.length === 0
          ? `<p class="muted" style="padding:16px 18px; margin:0;">${t('no_pharmacies_yet')}</p>`
          : `<div class="stock-table-header"><span>${t('pharmacies_table_header')}</span><span class="col-action">${t('action_col_header')}</span></div>
             ${pharmacies.map(p => p.id === editingPharmacyId
               ? `
               <div class="admin-ph-row">
                 <input id="edit-ph-name-${p.id}" class="admin-ph-edit-input" value="${escapeHtml(editingPharmacyNameDraft)}"
                        aria-label="${t('edit_name_aria')}" oninput="onEditPharmacyNameInput(this)"
                        onkeydown="onEditPharmacyNameKeydown(event, ${p.id})">
                 <div class="admin-ph-actions">
                   <button class="btn-outline blue" onclick="savePharmacyName(${p.id})">${t('save_name_btn')}</button>
                   <button class="btn-outline" onclick="cancelEditPharmacyName()">${t('cancel_edit_btn')}</button>
                 </div>
               </div>
             `
               : `
               <div class="admin-ph-row">
                 <div class="admin-ph-info">
                   <span class="admin-ph-name"><bdi>${escapeHtml(p.name)}</bdi></span>
                   <span class="admin-ph-meta">
                     <span>👤 ${escapeHtml(p.owner_username)}</span>
                     ${p.verified ? `<span class="admin-ph-sep">•</span><span>✓ ${t('verified_badge')}</span>` : ''}
                     ${p.whatsapp_phone ? `<span class="admin-ph-sep">•</span><span>💬 ${t('whatsapp_admin_label')}</span>` : ''}
                     ${hasLocation(p.latitude, p.longitude) ? `<span class="admin-ph-sep">•</span><span>📍 ${t('location_admin_label')}</span>` : ''}
                     <span class="admin-ph-sep">•</span><span class="${p.manages_stock ? 'tier-on' : 'tier-off'}">${p.manages_stock ? '📦 ' + t('manages_stock_on') : '🕐 ' + t('manages_stock_off')}</span>
                     ${p.city ? `<span class="admin-ph-sep">•</span><span>📍 ${escapeHtml(cityName(p.city))}</span>` : ''}
                     ${p.assistant_phone ? `<span class="admin-ph-sep">•</span><span>📱 ${escapeHtml(p.assistant_phone)}</span>` : ''}
                     ${p.on_duty ? `<span class="badge yes">${t('onduty_badge_short')}</span>` : ''}
                   </span>
                 </div>
                 <div class="admin-ph-actions">
                   <button class="btn-outline ${p.manages_stock ? '' : 'green'}" onclick="togglePharmacyManagesStock(${p.id}, ${!p.manages_stock})">${p.manages_stock ? t('manages_stock_toggle_off') : t('manages_stock_toggle_on')}</button>
                   <button class="btn-outline" onclick="startEditPharmacyName(${p.id})">${t('edit_name_btn')}</button>
                   <button class="btn-outline blue" onclick="resetPharmacyPassword(${p.id})" title="${t('reset_password_btn')}"><span class="btn-label-full">${t('reset_password_btn')}</span><span class="btn-label-short">${t('reset_password_btn_short')}</span></button>
                   <button class="btn-outline red" onclick="deletePharmacyAdmin(${p.id})">${t('delete_btn')}</button>
                 </div>
               </div>
             `).join('')}`
        }
      </div>
    </div>

    <div class="box" style="margin-bottom:20px;">
      <h3 style="margin-top:0;">${t('backup_title')}</h3>
      <p class="muted" style="margin-top:6px;">${t('backup_desc')}</p>

      <div class="status-row">
        <span class="muted">${t('system_status_title')}:</span>
        <span id="system-status"></span>
      </div>

      <div id="backup-info" class="backup-info"></div>
      <p class="backup-warning">${t('backup_warning')}</p>
      <button class="primary" id="backup-btn" onclick="downloadBackup()">${t('backup_btn')}</button>
    </div>

    <div class="box" style="margin-bottom:20px;">
      <h3 style="margin-top:0;">${t('admin_username_title')}</h3>
      <p class="muted" style="margin-top:6px;">${t('admin_username_desc')}</p>
      <input type="search" id="admin-username-search" class="admin-username-search"
             placeholder="${t('admin_username_search')}"
             oninput="onAdminUsernameSearch(this)" onsearch="onAdminUsernameSearch(this)"
             onchange="onAdminUsernameSearch(this)" value="${escapeHtml(adminUsernameFilter)}">
      <div id="admin-username-list" class="admin-username-list"></div>
    </div>

    <div class="box" style="margin-bottom:20px;">
      <div class="admin-duty-head">
        <h3 style="margin:0;">${t('admin_duty_title')}</h3>
        <span class="muted" id="admin-duty-count"></span>
      </div>
      <p class="muted" style="margin-top:6px;">${t('admin_duty_desc')}</p>
      <div class="admin-duty-tools">
        <input type="search" id="admin-duty-search" placeholder="${t('admin_duty_search')}"
               oninput="onAdminDutySearch(this)" onsearch="onAdminDutySearch(this)"
               onchange="onAdminDutySearch(this)" value="${escapeHtml(adminDutyFilter)}">
        <button class="btn-outline red" onclick="clearAllDuty()">${t('admin_duty_clear_all')}</button>
      </div>
      <div id="admin-duty-list" class="admin-duty-list"></div>
    </div>

    <div class="box" style="margin-bottom:20px;">
      <h3 style="margin-top:0;">${t('add_medicine_title_admin')}</h3>
      <input id="med-name" placeholder="${t('med_name_placeholder')}">
      <input id="med-generic" placeholder="${t('generic_name_placeholder')}">
      <input id="med-alt" placeholder="${t('alt_names_placeholder')}">
      <select id="med-category" onchange="updateMedNamePlaceholder('med-category', 'med-name')">
        <option value="medicine">${t('cat_medicine')}</option>
        <option value="cosmetic">${t('cat_cosmetic')}</option>
      </select>
      <button class="primary" onclick="addMedicineAdmin()">${t('add_med_btn')}</button>
    </div>

    <h3>${t('registered_medicines_title')} (${medicines.length})</h3>
    <div class="stock-table-wrap" style="margin-bottom:20px;">
      <div class="stock-scroll">
        <div class="stock-table-header"><span>${t('stock_table_medicine')}</span><span class="col-action">${t('action_col_header')}</span></div>
        ${medicines.map(m => `
          <div class="row">
            <span>${escapeHtml(m.name)} <span class="muted" style="font-size:12px;">${m.category === 'cosmetic' ? '💄 ' + t('cat_cosmetic') : '💊 ' + t('cat_medicine')}</span></span>
            <button class="btn-outline red small table-action-btn" onclick="deleteMedicineAdmin(${m.id})">${t('delete_btn')}</button>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="box" style="margin-bottom:20px;">
      <h3 style="margin-top:0;">${t('add_nurse_title')}</h3>
      <input id="nurse-name" placeholder="${t('nurse_name_placeholder')}">
      <input id="nurse-specialty" placeholder="${t('specialty_placeholder')}">
      <input id="nurse-university" placeholder="${t('university_placeholder')}">
      <input id="nurse-grad-year" placeholder="${t('grad_year_placeholder')}">
      <input id="nurse-phone" placeholder="${t('phone_placeholder')}">
      <button type="button" class="btn-outline blue small" onclick="uploadCertificateComingSoon()" style="margin-bottom:10px;">${t('upload_cert_btn')}</button>
      <button class="primary" onclick="addNurseAdmin()">${t('add_nurse_btn')}</button>
    </div>

    <h3>${t('registered_nurses_title')} (${nurses.length})</h3>
    <div class="stock-table-wrap" style="margin-bottom:20px;">
      <div class="stock-scroll">
        ${nurses.length === 0
          ? `<p class="muted" style="padding:16px 18px; margin:0;">${t('no_nurses_yet')}</p>`
          : `<div class="stock-table-header"><span>${t('nurses_table_header')}</span><span class="col-action">${t('actions_header_plural')}</span></div>
             ${nurses.map(n => `
               <div class="row">
                 <span><bdi>${escapeHtml(n.name)}</bdi> <span class="muted" style="font-size:12px;">${escapeHtml(n.specialty || '')}</span></span>
                 <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
                   <button class="toggle-btn ${n.available ? 'yes' : 'no'}" onclick="toggleNurseAvailabilityAdmin(${n.id}, ${!n.available})">${n.available ? t('nurse_available_short') : t('nurse_unavailable_short')}</button>
                   <button class="btn-outline red small table-action-btn" onclick="deleteNurseAdmin(${n.id})">${t('delete_btn')}</button>
                 </div>
               </div>
             `).join('')}`
        }
      </div>
    </div>

    <div id="pending-ratings-wrap" style="${pendingRatings.length === 0 ? 'display:none;' : ''}">
      <div class="orders-wrap">
        <h3 style="margin-top:0;">${t('pending_ratings_title')} (<span id="pending-ratings-count">${pendingRatings.length}</span>)</h3>
        <div id="pending-ratings-list">${renderPendingRatingsCards(pendingRatings)}</div>
      </div>
    </div>

    <div class="box" style="margin-bottom:20px;">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
        <h3 style="margin:0;">${t('published_ratings_title')}</h3>
        <button class="btn-outline blue small" onclick="toggleApprovedRatingsAdmin()" id="toggle-approved-ratings-btn">${t('show_ratings_btn')}</button>
      </div>
      <div id="approved-ratings-list" style="display:none; margin-top:14px;"></div>
    </div>
  `;

  startAdminRatingsPolling();

  // لو كان في تعديل اسم صيدلية جارٍ وقت إعادة الرسم (تبديل اللغة مثلاً)، الحقل انبنى من
  // جديد وضاع منه التركيز. نرجّعه مع وضع المؤشر بآخر النص، حتى يكمل المستخدم كتابته
  // بسلاسة بدل ما يضطر يضغط على الحقل من جديد.
  if (editingPharmacyId !== null) {
    const editInput = document.getElementById(`edit-ph-name-${editingPharmacyId}`);
    if (editInput && document.activeElement !== editInput) {
      editInput.focus();
      editInput.setSelectionRange(editInput.value.length, editInput.value.length);
    }
  }

  // حاويات المناوبة وأسماء المستخدمين والنسخ الاحتياطي وحالة النظام تُنشأ ضمن
  // innerHTML أعلاه، فنملؤها بعد بنائها مباشرة. وبوضع الاستدعاءات هنا تُحدَّث
  // تلقائياً مع كل إعادة رسم للوحة، بما في ذلك تبديل اللغة.
  //
  // ⚠️ كانت هذه الاستدعاءات بالخطأ داخل resetPharmacyPassword، فلم تُرسم القوائم
  // إلا حين تُعاد كلمة مرور صيدلية. يجب أن تبقى هنا في نهاية هذه الدالة تحديداً.
  renderAdminDutyList();
  renderAdminUsernameList();
  renderBackupInfo();
  checkSystemStatus();
}

async function addPharmacy() {
  const body = {
    name: document.getElementById('ph-name').value,
    address: document.getElementById('ph-address').value,
    city: document.getElementById('ph-city').value,
    phone: document.getElementById('ph-phone').value,
    whatsapp_phone: document.getElementById('ph-whatsapp').value,
    // "مناوبة فقط" هو الخيار الافتراضي عن قصد: الخطأ الآمن هو عدم الادعاء.
    // نسيان اختيار "صيدلية كاملة" يعني عدم عرض حالة التوفر ويُصلح بنقرة، بينما
    // العكس يجعل المنصة تعلن "غير متوفر" عن صيدلية لم تُسأل أصلاً.
    manages_stock: (document.querySelector('input[name="ph-listing-type"]:checked') || {}).value === 'full',
    username: document.getElementById('ph-username').value,
    password: document.getElementById('ph-password').value,
  };
  const res = await fetch(`${API}/pharmacies/register`, {
    method: 'POST', headers: adminHeaders(), body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) { customAlert(translateApiError(data.error), 'error'); return; }
  customAlert(tFormat('pharmacy_added_success', { name: data.name }), 'success');
  renderAdminPanel();
}

// ---------- كلمة المرور ----------

// تغيير الصيدلي كلمته بنفسه
async function changeMyPassword() {
  const current = document.getElementById('current-password-input').value;
  const next = document.getElementById('new-password-input').value;
  const confirm = document.getElementById('confirm-password-input').value;

  if (!next) { await customAlert(t('new_password_required_error'), 'warning'); return; }
  if (next.length < 8) { await customAlert(t('new_password_too_short_error'), 'warning'); return; }
  if (next !== confirm) { await customAlert(t('passwords_not_matching'), 'warning'); return; }

  try {
    const res = await fetch(`${API}/pharmacies/self/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentPharmacy.username,
        // الكلمة الحالية تُؤخذ من الحقل لا من الذاكرة: هكذا يثبت المستخدم أنه يعرفها
        // فعلاً، ولا يكفي أن يكون تركَ الجلسة مفتوحة على جهاز مشترك.
        password: current,
        new_password: next
      })
    });
    const data = await res.json();
    if (!res.ok) { await customAlert(translateApiError(data.error), 'error'); return; }

    // حاسم: الواجهة تحفظ كلمة المرور بالذاكرة وترسلها مع كل طلب لاحق (مناوبة، مخزون،
    // طلبات...). بدون تحديثها هنا كانت كل عملية بعد التغيير ستفشل بـ401 حتى يخرج
    // الصيدلي ويدخل من جديد.
    currentPharmacy.password = next;

    document.getElementById('current-password-input').value = '';
    document.getElementById('new-password-input').value = '';
    document.getElementById('confirm-password-input').value = '';
    await customAlert(t('password_changed_success'), 'success');
  } catch (err) {
    await customAlert(t('server_error_title'), 'error');
  }
}

// إعادة تعيين كلمة مرور صيدلية من لوحة الإدارة
async function resetPharmacyPassword(id) {
  const pharmacy = adminDataCache.pharmacies.find(p => p.id === id);
  const name = pharmacy ? pharmacy.name : '';

  const proceed = await customConfirm(tFormat('reset_password_confirm', { name }), 'warning');
  if (!proceed) return;

  try {
    const res = await fetch(`${API}/pharmacies/${id}/reset-password`, {
      method: 'POST', headers: adminHeaders()
    });
    const data = await res.json();
    if (!res.ok) { await customAlert(translateApiError(data.error) || t('reset_password_error'), 'error'); return; }

    // الكلمة تُعرض مرة واحدة فقط — غير مخزّنة بأي مكان، والمحفوظ بالقاعدة هو الهاش.
    // نعرضها بمربع منفصل قابل للتحديد بسهولة ليسهل نسخها وإملاؤها هاتفياً.
    await customAlert(
      `${tFormat('reset_password_done_title', { name: data.name })}\n\n${data.new_password}\n\n${t('reset_password_done_hint')}`,
      'success'
    );
  } catch (err) {
    await customAlert(t('reset_password_error'), 'error');
  }
}

// ---------- تعديل اسم الصيدلية (الإدارة حصراً) ----------

function startEditPharmacyName(id) {
  const pharmacy = adminDataCache.pharmacies.find(p => p.id === id);
  editingPharmacyNameDraft = pharmacy ? pharmacy.name : '';
  editingPharmacyId = id;
  renderAdminPanelUI();
  // تركيز الحقل وتحديد النص كله ليقدر يكتب فوقه مباشرة بدون مسح يدوي
  const input = document.getElementById(`edit-ph-name-${id}`);
  if (input) { input.focus(); input.select(); }
}

// كل حرف يُكتب يُحفظ بالمسودة فوراً، فما يضيع لو أُعيد رسم اللوحة لأي سبب
function onEditPharmacyNameInput(el) {
  editingPharmacyNameDraft = el.value;
}

function cancelEditPharmacyName() {
  editingPharmacyId = null;
  editingPharmacyNameDraft = '';
  renderAdminPanelUI();
}

// Enter بيحفظ، Escape بيلغي — نفس المتوقع بأي حقل تعديل سريع
function onEditPharmacyNameKeydown(e, id) {
  if (e.key === 'Enter') { e.preventDefault(); savePharmacyName(id); }
  else if (e.key === 'Escape') { e.preventDefault(); cancelEditPharmacyName(); }
}

// تبديل حالة "تُحدّث مخزونها" من لوحة الإدارة.
// نطلب تأكيداً يشرح الأثر على المريض صراحةً، لأن الإيقاف يغيّر ما يراه الناس
// عن صيدلية حقيقية — لا مجرد إعداد داخلي.
// ================= الاستطلاع الدوري =================
// كانت خمسة مؤقتات تعمل بلا توقف، حتى حين يكون التبويب مخفياً أو الهاتف مقفلاً.
// أسوأها سؤال كل زائر عن الصيدليات المناوبة كل 5 ثوانٍ مهما كانت الصفحة التي يفتحها،
// والجدول يتغير نحو مرة في اليوم — أي 720 استعلاماً في الساعة لكل زائر بلا فائدة.
// والثاني سؤال المريض عن حالة طلبه كل ثانيتين: 18 ألف طلب لو ترك التبويب ليلة كاملة
// بانتظار صيدلية مغلقة.
//
// الحل: كل مؤقت يتخطى جولته حين يكون التبويب مخفياً، ونحدّث فوراً عند العودة إليه،
// فيرى المستخدم أحدث البيانات لحظة ينظر دون أن يستهلك شيئاً وهو غائب.
//
// ملاحظة: لا يوجد تنبيه صوتي أو إشعار للصيدلي يعتمد على العمل في الخلفية، فالإيقاف
// آمن له أيضاً — والتحديث الفوري عند العودة يُظهر له الطلبات الجديدة لحظة يفتح التبويب.

const POLL_ON_DUTY_MS = 60000;      // كان 5000: الجدول يتغير نادراً
const POLL_MY_ORDERS_MS = 10000;    // كان 2000: عشر ثوانٍ تكفي لمعرفة تأكيد الصيدلي
const POLL_NURSES_MS = 30000;       // كان 5000: تقييمات الممرضين نادرة التغيّر
const POLL_ADMIN_RATINGS_MS = 15000; // كان 4000
const POLL_PHARMACY_ORDERS_MS = 12000; // بلا تغيير: وظيفة الصيدلي الأساسية

// يغلّف دالة الاستطلاع فتتخطى جولتها حين يكون التبويب مخفياً.
// نغلّف عند نقطة الجدولة لا داخل الدالة نفسها، فالاستدعاء المباشر يبقى يعمل دائماً
// (مثلاً عند فتح الصفحة في تبويب خلفي ثم الانتقال إليه).
function whenVisible(fn) {
  return function () {
    if (typeof document !== 'undefined' && document.hidden) return;
    return fn.apply(this, arguments);
  };
}

// عند العودة إلى التبويب: تحديث فوري لما هو نشط، بدل انتظار الجولة التالية
// التي قد تكون بعد دقيقة كاملة.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  try { loadOnDuty(); } catch (e) {}
  if (myOrdersPollInterval) try { checkMyOrdersStatus(); } catch (e) {}
  if (ordersPollInterval) try { loadOrders(); } catch (e) {}
  if (nursingPollInterval) try { pollNurses(); } catch (e) {}
  if (adminRatingsPollInterval) try { loadPendingRatingsForAdmin(); } catch (e) {}
});

// ================= التعامل مع الإخفاق =================
// كانت ٥١ طلباً شبكياً بلا أي مهلة زمنية: لو علق الاتصال — وهو شائع على الشبكة
// المحمولة — لا ينتهي الطلب أبداً. وفي إرسال الطلب تحديداً كان ذلك يترك
// orderSubmitInProgress على true إلى الأبد، فلا يستطيع المريض الإرسال مجدداً
// حتى يعيد تحميل الصفحة، دون أن يعرف السبب.
//
// نطبّق المهلة على المسارات الحرجة للمريض (البحث وإرسال الطلب). لوحتا الإدارة
// والصيدلي يستخدمهما أشخاص يعرفون النظام، فتبقى كما هي لتقليل نطاق التغيير.

// طلب بمهلة زمنية. AbortController هو الطريقة الوحيدة لإلغاء fetch فعلياً.
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// تصنيف سبب الفشل، ليعرف المستخدم ماذا يفعل بدل رسالة واحدة لكل الأسباب.
// نفحص الاتصال أولاً: الطلب الفاشل أثناء الانقطاع قد يظهر كمهلة أو كخطأ شبكة.
function classifyFetchError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  if (err && err.name === 'AbortError') return 'timeout';
  return 'network';
}

// مفتاح تفرّد لطلب الشراء: واحد لكل سلة، ثابت عبر إعادات المحاولة.
// يُولَّد عند أول محاولة ويُمسح عند النجاح أو عند أي تعديل على السلة، فإعادة
// إرسال السلة نفسها لا تكرر الطلب، وأي تغيير فيها يُعامل كطلب جديد.
let pendingOrderKey = null;

function newRequestKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // بديل للمتصفحات القديمة: عشوائي كافٍ للتفرّد، وليس لأغراض أمنية
  return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

// شريط تنبيه عند انقطاع الإنترنت. يظهر ويختفي تلقائياً مع حالة الاتصال،
// فيعرف المستخدم سبب الفشل قبل أن يحاول، لا بعده.
function updateOfflineBanner() {
  const bar = document.getElementById('offline-banner');
  if (!bar) return;
  const offline = navigator.onLine === false;
  bar.style.display = offline ? 'flex' : 'none';
  const label = document.getElementById('offline-banner-text');
  if (label) label.textContent = t('offline_banner');
}
window.addEventListener('offline', updateOfflineBanner);
window.addEventListener('online', updateOfflineBanner);

// ================= النسخ الاحتياطي وحالة النظام =================
// خطة Supabase المجانية بلا نسخ احتياطي تلقائي، وصفر مراقبة تلقائية.
// هذا القسم يعالج الأمرين من لوحة الإدارة مباشرة.

// آخر نسخة نُزّلت من هذا المتصفح. نحفظها محلياً لا في القاعدة عن قصد:
// لو ضاعت القاعدة فالمعلومة تضيع معها، بينما المطلوب هو تذكير المدير نفسه.
const BACKUP_STAMP_KEY = 'dawaai_last_backup';
const BACKUP_OVERDUE_DAYS = 7;

function readLastBackup() {
  try { return localStorage.getItem(BACKUP_STAMP_KEY); } catch (e) { return null; }
}
function writeLastBackup(iso) {
  try { localStorage.setItem(BACKUP_STAMP_KEY, iso); } catch (e) { /* وضع خاص أو تخزين ممتلئ */ }
}

function renderBackupInfo() {
  const box = document.getElementById('backup-info');
  if (!box) return;
  const last = readLastBackup();
  if (!last) {
    box.innerHTML = `<span class="backup-overdue">${t('backup_never')}</span>`;
    return;
  }
  const rel = relativeTime(last);
  const overdue = (Date.now() - new Date(last).getTime()) > BACKUP_OVERDUE_DAYS * 86400000;
  box.innerHTML = `<span class="muted">${t('backup_last')}</span>
    <bdi class="backup-date">${escapeHtml(rel || last)}</bdi>
    ${overdue ? `<span class="backup-overdue">${t('backup_overdue')}</span>` : ''}`;
}

async function downloadBackup() {
  const btn = document.getElementById('backup-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('backup_preparing'); }
  try {
    const res = await fetch(`${API}/stats/backup`, { headers: adminHeaders(), cache: 'no-store' });
    if (!res.ok) { await customAlert(t('backup_failed'), 'error'); return; }

    // نحوّل الاستجابة إلى ملف ينزّله المتصفح. الرابط المؤقت يُحرَّر بعده
    // لتفادي تسريب ذاكرة عند تكرار التنزيل.
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dawaai-jahez-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    writeLastBackup(new Date().toISOString());
    renderBackupInfo();
    await customAlert(t('backup_done'), 'success');
  } catch (err) {
    await customAlert(t('backup_failed'), 'error');
  } finally {
    const b = document.getElementById('backup-btn');
    if (b) { b.disabled = false; b.textContent = t('backup_btn'); }
  }
}

// فحص حالة النظام عبر /health. الفحص لا يحتاج مصادقة لأن المسار عام،
// لكن عرضه محصور بلوحة الإدارة إذ لا يعني المريض شيئاً.
async function checkSystemStatus() {
  const box = document.getElementById('system-status');
  if (!box) return;
  box.innerHTML = `<span class="muted">${t('system_status_checking')}</span>`;
  try {
    const res = await fetch('/health', { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    const okState = res.ok && data && data.db === 'ok';
    box.innerHTML = okState
      ? `<span class="status-dot ok"></span><span class="status-ok">${t('system_status_ok')}</span>`
      : `<span class="status-dot bad"></span><span class="status-bad">${t('system_status_degraded')}</span>`;
  } catch (err) {
    box.innerHTML = `<span class="status-dot bad"></span><span class="status-bad">${t('system_status_degraded')}</span>`;
  }
}

// ================= تعديل أسماء المستخدمين =================
// الحاجة: الحسابات تُنشأ أحياناً بأسماء مؤقتة عند التجربة، فيبقى حساب صيدلية
// حقيقية باسم لا يدل عليها، ما يربك الإدارة ويصعّب على الصيدلي تذكّر اسم دخوله.

let adminUsernameFilter = '';

function onAdminUsernameSearch(el) {
  const next = el.value.trim().toLowerCase();
  if (next === adminUsernameFilter) return;
  adminUsernameFilter = next;
  renderAdminUsernameList();
}

function renderAdminUsernameList() {
  const box = document.getElementById('admin-username-list');
  if (!box) return;
  const all = adminDataCache.pharmacies || [];
  const list = all.filter(p => {
    if (!adminUsernameFilter) return true;
    return String(p.name || '').toLowerCase().includes(adminUsernameFilter)
        || String(p.owner_username || '').toLowerCase().includes(adminUsernameFilter);
  });

  if (list.length === 0) {
    box.innerHTML = `<p class="muted" style="padding:14px 2px;">${t('admin_username_no_match')}</p>`;
    return;
  }

  box.innerHTML = list.map(p => `
    <div class="admin-username-row">
      <div class="admin-username-info">
        <span class="admin-username-name"><bdi>${escapeHtml(p.name)}</bdi></span>
        <span class="admin-username-meta">
          ${t('admin_username_current')} <bdi class="admin-username-value">${escapeHtml(p.owner_username || '')}</bdi>
        </span>
      </div>
      <div class="admin-username-controls">
        <input type="text" id="uname-input-${p.id}" placeholder="${t('admin_username_new_placeholder')}" autocomplete="off" spellcheck="false">
        <button class="btn-outline blue" id="uname-save-${p.id}" onclick="saveAdminUsername(${p.id})">${t('admin_username_save')}</button>
      </div>
    </div>`).join('');
}

async function saveAdminUsername(id) {
  const input = document.getElementById(`uname-input-${id}`);
  const btn = document.getElementById(`uname-save-${id}`);
  const next = (input.value || '').trim();
  const pharmacy = (adminDataCache.pharmacies || []).find(p => p.id === id);
  if (!pharmacy) return;

  // تحقق مبكر بالواجهة لإعطاء رسالة فورية، والخلفية تتحقق مرة أخرى
  // لأن الواجهة قابلة للتجاوز.
  if (!next) { await customAlert(t('admin_username_required'), 'warning'); return; }
  if (/\s/.test(next)) { await customAlert(t('admin_username_no_spaces'), 'warning'); return; }
  if (next.length < 3) { await customAlert(t('admin_username_too_short'), 'warning'); return; }
  if (next === pharmacy.owner_username) { input.value = ''; return; }

  const confirmed = await customConfirm(
    tFormat('admin_username_confirm', { name: pharmacy.name, old: pharmacy.owner_username || '', new: next }),
    'warning'
  );
  if (!confirmed) return;

  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${API}/pharmacies/${id}/username`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({ username: next })
    });
    const data = await res.json();
    if (!res.ok) { await customAlert(translateApiError(data.error), 'error'); return; }

    // تحديث الكاش محلياً بدل إعادة تحميل اللوحة: يحافظ على نص البحث وموضع التمرير
    pharmacy.owner_username = data.owner_username;
    renderAdminUsernameList();
    await customAlert(t('admin_username_saved'), 'success');
  } catch (err) {
    await customAlert(t('server_error_title'), 'error');
  } finally {
    const b = document.getElementById(`uname-save-${id}`);
    if (b) b.disabled = false;
  }
}

// ================= جدول المناوبة بلوحة الإدارة =================
// يوجد ضابطان للمناوبة عن قصد: الصيدلي من لوحته، والإدارة من هنا.
// السبب أن معظم صيدليات المدينة مُدرجة للمناوبة فقط ولا أحد يدير حسابها.
// القاعدة: آخر تعديل يفوز بلا أقفال — وتُعرض هوية آخر مُعدِّل ووقته
// ليرى المدير أن الصيدلي يدير مناوبته بنفسه فلا يدهس تعديله بلا قصد.

let adminDutyFilter = '';

const DUTY_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DUTY_SHIFTS = ['طوال اليوم', 'صباحاً', 'مساءً'];

// نستمع لثلاثة أحداث لا واحد: زر الـ✕ المدمج في <input type="search"> لا يُطلق
// حدث input في كل المتصفحات — بعضها يُطلق حدث search وحده. فبالاكتفاء بـinput
// كانت الكلمة تُمحى بصرياً بينما يبقى الفلتر محتفظاً بها، فتظل القائمة مفلترة
// رغم أن الحقل يبدو فارغاً.
//
// الحارس على التغيير الفعلي يمنع إعادة رسم عشرات الصفوف ثلاث مرات لحدث واحد
// حين تُطلق المتصفحات أكثر من حدث معاً.
function onAdminDutySearch(el) {
  const next = el.value.trim().toLowerCase();
  if (next === adminDutyFilter) return;
  adminDutyFilter = next;
  renderAdminDutyList();
}

// من عدّل المناوبة آخر مرة ومتى — نعرضه بنص واضح لا برمز غامض
function dutyAuditHtml(p) {
  if (!p.duty_updated_by || !p.duty_updated_at) {
    return `<span class="duty-audit muted">${t('admin_duty_never')}</span>`;
  }
  const who = p.duty_updated_by === 'admin' ? t('admin_duty_by_admin') : t('admin_duty_by_pharmacy');
  const when = relativeTime(p.duty_updated_at);
  const isPharmacy = p.duty_updated_by !== 'admin';
  return `<span class="duty-audit ${isPharmacy ? 'by-pharmacy' : ''}">${escapeHtml(who)}${when ? ' · ' + escapeHtml(when) : ''}</span>`;
}

function renderAdminDutyList() {
  const box = document.getElementById('admin-duty-list');
  if (!box) return;
  const all = adminDataCache.pharmacies || [];
  // المناوبة أولاً ثم بالاسم: المدير يريد رؤية من هو مناوب الآن في نظرة واحدة
  const list = all
    .filter(p => !adminDutyFilter || String(p.name || '').toLowerCase().includes(adminDutyFilter))
    .slice()
    .sort((a, b) => (b.on_duty ? 1 : 0) - (a.on_duty ? 1 : 0) || String(a.name).localeCompare(String(b.name), 'ar'));

  if (list.length === 0) {
    box.innerHTML = `<p class="muted" style="padding:14px 2px;">${t('admin_duty_no_match')}</p>`;
    return;
  }

  box.innerHTML = list.map(p => `
    <div class="admin-duty-row ${p.on_duty ? 'active' : ''}">
      <div class="admin-duty-info">
        <span class="admin-duty-name"><bdi>${escapeHtml(p.name)}</bdi></span>
        <span class="admin-duty-meta">
          ${p.city ? `<bdi>${escapeHtml(cityName(p.city))}</bdi><span class="admin-ph-sep">•</span>` : ''}
          ${dutyAuditHtml(p)}
        </span>
      </div>
      <div class="admin-duty-controls">
        <label class="admin-duty-toggle">
          <input type="checkbox" id="duty-on-${p.id}" ${p.on_duty ? 'checked' : ''} onchange="onAdminDutyToggle(${p.id}, this)">
          <span>${p.on_duty ? t('admin_duty_on') : t('admin_duty_off')}</span>
        </label>
        <select id="duty-day-${p.id}" ${p.on_duty ? '' : 'disabled'}>
          ${DUTY_DAYS.map(d => `<option value="${d}" ${p.on_duty_day === d ? 'selected' : ''}>${translateDutyDay(d)}</option>`).join('')}
        </select>
        <select id="duty-shift-${p.id}" ${p.on_duty ? '' : 'disabled'}>
          ${DUTY_SHIFTS.map(sh => `<option value="${sh}" ${p.on_duty_shift === sh ? 'selected' : ''}>${translateDutyShift(sh)}</option>`).join('')}
        </select>
        <button class="btn-outline blue" onclick="saveAdminDuty(${p.id})" id="duty-save-${p.id}">${t('admin_duty_save')}</button>
      </div>
    </div>`).join('');

  const counter = document.getElementById('admin-duty-count');
  if (counter) counter.textContent = tFormat('admin_duty_active_count', { n: all.filter(p => p.on_duty).length });
}

// تفعيل/تعطيل الحقول فوراً عند تبديل المربع، قبل الحفظ — تغذية راجعة لحظية
function onAdminDutyToggle(id, el) {
  const on = el.checked;
  const day = document.getElementById(`duty-day-${id}`);
  const shift = document.getElementById(`duty-shift-${id}`);
  if (day) day.disabled = !on;
  if (shift) shift.disabled = !on;
  const label = el.parentElement && el.parentElement.querySelector('span');
  if (label) label.textContent = on ? t('admin_duty_on') : t('admin_duty_off');
}

async function saveAdminDuty(id) {
  const btn = document.getElementById(`duty-save-${id}`);
  const on = document.getElementById(`duty-on-${id}`).checked;
  const day = document.getElementById(`duty-day-${id}`).value;
  const shift = document.getElementById(`duty-shift-${id}`).value;
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${API}/pharmacies/${id}/duty`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({ on_duty: on, on_duty_day: day, on_duty_shift: shift })
    });
    const data = await res.json();
    if (!res.ok) { await customAlert(translateApiError(data.error), 'error'); return; }

    // نحدّث الكاش محلياً بدل إعادة تحميل اللوحة كلها: أسرع، ويحافظ على
    // موضع التمرير ونص البحث اللذين يضيعان مع إعادة الرسم الكاملة.
    const cached = (adminDataCache.pharmacies || []).find(p => p.id === id);
    if (cached) {
      cached.on_duty = data.on_duty;
      cached.on_duty_day = data.on_duty_day;
      cached.on_duty_shift = data.on_duty_shift;
      cached.duty_updated_by = data.duty_updated_by;
      cached.duty_updated_at = data.duty_updated_at;
    }
    renderAdminDutyList();
    await customAlert(t('admin_duty_saved'), 'success');
  } catch (err) {
    await customAlert(t('server_error_title'), 'error');
  } finally {
    const b = document.getElementById(`duty-save-${id}`);
    if (b) b.disabled = false;
  }
}

async function clearAllDuty() {
  const active = (adminDataCache.pharmacies || []).filter(p => p.on_duty).length;
  if (active === 0) { await customAlert(t('admin_duty_none_active'), 'info'); return; }
  const confirmed = await customConfirm(tFormat('admin_duty_clear_confirm', { n: active }), 'warning');
  if (!confirmed) return;
  try {
    const res = await fetch(`${API}/pharmacies/duty/clear-all`, { method: 'POST', headers: adminHeaders() });
    const data = await res.json();
    if (!res.ok) { await customAlert(translateApiError(data.error), 'error'); return; }
    await customAlert(tFormat('admin_duty_cleared', { n: data.cleared }), 'success');
    renderAdminPanel();
  } catch (err) {
    await customAlert(t('server_error_title'), 'error');
  }
}

async function togglePharmacyManagesStock(id, newValue) {
  const pharmacy = (adminDataCache.pharmacies || []).find(p => p.id === id);
  const name = pharmacy ? pharmacy.name : '';
  const msg = tFormat(newValue ? 'manages_stock_confirm_on' : 'manages_stock_confirm_off', { name });
  const confirmed = await customConfirm(msg, 'warning');
  if (!confirmed) return;

  try {
    const res = await fetch(`${API}/pharmacies/${id}/manages-stock`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({ manages_stock: newValue })
    });
    const data = await res.json();
    if (!res.ok) { await customAlert(translateApiError(data.error), 'error'); return; }
    await customAlert(t('manages_stock_updated'), 'success');
    renderAdminPanel();
  } catch (err) {
    await customAlert(t('server_error_title'), 'error');
  }
}

async function savePharmacyName(id) {
  const input = document.getElementById(`edit-ph-name-${id}`);
  if (!input) return;
  const name = input.value.trim();
  if (!name) { await customAlert(t('pharmacy_name_required'), 'warning'); return; }

  const current = adminDataCache.pharmacies.find(p => p.id === id);
  // صفر تغيير فعلي → نغلق وضع التعديل بهدوء بدون أي طلب للسيرفر
  if (current && current.name === name) { cancelEditPharmacyName(); return; }

  // تحذير الاسم المكرر: نعرض الصيدلية المطابقة بالاسم واسم المستخدم ليكون القرار واعياً.
  // مقصود إنه تحذير وليس منعاً — صيدليتان بمحافظتين مختلفتين قد تحملان نفس الاسم بشكل مشروع.
  const duplicate = adminDataCache.pharmacies.find(p => p.id !== id && p.name.trim() === name);
  if (duplicate) {
    const proceed = await customConfirm(
      tFormat('duplicate_pharmacy_name_confirm', { name: duplicate.name, username: duplicate.owner_username }),
      'warning'
    );
    if (!proceed) return;
  }

  try {
    const res = await fetch(`${API}/pharmacies/${id}/name`, {
      method: 'PUT', headers: adminHeaders(), body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) {
      await customAlert(translateApiError(data.error) || t('pharmacy_name_update_error'), 'error');
      return;
    }
    editingPharmacyId = null;
    editingPharmacyNameDraft = '';
    await renderAdminPanel();
    await customAlert(tFormat('pharmacy_name_updated', { name: data.name }), 'success');
  } catch (err) {
    await customAlert(t('pharmacy_name_update_error'), 'error');
  }
}

async function deletePharmacyAdmin(id) {
  const pharmacy = adminDataCache.pharmacies.find(p => p.id === id);
  const name = pharmacy ? pharmacy.name : '';
  const confirmed = await customConfirm(tFormat('delete_pharmacy_confirm', { name }), 'warning');
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
  if (!res.ok) { customAlert(translateApiError(data.error), 'error'); return; }
  customAlert(tFormat('item_added_success', { name: data.name }), 'success');
  renderAdminPanel();
}

async function deleteMedicineAdmin(id) {
  const medicine = adminDataCache.medicines.find(m => m.id === id);
  const name = medicine ? medicine.name : '';
  const confirmed = await customConfirm(tFormat('delete_medicine_confirm', { name }), 'warning');
  if (!confirmed) return;
  await fetch(`${API}/medicines/${id}`, { method: 'DELETE', headers: adminHeaders() });
  renderAdminPanel();
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
    btn.setAttribute('aria-label', t('hide_password_aria'));
  } else {
    input.type = 'password';
    btn.textContent = '👁';
    btn.setAttribute('aria-label', t('show_password_aria'));
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
  if (!res.ok) { customAlert(translateApiError(data.error), 'error'); return; }
  customAlert(tFormat('item_added_success', { name: data.name }), 'success');
  renderAdminPanel();
}

async function deleteNurseAdmin(id) {
  const nurse = adminDataCache.nurses.find(n => n.id === id);
  const name = nurse ? nurse.name : '';
  const confirmed = await customConfirm(tFormat('delete_nurse_confirm', { name }), 'warning');
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
  const confirmed = await customConfirm(t('reject_rating_confirm'), 'warning');
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
        <button class="btn-outline green small" onclick="approveRatingAdmin(${r.id})">${t('approve_btn')}</button>
        <button class="btn-outline red small" onclick="rejectRatingAdmin(${r.id})">${t('reject_btn')}</button>
      </div>
    </div>
  `).join('');
}

let adminRatingsPollInterval = null;
let lastPendingRatingsSnapshot = null;

function startAdminRatingsPolling() {
  stopAdminRatingsPolling();
  adminRatingsPollInterval = setInterval(whenVisible(loadPendingRatingsForAdmin), POLL_ADMIN_RATINGS_MS);
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
    btn.textContent = t('hide_ratings_btn');
    if (!approvedRatingsLoaded) await loadApprovedRatingsAdmin();
  } else {
    container.style.display = 'none';
    btn.textContent = t('show_ratings_btn');
  }
}

async function loadApprovedRatingsAdmin() {
  const container = document.getElementById('approved-ratings-list');
  container.innerHTML = `<p class="muted">${t('loading_text')}</p>`;
  try {
    const res = await fetch(`${API}/nurses/ratings/approved`, { headers: adminHeaders() });
    const ratings = await res.json();
    approvedRatingsLoaded = true;
    if (ratings.length === 0) {
      container.innerHTML = `<p class="muted" style="margin:0;">${t('no_published_ratings')}</p>`;
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
          <button class="btn-outline red small" onclick="deleteApprovedRatingAdmin(${r.id})">${t('delete_final_btn')}</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p class="muted" style="margin:0;">${t('failed_load_ratings')}</p>`;
  }
}

async function deleteApprovedRatingAdmin(id) {
  const confirmed = await customConfirm(t('delete_rating_final_confirm'), 'warning');
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
  if (bellPanel && bellPanel.style.display !== 'none' && !bellPanel.contains(e.target) && bellBtn && !bellBtn.contains(e.target)) {
    bellPanel.style.display = 'none';
  }
});

showView('patient');
applyLanguage();
runSearch();
loadOnDuty();
updateCartCount();
setInterval(whenVisible(loadOnDuty), POLL_ON_DUTY_MS);
updateBellBadge();
if (myOrders.length > 0) startMyOrdersPolling();

// المستخدم قد يكون بدأ الكتابة بالبحث قبل تحميل هذا الملف (حارس التحميل المبكر بالـHTML
// يسجّل ذلك في __pendingSearch). ننفّذ بحثه الآن بدل أن يضيع تفاعله ويضطر لإعادة الكتابة.
if (window.__pendingSearch && document.getElementById('search').value.trim()) {
  runSearch();
}
window.__pendingSearch = false;

// لو فُتح الموقع والاتصال مقطوع أصلاً، فحدث offline لن يُطلق — نفحص مرة عند البدء
updateOfflineBanner();
