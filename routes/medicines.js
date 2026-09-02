const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');

// التصنيفات المسموحة حصراً عند إنشاء دواء/مستحضر جديد
const ALLOWED_CATEGORIES = ['medicine', 'cosmetic'];

// رسالة موحّدة لحالة "الدواء موجود مسبقاً" — مطابقة تماماً لمفتاح الترجمة بالواجهة
// (BACKEND_ERROR_MAP بملف app.js)، فأي تعديل هون لازم يتزامن معه هناك.
const DUPLICATE_MEDICINE_ERROR = 'هذا الدواء موجود مسبقاً في القائمة العامة';

// تتحقق من صحة category: غير موجودة إطلاقاً → القيمة الافتراضية (توافق مع السلوك القديم)
// موجودة بس غير صحيحة → خطأ صريح، بدون أي تحويل تلقائي
function validateCategory(category) {
  if (category === undefined || category === null || category === '') {
    return { value: 'medicine', error: null };
  }
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return { value: null, error: 'تصنيف غير صالح. القيم المسموحة: دواء أو مستحضر تجميل فقط' };
  }
  return { value: category, error: null };
}

// البحث عن دواء/مستحضر وعرض توفره في كل الصيدليات (متاح للجميع - واجهة المريض)
// GET /api/medicines/search?q=بنادول&category=medicine
router.get('/search', async (req, res) => {
  const q = req.query.q || '';
  const category = req.query.category || 'medicine';
  try {
    const medicines = await db.searchMedicines(q, category);
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

// اقتراح نتائج متشابهة إملائياً (متاح للجميع - واجهة المريض)
// GET /api/medicines/suggest?q=بندول&category=medicine
router.get('/suggest', async (req, res) => {
  const q = req.query.q || '';
  const category = req.query.category || 'medicine';
  try {
    const suggestions = await db.suggestMedicines(q, category);
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

// إضافة دواء أو مستحضر جديد (للإدارة فقط)
// POST /api/medicines  { name, generic_name, alt_names: [], category }
router.post('/', adminAuth, async (req, res) => {
  const { generic_name, alt_names, category } = req.body;
  // تنظيف المسافات الزائدة: بدونه "بنادول " و"بنادول" بيُعتبروا دواءين مختلفين تماماً
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
  const { value: validCategory, error: categoryError } = validateCategory(category);
  if (categoryError) return res.status(400).json({ error: categoryError });
  try {
    // فحص التكرار قبل الإضافة: يعطي رسالة واضحة للإدارة بدل إضافة صامتة أو خطأ سيرفر
    const existing = await db.findMedicineByExactName(name, validCategory);
    if (existing) return res.status(409).json({ error: DUPLICATE_MEDICINE_ERROR });

    const medicine = await db.addMedicine({ name, generic_name, alt_names, category: validCategory });
    res.status(201).json(medicine);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء الإضافة' });
  }
});

// إضافة دواء أو مستحضر جديد من قبل الصيدلي نفسه (يتطلب تأكيد اسم المستخدم وكلمة المرور، بدون كلمة مرور الإدارة)
// POST /api/medicines/self  { username, password, name, generic_name, alt_names, category }
router.post('/self', async (req, res) => {
  const { username, password, generic_name, alt_names, category } = req.body;
  const name = (req.body.name || '').trim();
  if (!username || !password) {
    return res.status(400).json({ error: 'بيانات الدخول مطلوبة' });
  }
  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
  const { value: validCategory, error: categoryError } = validateCategory(category);
  if (categoryError) return res.status(400).json({ error: categoryError });
  try {
    const pharmacy = await db.findPharmacyByUsername(username);
    if (!pharmacy) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    const valid = await bcrypt.compare(password, pharmacy.owner_password_hash);
    if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    // فحص التكرار بعد المصادقة مباشرة: الصيدلي بيشوف رسالة مفهومة ("موجود مسبقاً")
    // بدل ما يضيف نسخة ثانية تلوّث القائمة العامة على كل الصيدليات
    const existing = await db.findMedicineByExactName(name, validCategory);
    if (existing) return res.status(409).json({ error: DUPLICATE_MEDICINE_ERROR });

    const medicine = await db.addMedicine({ name, generic_name, alt_names, category: validCategory });
    res.status(201).json(medicine);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء الإضافة' });
  }
});

// استيراد دفعة أدوية دفعة وحدة من ملف (نفس صلاحية الإضافة الذاتية - اسم مستخدم وكلمة مرور الصيدلية، بدون كلمة مرور الإدارة)
// كل دواء إما موجود أصلاً بالقائمة العامة (بيُربط بمخزون الصيدلية فقط) أو جديد بالكامل (بيُنشأ ثم يُربط)
// POST /api/medicines/bulk-import  { username, password, items: [{name, generic_name, alt_names, category}, ...] }
router.post('/bulk-import', async (req, res) => {
  const { username, password, items } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'بيانات الدخول مطلوبة' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'لا توجد أدوية للاستيراد' });
  }
  if (items.length > 500) {
    return res.status(400).json({ error: 'الحد الأقصى 500 دواء بالمرة الواحدة' });
  }
  try {
    const pharmacy = await db.findPharmacyByUsername(username);
    if (!pharmacy) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    const valid = await bcrypt.compare(password, pharmacy.owner_password_hash);
    if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    let added = 0, linked = 0, skipped = 0;
    const errors = [];
    for (const item of items) {
      const name = (item.name || '').trim();
      if (!name) { skipped++; continue; }
      const { value: validCategory, error: categoryError } = validateCategory(item.category);
      if (categoryError) { skipped++; errors.push(`${name}: ${categoryError}`); continue; }
      try {
        let medicine = await db.findMedicineByExactName(name, validCategory);
        if (!medicine) {
          // addMedicine صارت محمية بذاتها: لو انضاف نفس الدواء بنفس اللحظة من طلب آخر
          // (رفع مزدوج مثلاً)، بترجع الموجود بدل ما تنشئ نسخة ثانية
          medicine = await db.addMedicine({ name, generic_name: item.generic_name, alt_names: item.alt_names, category: validCategory });
          if (!medicine) { skipped++; errors.push(`${name}: تعذّرت الإضافة`); continue; }
          added++;
        } else {
          linked++;
        }
        await db.setStock(pharmacy.id, medicine.id, true);
      } catch (err) {
        console.error(err);
        skipped++;
        errors.push(`${name}: حدث خطأ أثناء الإضافة`);
      }
    }
    res.status(201).json({ success: true, added, linked, skipped, errors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء الاستيراد' });
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
