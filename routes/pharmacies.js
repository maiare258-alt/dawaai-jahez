const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');
const rateLimit = require('../middleware/rateLimit');

// المدن المسموحة — مراكز المحافظات السورية الأربع عشرة + سلمية (نقطة الانطلاق).
// تُخزَّن بقاعدة البيانات كمفاتيح إنكليزية ثابتة، وتُترجم للعرض بالواجهة.
// ⚠️ عند إضافة مدينة جديدة هنا، يجب إضافة ترجمتها في CITIES بملف frontend/app.js
//    وإلا ظهر المفتاح الخام (مثل 'homs') للمستخدم بدل اسم المدينة.
// الحد الأدنى لطول كلمة المرور. متعمَّد أن يكون معتدلاً: الصيادلة يدخلون من الهاتف
// غالباً، وشرط مبالغ فيه يدفعهم لكتابة الكلمة على ورقة بجانب الجهاز.
const MIN_PASSWORD_LENGTH = 8;

// حروف توليد كلمة المرور. حُذفت عمداً الأحرف والأرقام المتشابهة بصرياً (0/O/o، 1/l/I)
// لأن الإدارة ستقرأ الكلمة وتمليها هاتفياً على الصيدلي.
const GEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

// توليد بمولّد آمن تشفيرياً (crypto لا Math.random — الأخيرة نتائجها متوقعة نظرياً
// وغير مناسبة إطلاقاً لأي استخدام أمني).
function generatePassword(length = 12) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += GEN_ALPHABET[bytes[i] % GEN_ALPHABET.length];
  return out;
}

// ===== تنسيق رقم واتساب السوري =====
// روابط wa.me تتطلب الصيغة الدولية بلا "+" ولا أصفار بادئة ولا مسافات:
// 963932985852. والصيادلة سيكتبون الرقم بصيغ مختلفة، فنوحّدها كلها هنا
// في مكان واحد بدل ترك التنسيق للواجهة (الواجهة قابلة للتجاوز، والخلفية لا).
//
// الصيغ المقبولة كلها تعطي النتيجة نفسها:
//   0932985852 · 932985852 · +963932985852 · 00963932985852 · 963 932 985 852
//
// الرقم المحمول السوري: 9XXXXXXXX (تسع خانات تبدأ بـ9) بعد رمز الدولة 963.
const SYRIA_CODE = '963';
function normalizeWhatsappPhone(raw) {
  if (raw === undefined || raw === null) return { value: null, error: null };
  const asText = String(raw).trim();
  if (asText === '') return { value: null, error: null };   // مسح الرقم إجراء مشروع

  // نحذف كل ما ليس رقماً: المسافات والشرطات والأقواس و"+" — ونحتفظ بالأرقام العربية الشرقية
  // بعد تحويلها، لأن الصيدلي قد يكتب بلوحة مفاتيح عربية.
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  let digits = '';
  for (const ch of asText) {
    const ai = arabicDigits.indexOf(ch);
    if (ai >= 0) digits += String(ai);
    else if (ch >= '0' && ch <= '9') digits += ch;
  }
  if (!digits) return { value: null, error: 'رقم واتساب غير صالح' };

  if (digits.startsWith('00' + SYRIA_CODE)) digits = digits.slice(2);        // 00963...
  else if (digits.startsWith(SYRIA_CODE)) { /* 963... جاهز */ }
  else if (digits.startsWith('0')) digits = SYRIA_CODE + digits.slice(1);    // 09... محلي
  else if (digits.length === 9 && digits.startsWith('9')) digits = SYRIA_CODE + digits; // 9...

  // التحقق النهائي: 963 + تسع خانات تبدأ بـ9 = 12 خانة
  const ok = digits.length === 12 && digits.startsWith(SYRIA_CODE + '9');
  if (!ok) return { value: null, error: 'رقم واتساب غير صالح' };
  return { value: digits, error: null };
}

