const express = require('express');
const router = express.Router();

// المعرّفات في الرابط أرقام صحيحة موجبة ضمن نطاق PostgreSQL. أي قيمة أخرى ("abc"،
// "1.5"، رقم من عشرين خانة) كانت تصل إلى القاعدة فترمي خطأً يعود 500 بدل رفض واضح.
function validIdParam(req, res, next, value) {
  if (/^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647) return next();
  return res.status(400).json({ error: 'معرّف غير صالح' });
}
router.param('pharmacyId', validIdParam);
router.param('medicineId', validIdParam);

const bcrypt = require('bcryptjs');

// ن8: حين لا يوجد اسم المستخدم نقارن كلمة المرور بتجزئة وهمية بالكلفة نفسها (10) بدل الرد
// فوراً. كان الرد السريع (3 ملّي ثانية مقابل 70) يكشف أي أسماء المستخدمين موجودة.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dawaai-jahez-no-such-user', 10);
const db = require('../db');

// تاريخ حقيقي بصيغة YYYY-MM-DD (لا 2027-02-31 ولا 2027-13-01 ولا نص عشوائي)
function isRealDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// عرض كل الأدوية مع حالة توفرها لصيدلية معينة — للصيدلي صاحب المخزون فقط
// GET /api/stock/:pharmacyId  Headers: { x-pharmacy-username, x-pharmacy-password } (مشفّرة بـ encodeURIComponent)
// م4: كان المسار مفتوحاً لأي أحد، فيكشف تواريخ الصنع والانتهاء لكل صيدلية، وهي أداة داخلية للصيدلي.
// المريض لا يحتاجه: توفر الأدوية يصله من مسار البحث، وهو لا يتضمن هذه التواريخ.
router.get('/:pharmacyId', async (req, res) => {
  const rawUsername = req.headers['x-pharmacy-username'];
  const rawPassword = req.headers['x-pharmacy-password'];
  if (!rawUsername || !rawPassword) return res.status(401).json({ error: 'بيانات الدخول مطلوبة' });
  let username, password;
  try {
    username = decodeURIComponent(rawUsername);
    password = decodeURIComponent(rawPassword);
  } catch (err) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }
  try {
    const pharmacy = await db.findPharmacyByUsername(username);
    if (!pharmacy) { await bcrypt.compare(String(password || ''), DUMMY_PASSWORD_HASH); return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' }); }
    const valid = await bcrypt.compare(password, pharmacy.owner_password_hash);
    if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    if (Number(req.params.pharmacyId) !== pharmacy.id) {
      return res.status(403).json({ error: 'غير مصرح بالوصول لهذه البيانات' });
    }
    res.json(await db.getStockForPharmacy(pharmacy.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب المخزون' });
  }
});

// تحديث حالة توفر دواء معين في صيدلية معينة، وتاريخي الصنع/الانتهاء اختيارياً (أداة داخلية للصيدلي، ما بتظهر للمريض)
// يتطلب تأكيد اسم المستخدم وكلمة مرور الصيدلية صاحبة المخزون
// pharmacyId بالرابط غير موثوق إطلاقاً — الصيدلية الحقيقية تُستخرج حصراً من بيانات الدخول، بنفس نمط bulk-import
// PUT /api/stock/:pharmacyId/:medicineId  { available: true|false, username, password, manufactureDate?, expiryDate? }
router.put('/:pharmacyId/:medicineId', async (req, res) => {
  const { medicineId } = req.params;
  const { available, username, password, manufactureDate, expiryDate } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'بيانات الدخول مطلوبة' });
  }
  // ن6: كل تاريخ مُرسل بقيمة يجب أن يكون يوماً حقيقياً بصيغة YYYY-MM-DD. كان تاريخ مثل
  // 2027-02-31 يصل إلى القاعدة فيرمي خطأً يعود 500 بدل رسالة واضحة.
  for (const d of [manufactureDate, expiryDate]) {
    if (d === undefined || d === null || d === '') continue;
    if (!isRealDate(d)) return res.status(400).json({ error: 'صيغة التاريخ غير صالحة' });
  }
  // تحقق من منطقية التاريخين معاً — فقط لو الاثنين مُرسَلين فعلياً بقيمة حقيقية (مش تفريغ أو عدم إرسال)
  if (manufactureDate && expiryDate) {
    const mfg = new Date(manufactureDate);
    const exp = new Date(expiryDate);
    if (exp < mfg) {
      return res.status(400).json({ error: 'تاريخ الانتهاء لا يمكن أن يكون قبل تاريخ الصنع' });
    }
  }
  try {
    const pharmacy = await db.findPharmacyByUsername(username);
    if (!pharmacy) { await bcrypt.compare(String(password || ''), DUMMY_PASSWORD_HASH); return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' }); }

    const valid = await bcrypt.compare(password, pharmacy.owner_password_hash);
    if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    await db.setStock(pharmacy.id, medicineId, available, manufactureDate, expiryDate);
    res.json({ success: true });
  } catch (err) {
    // مفتاح أجنبي لعنصر غير موجود (23503): رفض واضح بدل خطأ خادم
    if (err && err.code === '23503') return res.status(404).json({ error: 'الدواء أو الصيدلية غير موجودة' });
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث المخزون' });
  }
});

module.exports = router;
