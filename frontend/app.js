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
    order_success_msg: 'تم إرسال طلبك بنجاح! الصيدلية رح تتواصل معك قريباً على الرقم يلي أدخلته.',
    modal_ok: 'حسناً', modal_cancel: 'إلغاء', modal_yes: 'نعم',
    onduty_title: '🟢 الصيدليات المناوبة اليوم', onduty_now_badge: '🟢 مناوبة الآن',
    onduty_empty_title: 'لا توجد صيدليات مناوبة حالياً',
    onduty_empty_subtitle: 'تحقق لاحقاً، أو تواصل مع صيدليتك المفضلة مباشرة.',
    bell_empty: 'ما في إشعارات حالياً', bell_aria_label: 'إشعارات الطلبات', bell_dismiss_aria: 'إخفاء',
    bell_confirmed_text: 'تم الاستجابة لطلبك من قبل الصيدلية',
    bell_pending_prefix: 'طلبك عند صيدلية', bell_pending_suffix: 'قيد المراجعة...',
    excess_quantity_confirm: 'لقد أضفت {qty} من {name} من {pharmacy} إلى عربتك. هل تريد إضافة المزيد؟',
    pharm_login_title: 'دخول الصيدلي',
    pharm_login_no_account: 'إذا لم يكن لديك حساب بعد، تواصل مع فريق دوائي جاهز لتسجيل صيدليتك.',
    username_placeholder: 'اسم المستخدم', password_placeholder: 'كلمة المرور', login_btn: 'دخول',
    pharm_dashboard_title: 'لوحة الصيدلي', pharmacy_label_prefix: 'صيدلية:', logout_btn: '🚪 تسجيل الخروج',
    new_orders_title: '🛎️ طلبات جديدة من المرضى',
    duty_status_title: '🕐 حالة المناوبة', duty_checkbox_label: 'صيدليتي مناوبة اليوم',
    save_duty_btn: 'حفظ حالة المناوبة',
    duty_hours_title: '⏱️ تحديد ساعات المناوبة (اختياري)',
    duty_hours_desc: 'حدد التوقيت المخصص لتظهر النتيجة بجانب يوم المناوبة.',
    duty_start_label: 'من الساعة', duty_end_label: 'إلى الساعة',
    add_med_title: '💊 إضافة دواء غير موجود بالقائمة',
    add_med_desc: 'إذا لديك دواء في مخزن الصيدلية وغير متوفر ضمن القائمة يمكنك إضافته في خانات النص المبينة أدناه.',
    med_name_placeholder: 'اسم الدواء', med_name_placeholder_cosmetic: 'اسم المستحضر',
    generic_name_placeholder: 'المادة الفعالة (اختياري)', alt_names_placeholder: 'أسماء بديلة، افصل بينها بفاصلة (اختياري)',
    cat_medicine: 'دواء', cat_cosmetic: 'مستحضر تجميل', add_med_btn: 'إضافة الدواء',
    stock_table_medicine: 'الدواء', stock_table_status: 'الحالة', delete_account_btn: '🗑️ حذف حسابي نهائياً',
    day_sunday: 'الأحد', day_monday: 'الاثنين', day_tuesday: 'الثلاثاء', day_wednesday: 'الأربعاء',
    day_thursday: 'الخميس', day_friday: 'الجمعة', day_saturday: 'السبت',
    shift_allday: 'طوال اليوم', shift_morning: 'صباحاً فقط', shift_evening: 'مساءً فقط',
    stat_total_meds: 'عدد الأدوية', stat_available_meds: 'أدوية متوفرة', stat_unavailable_meds: 'غير المتوفرة',
    stat_cosmetics: 'مستحضرات', stat_onduty_today: 'المناوبة اليوم', yes_word: 'نعم', no_word: 'لا',
    med_name_required: 'اسم الدواء مطلوب', med_added_success: 'تمت الإضافة بنجاح. فعّل حالة توفره من القائمة تحت.',
    duty_saved_success: 'تم حفظ حالة المناوبة بنجاح',
    order_new_badge: '🆕 جديد', order_confirmed_badge: '✅ تم الحجز',
    order_dismiss_btn: 'تم الاطلاع', order_confirm_btn: '✅ تأكيد الحجز', order_delete_btn: '🗑️ حذف الطلب',
    order_delete_confirm: 'متأكد إنك تعاملت مع هذا الطلب وبدك تحذفه نهائياً؟',
    delete_account_confirm: 'متأكد إنك بدك تحذف حسابك نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.',
    account_deleted_success: 'تم حذف حسابك بنجاح',
    admin_dashboard_title: 'لوحة الإدارة', admin_password_placeholder: 'كلمة مرور الإدارة', wrong_password: 'كلمة المرور غير صحيحة',
    stat_pharmacies_count: 'عدد الصيدليات', stat_onduty_pharmacies: 'الصيدليات المناوبة اليوم',
    add_pharmacy_title: '🏥 إضافة صيدلية جديدة', pharmacy_name_placeholder: 'اسم الصيدلية',
    address_placeholder: 'العنوان', phone_placeholder: 'رقم الهاتف', add_pharmacy_btn: 'إضافة الصيدلية',
    registered_pharmacies_title: 'الصيدليات المسجّلة', no_pharmacies_yet: 'لا يوجد صيدليات مسجّلة بعد.',
    pharmacies_table_header: 'الصيدلية', action_col_header: 'إجراء', delete_btn: 'حذف', onduty_badge_short: '🟢 مناوبة',
    delete_pharmacy_confirm: 'متأكد إنك بدك تحذف صيدلية "{name}"؟', pharmacy_added_success: 'تمت إضافة صيدلية "{name}" بنجاح',
    add_medicine_title_admin: '💊 إضافة دواء جديد', registered_medicines_title: 'الأدوية المسجّلة',
    item_added_success: 'تمت إضافة "{name}" بنجاح', delete_medicine_confirm: 'متأكد إنك بدك تحذف دواء "{name}" نهائياً؟',
    add_nurse_title: '🩺 إضافة ممرض جديد', nurse_name_placeholder: 'اسم الممرض', specialty_placeholder: 'التخصص',
    university_placeholder: 'الجامعة', grad_year_placeholder: 'سنة التخرج', upload_cert_btn: '📄 رفع شهادة (PDF/Word)',
    add_nurse_btn: 'إضافة الممرض', registered_nurses_title: 'الممرضون المسجّلون', no_nurses_yet: 'لا يوجد ممرضون مسجّلون بعد.',
    nurses_table_header: 'الممرض', actions_header_plural: 'إجراءات',
    nurse_available_short: '🟢 متاح', nurse_unavailable_short: '🔴 غير متاح',
    delete_nurse_confirm: 'متأكد إنك بدك تحذف الممرض "{name}"؟',
    pending_ratings_title: '⭐ تقييمات قيد المراجعة', approve_btn: '✅ موافقة', reject_btn: '🗑️ رفض',
    reject_rating_confirm: 'متأكد إنك بدك ترفض هذا التقييم؟ رح ينحذف نهائياً.',
    published_ratings_title: '💬 التقييمات المنشورة', show_ratings_btn: 'عرض التقييمات', hide_ratings_btn: 'إخفاء التقييمات',
    loading_text: 'جاري التحميل...', no_published_ratings: 'لا توجد تقييمات منشورة بعد.',
    delete_final_btn: '🗑️ حذف نهائي', failed_load_ratings: 'تعذر تحميل التقييمات.',
    delete_rating_final_confirm: 'متأكد إنك بدك تحذف هذا التقييم نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.',
    upload_cert_coming_soon: 'رفع الشهادات (PDF/Word) رح يتفعّل بعد ربط استضافة دائمة للملفات 📄',
    nursing_empty_title: 'لا يوجد ممرضون مسجّلون حالياً', nursing_empty_subtitle: 'سوف يتم إضافة ممرضين موثوقين قريباً.',
    nurse_available_full: '🟢 متاح للعمل', nurse_unavailable_full: '🔴 غير متاح حالياً',
    general_nurse_label: 'ممرض عام', rating_summary_suffix: 'من {count} تقييم',
    no_ratings_yet_short: 'لا توجد تقييمات بعد', view_profile_btn: 'لمحة عنه',
    grad_year_label: 'تخرج', patient_reviews_title: 'آراء المرضى ({count})',
    no_published_reviews: 'لا توجد آراء منشورة بعد.', rate_this_nurse_title: 'قيّم هذا الممرض',
    already_rated_msg: 'شكراً، تم إرسال تقييمك مسبقاً وهو الآن قيد مراجعة الإدارة.',
    comment_placeholder: 'اكتب رأيك (اختياري)', your_name_placeholder: 'اسمك', your_phone_placeholder: 'رقم هاتفك',
    submit_rating_btn: 'إرسال التقييم',
    star_rate_one: 'قيّم نجمة واحدة من 5', star_rate_two: 'قيّم نجمتين من 5', star_rate_n: 'قيّم {n} نجوم من 5',
    select_stars_first: 'الرجاء اختيار عدد النجوم أولاً', name_phone_required: 'الاسم ورقم الهاتف مطلوبان',
    rating_submitted_success: 'تم إرسال تقييمك بنجاح! رح يظهر للعموم بعد موافقة الإدارة عليه.',
    nursing_page_title: 'خدمات تمريض 🩺', nursing_page_desc: 'تواصل مع ممرضين موثوقين لتلقي الرعاية التمريضية بمنزلك.',
    show_password_aria: 'إظهار كلمة المرور', hide_password_aria: 'إخفاء كلمة المرور',
    whatsapp_coming_soon: 'البحث عبر واتساب قريباً 💬 لسا عم نجهز رقم رسمي للمشروع.',
    contact_coming_soon: 'سيتم إضافة معلومات التواصل قريباً.',
    invalid_credentials: 'بيانات الدخول غير صحيحة',
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
    order_success_msg: 'Your order has been sent successfully! The pharmacy will contact you soon on the number you entered.',
    modal_ok: 'OK', modal_cancel: 'Cancel', modal_yes: 'Yes',
    onduty_title: '🟢 Pharmacies on duty today', onduty_now_badge: '🟢 On duty now',
    onduty_empty_title: 'No pharmacies on duty right now',
    onduty_empty_subtitle: 'Check back later, or contact your usual pharmacy directly.',
    bell_empty: 'No notifications yet', bell_aria_label: 'Order notifications', bell_dismiss_aria: 'Dismiss',
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
    day_sunday: 'Sunday', day_monday: 'Monday', day_tuesday: 'Tuesday', day_wednesday: 'Wednesday',
    day_thursday: 'Thursday', day_friday: 'Friday', day_saturday: 'Saturday',
    shift_allday: 'All day', shift_morning: 'Morning only', shift_evening: 'Evening only',
    stat_total_meds: 'Total medicines', stat_available_meds: 'Available medicines', stat_unavailable_meds: 'Unavailable',
    stat_cosmetics: 'Cosmetics', stat_onduty_today: 'On duty today', yes_word: 'Yes', no_word: 'No',
    med_name_required: 'Medicine name is required', med_added_success: 'Added successfully. Enable its availability from the list below.',
    duty_saved_success: 'Duty status saved successfully',
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
    whatsapp_coming_soon: "Search via WhatsApp coming soon 💬 We're setting up an official number for the project.",
    contact_coming_soon: 'Contact information will be added soon.',
    invalid_credentials: 'Invalid login credentials',
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
  'بيانات الدخول غير صحيحة': 'invalid_credentials'
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

  document.getElementById('bell-btn').setAttribute('aria-label', t('bell_aria_label'));
  renderBellPanel();
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
      <span style="font-weight:500; font-size:16px;">${t('pharmacy_label_prefix')} ${currentPharmacy.name}</span>
      <button class="action-pill-btn blue" onclick="logout()">${t('logout_btn')}</button>
    `;
    renderStockUI();
    renderOrdersUI();
  } else if (document.getElementById('pharmacist-auth-section').innerHTML.trim()) {
    renderPharmacyAuthForm();
  }

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
}

function updateCartCount() {
  const el = document.getElementById('cart-count');
  if (el) el.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
}

async function addToCart(medicineName, genericName, pharmacyName, pharmacyId, btn) {
  const existing = cart.find(item => item.medicineName === medicineName && item.pharmacyId === pharmacyId);
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
    if (!res.ok) { customAlert(translateApiError(data.error), 'error'); return; }

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
    panel.innerHTML = `<div class="bell-panel-empty">${t('bell_empty')}</div>`;
    return;
  }
  panel.innerHTML = myOrders.map(o => {
    if (o.status === 'confirmed') {
      return `
        <div class="order-status-banner confirmed">
          <div class="order-status-banner-text">
            <span class="order-status-icon">✅</span>
            <span>${t('bell_confirmed_text')} (${o.pharmacyName})</span>
          </div>
          <button class="order-status-dismiss" onclick="dismissMyOrder(${o.id})" aria-label="${t('bell_dismiss_aria')}">✕</button>
        </div>`;
    }
    return `
      <div class="order-status-banner pending">
        <div class="order-status-banner-text">
          <span class="order-status-icon">⏳</span>
          <span>${t('bell_pending_prefix')} (${o.pharmacyName}) ${t('bell_pending_suffix')}</span>
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
                  <span class="duty-card-name">${p.name}</span>
                  <span class="duty-status-badge">${t('onduty_now_badge')}</span>
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
          <input id="rating-name-${nurseId}" placeholder="${t('your_name_placeholder')}">
          <input id="rating-phone-${nurseId}" placeholder="${t('your_phone_placeholder')}" type="tel" inputmode="numeric" oninput="digitsOnly(this)">
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
    <span style="font-weight:500; font-size:16px;">${t('pharmacy_label_prefix')} ${currentPharmacy.name}</span>
    <button class="action-pill-btn blue" onclick="logout()">${t('logout_btn')}</button>
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