// ===== التحقق من إحداثيات الصيدلية =====
// المصدران المحتملان: زر GPS بمتصفح الصيدلي، أو لصق يدوي من خرائط جوجل.
// الثاني هو الخطر: قد يُلصق نص فيه أحرف أو أرقام خارج المدى أو مقلوبة.
// نتحقق في الخلفية لا الواجهة فقط — الواجهة قابلة للتجاوز، والخلفية لا.
//
// نقبل: رقماً، أو نصاً رقمياً، أو نصاً بأرقام عربية شرقية.
// نرفض: NaN، اللانهاية، خارج المدى الجغرافي، و(0,0) — وهي إحداثية في المحيط
// الأطلسي تنتج عادةً عن حقل فارغ أو خطأ تحويل، لا عن موقع حقيقي.
// "فارغ" = غير موجود أو نص فراغات. ما عداه يجب أن يكون رقماً أو نصاً رقمياً.
function isBlankCoord(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function parseCoordinate(raw, max) {
  if (isBlankCoord(raw)) return { value: null, error: null };
  // نرفض الأنواع غير البدائية صراحةً: String([]) تعطي نصاً فارغاً يتحول إلى 0 بصمت،
  // فيُخزَّن موقع خاطئ بدل أن يُرفض المدخل.
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    return { value: null, error: 'إحداثيات غير صالحة' };
  }
  let text = String(raw).trim();
  if (text === '') return { value: null, error: 'إحداثيات غير صالحة' };
  // تحويل الأرقام العربية الشرقية، فقد يلصق الصيدلي من لوحة مفاتيح عربية
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  text = text.replace(/[٠-٩]/g, ch => String(arabicDigits.indexOf(ch)));
  const num = Number(text);
  if (!Number.isFinite(num)) return { value: null, error: 'إحداثيات غير صالحة' };
  if (num < -max || num > max) return { value: null, error: 'إحداثيات غير صالحة' };
  // ست خانات عشرية ≈ 11 سم — أدق مما يحتاجه أي مستخدم، وتمنع تخزين دقة وهمية
  return { value: Math.round(num * 1e6) / 1e6, error: null };
}

// يتحقق من الزوج معاً: الموقع إما كامل أو ممسوح، ولا يوجد نصف موقع.
function parseLocation(rawLat, rawLng) {
  const latEmpty = isBlankCoord(rawLat);
  const lngEmpty = isBlankCoord(rawLng);
  if (latEmpty && lngEmpty) return { latitude: null, longitude: null, error: null };  // مسح
  if (latEmpty || lngEmpty) return { latitude: null, longitude: null, error: 'إحداثيات غير صالحة' };

  const lat = parseCoordinate(rawLat, 90);
  if (lat.error) return { latitude: null, longitude: null, error: lat.error };
  const lng = parseCoordinate(rawLng, 180);
  if (lng.error) return { latitude: null, longitude: null, error: lng.error };
  if (lat.value === 0 && lng.value === 0) {
    return { latitude: null, longitude: null, error: 'إحداثيات غير صالحة' };
  }
  return { latitude: lat.value, longitude: lng.value, error: null };
}

const ALLOWED_CITIES = [
  'damascus', 'rif_dimashq', 'aleppo', 'homs', 'hama', 'salamiyah',
  'latakia', 'tartus', 'idlib', 'deir_ez_zor', 'hasakah', 'raqqa',
  'daraa', 'suwayda', 'quneitra'
];

// عرض الصيدليات المناوبة حالياً (متاح للجميع - واجهة المريض)
// GET /api/pharmacies/on-duty
router.get('/on-duty', async (req, res) => {
  // فلتر مدينة اختياري: أي قيمة غير معروفة تُتجاهل بأمان فتُعاد كل الصيدليات
  const city = ALLOWED_CITIES.includes(req.query.city) ? req.query.city : null;
  try {
    res.json(await db.getOnDutyPharmacies(city));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب الصيدليات المناوبة' });
  }
});

