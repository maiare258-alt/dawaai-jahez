const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');

// عرض الصيدليات المناوبة حالياً (متاح للجميع - واجهة المريض)
// GET /api/pharmacies/on-duty
router.get('/on-duty', async (req, res) => {
  try {
    res.json(await db.getOnDutyPharmacies());
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
  const { name, address, phone, username, password } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'الاسم واسم المستخدم وكلمة المرور مطلوبة' });
  }
  try {
    if (await db.findPharmacyByUsername(username)) {
      return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const pharmacy = await db.addPharmacy({ name, address, phone, username, passwordHash });
    const { owner_password_hash, ...safePharmacy } = pharmacy;
    res.status(201).json(safePharmacy);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء التسجيل' });
  }
});

// تسجيل دخول الصيدلي
// POST /api/pharmacies/login  { username, password }
router.post('/login', async (req, res) => {
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
