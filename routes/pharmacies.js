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
  const { name, address, phone, city, username, password } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'الاسم واسم المستخدم وكلمة المرور مطلوبة' });
  }
  // المدينة مطلوبة للصيدليات الجديدة: بدونها تنكسر الفلترة وتفقد المنصة قابلية التوسع.
  // السجلات القديمة تبقى صالحة لأن العمود اختياري بقاعدة البيانات (عُبِّئت بسلمية).
  if (!city) return res.status(400).json({ error: 'المدينة مطلوبة' });
  if (!ALLOWED_CITIES.includes(city)) {
    return res.status(400).json({ error: 'مدينة غير صالحة' });
  }
  try {
    if (await db.findPharmacyByUsername(username)) {
      return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const pharmacy = await db.addPharmacy({ name, address, phone, city, username, passwordHash });
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