// الصيدليات التي لديها واتساب (متاح للجميع — واجهة المريض)
// GET /api/pharmacies/whatsapp?city=salamiyah
//
// تخدم قائمة "الاستشارة الدوائية" بالصفحة الرئيسية: أسئلة لا تبدأ من بحث عن دواء
// (وصفة غير واضحة، جرعة، بديل دوائي). لهذا هي مسار مستقل عن نتائج البحث.
// صفر بيانات حساسة بالاستجابة: لا كلمات مرور ولا أسماء مستخدمين.
router.get('/whatsapp', async (req, res) => {
  const city = ALLOWED_CITIES.includes(req.query.city) ? req.query.city : null;
  try {
    res.json(await db.getWhatsappPharmacies(city));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب الصيدليات' });
  }
});

// عرض كل الصيدليات (للإدارة فقط)
// GET /api/pharmacies
router.get('/', adminAuth, async (req, res) => {
  try {
    res.json(await db.getAllPharmacies());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب الصيدليات' });
  }
});

// تسجيل صيدلية جديدة (للإدارة فقط)
// POST /api/pharmacies/register  { name, address, phone, username, password }
router.post('/register', adminAuth, async (req, res) => {
  const { name, address, phone, city, whatsapp_phone, manages_stock, username, password } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'الاسم واسم المستخدم وكلمة المرور مطلوبة' });
  }
  // المدينة مطلوبة للصيدليات الجديدة: بدونها تنكسر الفلترة وتفقد المنصة قابلية التوسع.
  // السجلات القديمة تبقى صالحة لأن العمود اختياري بقاعدة البيانات (عُبِّئت بسلمية).
  if (!city) return res.status(400).json({ error: 'المدينة مطلوبة' });
  if (!ALLOWED_CITIES.includes(city)) {
    return res.status(400).json({ error: 'مدينة غير صالحة' });
  }
  // رقم واتساب اختياري بالتسجيل — لكن لو أُدخل فيجب أن يكون صالحاً،
  // فرقم تالف يُنتج رابطاً ميتاً يراه المريض كعطل بالمنصة.
  const { value: waPhone, error: waError } = normalizeWhatsappPhone(whatsapp_phone);
  if (waError) return res.status(400).json({ error: waError });
  try {
    if (await db.findPharmacyByUsername(username)) {
      return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const pharmacy = await db.addPharmacy({ name, address, phone, city, whatsappPhone: waPhone, managesStock: manages_stock === true || manages_stock === 'true', username, passwordHash });
    const { owner_password_hash, ...safePharmacy } = pharmacy;
    res.status(201).json(safePharmacy);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء التسجيل' });
  }
});

// تسجيل دخول الصيدلي
// POST /api/pharmacies/login  { username, password }
// 10 محاولات كل 15 دقيقة لكل عنوان. رقم متعمَّد الاعتدال: صيدلي ينسى كلمته
// ويحاول مرات قليلة لن يُحظر، بينما التخمين الآلي (آلاف المحاولات) يُقطع فوراً.
router.post('/login', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }
  try {
    const pharmacy = await db.findPharmacyByUsername(username);
    if (!pharmacy) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    const valid = await bcrypt.compare(password, pharmacy.owner_password_hash);
    if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    res.json({
      id: pharmacy.id,
      name: pharmacy.name,
      address: pharmacy.address,
      city: pharmacy.city || null,
      assistant_phone: pharmacy.assistant_phone || null,
      whatsapp_phone: pharmacy.whatsapp_phone || null,
      manages_stock: pharmacy.manages_stock === true,
      latitude: pharmacy.latitude !== null && pharmacy.latitude !== undefined ? pharmacy.latitude : null,
      longitude: pharmacy.longitude !== null && pharmacy.longitude !== undefined ? pharmacy.longitude : null,
      on_duty: !!pharmacy.on_duty,
      on_duty_day: pharmacy.on_duty_day || null,
      on_duty_shift: pharmacy.on_duty_shift || null,
      on_duty_start_time: pharmacy.on_duty_start_time || null,
      on_duty_end_time: pharmacy.on_duty_end_time || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الدخول' });
  }
});

