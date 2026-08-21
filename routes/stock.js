const express = require('express');
const router = express.Router();
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
  try {
    const pharmacy = await db.findPharmacyByUsername(username);
    if (!pharmacy) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    const valid = await bcrypt.compare(password, pharmacy.owner_password_hash);
    if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    await db.setStock(pharmacy.id, medicineId, available, manufactureDate, expiryDate);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث المخزون' });
  }
});

module.exports = router;
