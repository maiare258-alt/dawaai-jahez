const express = require('express');
const router = express.Router();
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');

// البحث عن دواء وعرض توفره في كل الصيدليات (متاح للجميع - واجهة المريض)
// GET /api/medicines/search?q=بنادول
router.get('/search', async (req, res) => {
  const q = req.query.q || '';
  try {
    const medicines = await db.searchMedicines(q);
    const results = await Promise.all(medicines.map(async medicine => ({
      medicine,
      availability: await db.getAvailability(medicine.id)
    })));
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء البحث' });
  }
});

// اقتراح أدوية متشابهة إملائياً (متاح للجميع - واجهة المريض)
// GET /api/medicines/suggest?q=بندول
router.get('/suggest', async (req, res) => {
  const q = req.query.q || '';
  try {
    const suggestions = await db.suggestMedicines(q);
    res.json(suggestions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب الاقتراحات' });
  }
});

// عرض كل الأدوية (للإدارة فقط)
// GET /api/medicines
router.get('/', adminAuth, async (req, res) => {
  try {
    res.json(await db.getAllMedicines());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب الأدوية' });
  }
});

// إضافة دواء جديد (للإدارة فقط)
// POST /api/medicines  { name, generic_name, alt_names: [] }
router.post('/', adminAuth, async (req, res) => {
  const { name, generic_name, alt_names } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم الدواء مطلوب' });
  try {
    const medicine = await db.addMedicine({ name, generic_name, alt_names });
    res.status(201).json(medicine);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء إضافة الدواء' });
  }
});

// حذف دواء (للإدارة فقط)
// DELETE /api/medicines/:id
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    await db.deleteMedicine(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء حذف الدواء' });
  }
});

module.exports = router;