// حذف الصيدلي لحسابه الخاص فقط
// DELETE /api/pharmacies/self  { username, password }
router.delete('/self', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'بيانات الدخول مطلوبة لتأكيد الحذف' });
  }
  try {
    const pharmacy = await db.findPharmacyByUsername(username);
    if (!pharmacy) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    const valid = await bcrypt.compare(password, pharmacy.owner_password_hash);
    if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    await db.deletePharmacy(pharmacy.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء حذف الحساب' });
  }
});

// تحديث حالة المناوبة (الصيدلي لحسابه هو فقط)
// PUT /api/pharmacies/self/duty  { username, password, on_duty, on_duty_day, on_duty_shift, on_duty_start_time, on_duty_end_time }
router.put('/self/duty', async (req, res) => {
  const { username, password, on_duty, on_duty_day, on_duty_shift, on_duty_start_time, on_duty_end_time } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'بيانات الدخول مطلوبة' });
  }
  try {
    const pharmacy = await db.findPharmacyByUsername(username);
    if (!pharmacy) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    const valid = await bcrypt.compare(password, pharmacy.owner_password_hash);
    if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    const updated = await db.setDutyStatus(pharmacy.id, on_duty, on_duty_day, on_duty_shift, on_duty_start_time, on_duty_end_time);
    res.json({
      on_duty: updated.on_duty,
      on_duty_day: updated.on_duty_day,
      on_duty_shift: updated.on_duty_shift,
      on_duty_start_time: updated.on_duty_start_time,
      on_duty_end_time: updated.on_duty_end_time
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث حالة المناوبة' });
  }
});

// تحديث رقم الهاتف المساعد (الصيدلي لحسابه هو فقط)
// PUT /api/pharmacies/self/assistant-phone  { username, password, assistant_phone }
router.put('/self/assistant-phone', async (req, res) => {
  const { username, password, assistant_phone } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'بيانات الدخول مطلوبة' });
  }
  try {
    const pharmacy = await db.findPharmacyByUsername(username);
    if (!pharmacy) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    const valid = await bcrypt.compare(password, pharmacy.owner_password_hash);
    if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    const updated = await db.setAssistantPhone(pharmacy.id, assistant_phone);
    res.json({ assistant_phone: updated.assistant_phone });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث الرقم المساعد' });
  }
});

// تغيير الصيدلي كلمة مروره بنفسه (يتطلب معرفة الكلمة الحالية)
// PUT /api/pharmacies/self/password  { username, password, new_password }
//
// الاستخدام الروتيني: الصيدلي يعرف كلمته ويريد تغييرها (شكّ بتسريبها، أو استلم كلمة
// مولّدة من الإدارة ويريد واحدة يتذكرها). بدون هذا المسار كان كل تغيير يمر عبر
// الإدارة فتتحول لمكتب دعم فني.
router.put('/self/password', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  const { username, password, new_password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'بيانات الدخول مطلوبة' });
  }
  if (!new_password || typeof new_password !== 'string') {
    return res.status(400).json({ error: 'كلمة المرور الجديدة مطلوبة' });
  }
  if (new_password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة قصيرة جداً' });
  }
  if (new_password === password) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة مطابقة للحالية' });
  }
  try {
    const pharmacy = await db.findPharmacyByUsername(username);
    if (!pharmacy) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    const valid = await bcrypt.compare(password, pharmacy.owner_password_hash);
    if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    const hash = await bcrypt.hash(new_password, 10);
    await db.setPharmacyPassword(pharmacy.id, hash);
    // صفر إعادة للكلمة أو الهاش بالرد — الواجهة تعرف الجديدة أصلاً لأنها أرسلتها
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تغيير كلمة المرور' });
  }
});

