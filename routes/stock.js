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
const db = require('../db');

// عرض كل الأدوية مع حالة توفرها لصيدلية معينة
// GET /api/stock/:pharmacyId
router.get('/:pharmacyId', async (req, res) => {
  try {
    res.json(await db.getStockForPharmacy(req.params.pharmacyId));
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
  // تحقق من منطقية التاريخين معاً — فقط لو الاثنين مُرسَلين فعلياً بقيمة حقيقية (مش تفريغ أو عدم إرسال)
  if (manufactureDate && expiryDate) {
    const mfg = new Date(manufactureDate);
    const exp = new Date(expiryDate);
    if (isNaN(mfg.getTime()) || isNaN(exp.getTime())) {
      return res.status(400).json({ error: 'صيغة التاريخ غير صالحة' });
    }
    if (exp < mfg) {
      return res.status(400).json({ error: 'تاريخ الانتهاء لا يمكن أن يكون قبل تاريخ الصنع' });
    }
  }
  try {
    const pharmacy = await db.findPharmacyByUsername(username);
    if (!pharmacy) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

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
