const express = require('express');
const router = express.Router();
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');

// البحث عن دواء وعرض توفره في كل الصيدليات (متاح للجميع - واجهة المريض)
// GET /api/medicines/search?q=بنادول
router.get('/search', (req, res) => {
  const q = req.query.q || '';
  try {
    const medicines = db.searchMedicines(q);
    const results = medicines.map(medicine => ({
      medicine,
      availability: db.getAvailability(medicine.id)
    }));
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء البحث' });
  }
});

// عرض كل الأدوية (للإدارة فقط)
// GET /api/medicines
router.get('/', adminAuth, (req, res) => {
  try {
    res.json(db.getAllMedicines());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب الأدوية' });
  }
});

// إضافة دواء جديد (للإدارة فقط)
// POST /api/medicines  { name, generic_name, alt_names: [] }
router.post('/', adminAuth, (req, res) => {
  const { name, generic_name, alt_names } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم الدواء مطلوب' });
  try {
    const medicine = db.addMedicine({ name, generic_name, alt_names });
    res.status(201).json(medicine);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء إضافة الدواء' });
  }
});

// حذف دواء (للإدارة فقط)
// DELETE /api/medicines/:id
router.delete('/:id', adminAuth, (req, res) => {
  try {
    db.deleteMedicine(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء حذف الدواء' });
  }
});

module.exports = router;