// إعادة تعيين كلمة مرور صيدلية (للإدارة فقط)
// POST /api/pharmacies/:id/reset-password
//
// حالة الطوارئ: الصيدلي نسي كلمته. المشروع لا يملك بريداً ولا SMS، فالتحقق من الهوية
// بشري: الإدارة تعرف صيدلياتها وتتحقق بنفسها قبل الضغط.
//
// قرار مقصود: النظام يولّد الكلمة ولا تكتبها الإدارة — الكلمات المكتوبة يدوياً تحت
// الضغط ضعيفة ومتكررة. تُعاد الكلمة الصريحة مرة واحدة فقط في هذا الرد، ولا تُخزَّن
// ولا تُسجَّل بأي سجل، والمخزَّن هو الهاش وحده.
//
// صفر مساس بأي بيانات أخرى: المخزون والطلبات والمناوبة واسم المستخدم تبقى كما هي،
// وهذا جوهر الميزة — البديل الوحيد سابقاً كان حذف الحساب وفقدان كل شيء.
router.post('/:id/reset-password', adminAuth, async (req, res) => {
  try {
    const pharmacy = await db.getPharmacyById(req.params.id);
    if (!pharmacy) return res.status(404).json({ error: 'الصيدلية غير موجودة' });

    const newPassword = generatePassword(12);
    const hash = await bcrypt.hash(newPassword, 10);
    await db.setPharmacyPassword(pharmacy.id, hash);

    res.json({ success: true, name: pharmacy.name, username: pharmacy.owner_username, new_password: newPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء إعادة تعيين كلمة المرور' });
  }
});

// تحديث رقم واتساب الصيدلية (الصيدلي لحسابه هو فقط)
// PUT /api/pharmacies/self/whatsapp  { username, password, whatsapp_phone }
//
// الصيدلي يملك رقمه ويعرف أيّه يعمل على واتساب، فهو الجهة الصحيحة لإدخاله.
// إرسال قيمة فارغة يمسح الرقم — إجراء مشروع لمن أوقف واتساب عمله.
router.put('/self/whatsapp', async (req, res) => {
  const { username, password, whatsapp_phone } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'بيانات الدخول مطلوبة' });
  }
  const { value: waPhone, error: waError } = normalizeWhatsappPhone(whatsapp_phone);
  if (waError) return res.status(400).json({ error: waError });
  try {
    const pharmacy = await db.findPharmacyByUsername(username);
    if (!pharmacy) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    const valid = await bcrypt.compare(password, pharmacy.owner_password_hash);
    if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    const updated = await db.setWhatsappPhone(pharmacy.id, waPhone);
    res.json({ whatsapp_phone: updated.whatsapp_phone });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث رقم واتساب' });
  }
});

// تحديث موقع الصيدلية على الخريطة (الصيدلي لحسابه هو فقط)
// PUT /api/pharmacies/self/location  { username, password, latitude, longitude }
//
// الصيدلي هو الجهة الصحيحة: يضغط "تحديد موقعي" وهو داخل صيدليته فيُقرأ موقعه
// من GPS جهازه بدقة أمتار — صفر كتابة وصفر خطأ بشري.
// إرسال قيمتين فارغتين يمسح الموقع.
router.put('/self/location', async (req, res) => {
  const { username, password, latitude, longitude } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'بيانات الدخول مطلوبة' });
  }
  const loc = parseLocation(latitude, longitude);
  if (loc.error) return res.status(400).json({ error: loc.error });
  try {
    const pharmacy = await db.findPharmacyByUsername(username);
    if (!pharmacy) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    const valid = await bcrypt.compare(password, pharmacy.owner_password_hash);
    if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    const updated = await db.setPharmacyLocation(pharmacy.id, loc.latitude, loc.longitude);
    res.json({ latitude: updated.latitude, longitude: updated.longitude });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث الموقع' });
  }
});

