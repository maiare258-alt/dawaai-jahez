const express = require('express');
const router = express.Router();
const db = require('../db');

// البحث عن دواء وعرض توفره في كل الصيدليات
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

// إضافة دواء جديد لقائمة الأدوية العامة
// POST /api/medicines  { name, generic_name, alt_names: [] }
router.post('/', (req, res) => {
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

// حذف دواء من قائمة الأدوية العامة
// DELETE /api/medicines/:id
router.delete('/:id', (req, res) => {
  try {
    db.deleteMedicine(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء حذف الدواء' });
  }
});

module.exports = router;
