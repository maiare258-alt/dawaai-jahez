const express = require('express');
const router = express.Router();
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');

// ========== مسارات عامة (واجهة المريض) ==========

// قائمة الممرضين مع متوسط تقييمهم
// GET /api/nurses
router.get('/', async (req, res) => {
  try {
    const nurses = await db.getNursesWithRatings();
    res.json(nurses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب قائمة الممرضين' });
  }
});

// التقييمات الموافق عليها بس لممرض معين
// GET /api/nurses/:id/ratings
router.get('/:id/ratings', async (req, res) => {
  try {
    const ratings = await db.getApprovedRatingsForNurse(req.params.id);
    res.json(ratings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب التقييمات' });
  }
});

// إرسال تقييم جديد - بيروح "قيد المراجعة" دايماً، ما بيظهر للعموم إلا بعد موافقة الإدارة
// POST /api/nurses/:id/ratings  { patient_name, patient_phone, stars, comment }
router.post('/:id/ratings', async (req, res) => {
  const { patient_name, patient_phone, stars, comment } = req.body;
  if (!patient_name || !patient_phone) {
    return res.status(400).json({ error: 'الاسم ورقم الهاتف مطلوبان' });
  }
  const starsNum = Number(stars);
  if (!Number.isInteger(starsNum) || starsNum < 1 || starsNum > 5) {
    return res.status(400).json({ error: 'التقييم يجب أن يكون عدد نجوم صحيح من 1 إلى 5' });
  }
  try {
    const rating = await db.addNurseRating({
      nurse_id: req.params.id, patient_name, patient_phone, stars: starsNum, comment
    });
    res.status(201).json({ success: true, rating });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء إرسال التقييم' });
  }
});

// ========== مسارات الإدارة (تتطلب صلاحية) ==========

// إضافة ممرض جديد
// POST /api/nurses  { name, specialty, university, graduation_year, phone }
router.post('/', adminAuth, async (req, res) => {
  const { name, specialty, university, graduation_year, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم الممرض مطلوب' });
  try {
    const nurse = await db.addNurse({ name, specialty, university, graduation_year, phone });
    res.status(201).json(nurse);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء إضافة الممرض' });
  }
});

// قائمة التقييمات قيد المراجعة (لازم يجي قبل حذف الممرض بالترتيب عشان :id ما تلخبط عليه)
// GET /api/nurses/ratings/pending
router.get('/ratings/pending', adminAuth, async (req, res) => {
  try {
    const ratings = await db.getPendingRatings();
    res.json(ratings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب التقييمات قيد المراجعة' });
  }
});

// كل التقييمات المنشورة - لمراجعة الإدارة وحذف أي تعليق مسيء حتى بعد نشره
// GET /api/nurses/ratings/approved
router.get('/ratings/approved', adminAuth, async (req, res) => {
  try {
    const ratings = await db.getApprovedRatings();
    res.json(ratings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب التقييمات المنشورة' });
  }
});

// الموافقة على تقييم (يصير ظاهر للعموم)
// PUT /api/nurses/ratings/:id/approve
router.put('/ratings/:id/approve', adminAuth, async (req, res) => {
  try {
    await db.approveRating(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء الموافقة على التقييم' });
  }
});

// رفض تقييم (حذف نهائي، ما بيظهر لأي أحد)
// DELETE /api/nurses/ratings/:id
router.delete('/ratings/:id', adminAuth, async (req, res) => {
  try {
    await db.rejectRating(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء رفض التقييم' });
  }
});

// تبديل حالة توفر الممرض للعمل
// PUT /api/nurses/:id/availability  { available: true/false }
router.put('/:id/availability', adminAuth, async (req, res) => {
  try {
    const nurse = await db.setNurseAvailability(req.params.id, req.body.available);
    res.json(nurse);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث حالة التوفر' });
  }
});

// حذف ممرض
// DELETE /api/nurses/:id
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    await db.deleteNurse(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء حذف الممرض' });
  }
});

module.exports = router;
