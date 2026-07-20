const express = require('express');
const router = express.Router();
const db = require('../db');

// عرض كل الأدوية مع حالة توفرها لصيدلية معينة
// GET /api/stock/:pharmacyId
router.get('/:pharmacyId', (req, res) => {
  try {
    res.json(db.getStockForPharmacy(req.params.pharmacyId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب المخزون' });
  }
});

// تحديث حالة توفر دواء معين في صيدلية معينة
// PUT /api/stock/:pharmacyId/:medicineId  { available: true|false }
router.put('/:pharmacyId/:medicineId', (req, res) => {
  const { pharmacyId, medicineId } = req.params;
  const { available } = req.body;
  try {
    db.setStock(pharmacyId, medicineId, available);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث المخزون' });
  }
});

module.exports = router;