// تحديث موقع أي صيدلية (للإدارة فقط)
// PUT /api/pharmacies/:id/location  { latitude, longitude }
//
// يخدم حالة تسجيل صيدلية عن بُعد: الإدارة تلصق الإحداثيات من خرائط جوجل
// بدل انتظار الصيدلي حتى يفتح لوحته من داخل صيدليته.
router.put('/:id/location', adminAuth, async (req, res) => {
  const loc = parseLocation(req.body.latitude, req.body.longitude);
  if (loc.error) return res.status(400).json({ error: loc.error });
  try {
    const existing = await db.getPharmacyById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'الصيدلية غير موجودة' });

    const updated = await db.setPharmacyLocation(req.params.id, loc.latitude, loc.longitude);
    res.json({ id: updated.id, name: updated.name, latitude: updated.latitude, longitude: updated.longitude });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث الموقع' });
  }
});

// تبديل حالة "تُحدّث مخزونها" (للإدارة فقط)
// PUT /api/pharmacies/:id/manages-stock  { manages_stock: true|false }
//
// الإدارة وحدها تقرر أي صيدلية مُدرجة رسمياً بمخزونها، وأيها مُدرجة للمناوبة فقط.
// القرار إداري لا يخص الصيدلي، فلا يُتاح من لوحته.
router.put('/:id/manages-stock', adminAuth, async (req, res) => {
  const raw = req.body.manages_stock;
  // نقبل القيمة المنطقية أو نصها فقط — لا نستخدم truthiness حتى لا يُفسَّر
  // نص مثل "false" على أنه true.
  if (raw !== true && raw !== false && raw !== 'true' && raw !== 'false') {
    return res.status(400).json({ error: 'قيمة غير صالحة' });
  }
  const value = raw === true || raw === 'true';
  try {
    const existing = await db.getPharmacyById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'الصيدلية غير موجودة' });

    const updated = await db.setManagesStock(req.params.id, value);
    res.json({ id: updated.id, name: updated.name, manages_stock: updated.manages_stock });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث حالة الصيدلية' });
  }
});

// تعديل اسم صيدلية (للإدارة فقط)
// PUT /api/pharmacies/:id/name  { name }
//
// قرار تصميمي مقصود: هذه الميزة للإدارة حصراً، وغير متاحة للصيدلي إطلاقاً.
// السبب: اسم الصيدلية هوية عامة يراها كل المرضى بنتائج البحث وصفحة المناوبة، فلو تُرك
// للصيدلي لأمكن انتحال اسم صيدلية أخرى أو استخدام اسم دعائي مضلل. الإدارة هي الجهة
// الوحيدة التي تتحقق من الصيدليات، فيبقى الاسم بيدها.
//
// مقصود أيضاً: التعديل يشمل الاسم فقط. صفر مساس بـowner_username أو كلمة المرور أو
// أي بيانات أخرى — تغيير الاسم ليس نقل ملكية.
//
// ملاحظة معمارية للمستقبل: صفر منع للأسماء المكررة هنا عن قصد، لأن التوسع خارج سلمية
// يعني وجود صيدليات متطابقة الاسم بمحافظات مختلفة (وهو أمر مشروع تماماً). الواجهة
// تعرض تحذيراً وتطلب تأكيداً. عند التوسع الوطني، الحل الصحيح إضافة عمود city
// وجعل التفرّد على (name, city) وليس على الاسم وحده.
router.put('/:id/name', adminAuth, async (req, res) => {
  // تنظيف المسافات الزائدة: بدونه " صيدلية 1" و"صيدلية 1" اسمان مختلفان بالعرض
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'اسم الصيدلية مطلوب' });
  try {
    const existing = await db.getPharmacyById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'الصيدلية غير موجودة' });

    const updated = await db.setPharmacyName(req.params.id, name);
    // نحذف الهاش من الرد بنفس أسلوب مسار التسجيل — صفر تسريب لبيانات المصادقة
    const { owner_password_hash, ...safePharmacy } = updated;
    res.json(safePharmacy);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تعديل اسم الصيدلية' });
  }
});

// حذف أي صيدلية (للإدارة فقط)
// DELETE /api/pharmacies/:id
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    await db.deletePharmacy(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء حذف الصيدلية' });
  }
});

module.exports = router;