function logout() {
  currentPharmacy = null;
  stopOrdersPolling();
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
  const res = await fetch(`${API}/stock/${currentPharmacy.id}`);
  const data = await res.json();
  pharmacistStockCache = data;
  renderStockUI();
}

// إعادة رسم قائمة المخزون وبطاقات الإحصاء من آخر بيانات محفوظة، بدون أي طلب شبكة — تُستخدم عند تبديل اللغة
function renderStockUI() {
  const data = pharmacistStockCache;
  document.getElementById('stock-list').innerHTML = data.map(m => `
    <div class="row">
      <span>${m.name} <span class="muted" style="font-size:12px;">${m.category === 'cosmetic' ? '💄' : '💊'}</span></span>
      <button class="toggle-btn ${m.available ? 'yes' : 'no'}" onclick="toggleStock(${m.medicine_id}, ${!m.available})">
        ${m.available ? t('available_badge') : t('unavailable_badge')}
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
      <div class="stat-label">${t('stat_cosmetics')}</div>
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
    pharmacistOrdersCache = orders;
    renderOrdersUI();
  } catch (err) { /* تجاهل بصمت لو فشل الجلب، الأهم لوحة الصيدلي نفسها */ }
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
        <span class="order-patient-name">👤 ${o.patient_name}</span>
        ${!o.seen ? `<span class="order-new-badge">${t('order_new_badge')}</span>` : ''}
        ${o.status === 'confirmed' ? `<span class="order-confirmed-badge">${t('order_confirmed_badge')}</span>` : ''}
      </div>
      <div class="order-row"><span>📞</span> ${o.patient_phone}</div>
      <div class="order-row"><span>🕐</span> ${new Date(o.created_at).toLocaleString(currentLang === 'en' ? 'en-US' : 'ar-SY')}</div>
      <div class="order-items-list">
        ${o.items.map(it => `<div class="order-item-line">💊 ${it.medicineName}${it.genericName ? ' - ' + it.genericName : ''} × ${it.quantity}</div>`).join('')}
      </div>
      <div class="order-actions-row">
        ${!o.seen ? `<button class="btn-outline blue small" onclick="dismissOrder(${o.id})">${t('order_dismiss_btn')}</button>` : ''}
        ${o.status !== 'confirmed' ? `<button class="btn-outline green small" onclick="confirmOrderAction(${o.id})">${t('order_confirm_btn')}</button>` : ''}
        <button class="btn-outline red small" onclick="removeOrder(${o.id})">${t('order_delete_btn')}</button>
      </div>
    </div>
  `).join('');
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
  const confirmed = await customConfirm(t('order_delete_confirm'), 'warning');
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
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('admin-panel').innerHTML = '';
  renderAdminAuthForm();
}

function adminHeaders() {
  return { 'Content-Type': 'application/json', 'x-admin-password': adminPassword };
}

// ذاكرة مؤقتة لآخر بيانات جُلبت من السيرفر — عشان تبديل اللغة يعيد الرسم بس، بدون طلبات شبكة جديدة
let adminDataCache = { pharmacies: [], medicines: [], nurses: [], pendingRatings: [] };

async function renderAdminPanel() {
  const [pharmacies, medicines, nurses, pendingRatings] = await Promise.all([
    fetch(`${API}/pharmacies`, { headers: adminHeaders() }).then(r => r.json()),
    fetch(`${API}/medicines`, { headers: adminHeaders() }).then(r => r.json()),
    fetch(`${API}/nurses`).then(r => r.json()),
    fetch(`${API}/nurses/ratings/pending`, { headers: adminHeaders() }).then(r => r.json())
  ]);
  adminDataCache = { pharmacies, medicines, nurses, pendingRatings };
  renderAdminPanelUI();
}

// إعادة رسم اللوحة من آخر بيانات محفوظة بدون أي طلب شبكة جديد — تُستخدم عند تبديل اللغة بس
function renderAdminPanelUI() {
  const { pharmacies, medicines, nurses, pendingRatings } = adminDataCache;

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

    <div class="box" style="margin-bottom:20px;">
      <h3 style="margin-top:0;">${t('add_pharmacy_title')}</h3>
      <input id="ph-name" placeholder="${t('pharmacy_name_placeholder')}">
      <input id="ph-address" placeholder="${t('address_placeholder')}">
      <input id="ph-phone" placeholder="${t('phone_placeholder')}">
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
             ${pharmacies.map(p => `
               <div class="row">
                 <span>${p.name} <span class="muted">(${p.owner_username})</span>${p.on_duty ? ` <span class="badge yes" style="margin-right:6px;">${t('onduty_badge_short')}</span>` : ''}</span>
                 <button class="btn-outline red small table-action-btn" onclick="deletePharmacyAdmin(${p.id}, '${p.name}')">${t('delete_btn')}</button>
               </div>
             `).join('')}`
        }
      </div>
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
            <span>${m.name} <span class="muted" style="font-size:12px;">${m.category === 'cosmetic' ? '💄 ' + t('cat_cosmetic') : '💊 ' + t('cat_medicine')}</span></span>
            <button class="btn-outline red small table-action-btn" onclick="deleteMedicineAdmin(${m.id}, '${m.name}')">${t('delete_btn')}</button>
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
                 <span>${n.name} <span class="muted" style="font-size:12px;">${n.specialty || ''}</span></span>
                 <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
                   <button class="toggle-btn ${n.available ? 'yes' : 'no'}" onclick="toggleNurseAvailabilityAdmin(${n.id}, ${!n.available})">${n.available ? t('nurse_available_short') : t('nurse_unavailable_short')}</button>
                   <button class="btn-outline red small table-action-btn" onclick="deleteNurseAdmin(${n.id}, '${n.name}')">${t('delete_btn')}</button>
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
  if (!res.ok) { customAlert(translateApiError(data.error), 'error'); return; }
  customAlert(tFormat('pharmacy_added_success', { name: data.name }), 'success');
  renderAdminPanel();
}

async function deletePharmacyAdmin(id, name) {
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

async function deleteMedicineAdmin(id, name) {
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

async function deleteNurseAdmin(id, name) {
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
