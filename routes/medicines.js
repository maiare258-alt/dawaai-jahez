const express = require('express');
const router = express.Router();

// المعرّفات في الرابط أرقام صحيحة موجبة ضمن نطاق PostgreSQL. أي قيمة أخرى ("abc"،
// "1.5"، رقم من عشرين خانة) كانت تصل إلى القاعدة فترمي خطأً يعود 500 بدل رفض واضح.
function validIdParam(req, res, next, value) {
  if (/^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647) return next();
  return res.status(400).json({ error: 'معرّف غير صالح' });
}
router.param('id', validIdParam);

const bcrypt = require('bcryptjs');

// ن8: حين لا يوجد اسم المستخدم نقارن كلمة المرور بتجزئة وهمية بالكلفة نفسها (10) بدل الرد
// فوراً. كان الرد السريع (3 ملّي ثانية مقابل 70) يكشف أي أسماء المستخدمين موجودة.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dawaai-jahez-no-such-user', 10);
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');
const rateLimit = require('../middleware/rateLimit');

// التصنيفات المسموحة حصراً عند إنشاء دواء/مستحضر جديد
const ALLOWED_CATEGORIES = ['medicine', 'cosmetic'];

// رسالة موحّدة لحالة "الدواء موجود مسبقاً" — مطابقة تماماً لمفتاح الترجمة بالواجهة
// (BACKEND_ERROR_MAP بملف app.js)، فأي تعديل هون لازم يتزامن معه هناك.
const DUPLICATE_MEDICINE_ERROR = 'هذا الدواء موجود مسبقاً في القائمة العامة';

// ن7: الحد نفسه الذي يقبله مسار الطلبات لاسم الدواء. كان يُقبل اسم أطول عند الإضافة، ثم
// يُرفض كل طلب يحويه، فيبقى الدواء ظاهراً في البحث ولا يمكن طلبه أبداً.
const MAX_MEDICINE_NAME = 120;
const NAME_TOO_LONG_ERROR = 'اسم الدواء طويل جداً (الحد 120 حرفاً)';

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
// تسجيل بحث مجهَّل — POST /api/medicines/search-log  { q, category, city }
//
// منفصل عن مسار البحث عمداً: البحث حي أثناء الكتابة، فلو سجّل كل طلب لامتلأت بيانات
// الطلب بأجزاء كلمات ("بن"، "بناد"). الواجهة تستدعي هذا المسار فقط حين يبقى البحث على
// الشاشة ثانيتين ونصفاً، أي حين يكون بحثاً مقصوداً. ومسار البحث يبقى قراءة بلا أثر جانبي.
//
// الرد دائماً 204 بلا تفاصيل، حتى عند الرفض لأسباب الخصوصية: لا نكشف ما سُجِّل وما لم يُسجَّل،
// وفشل التسجيل يجب ألا يظهر للمريض أبداً.
// 30 تسجيلاً كل 15 دقيقة لكل عنوان: يكفي أي مستخدم حقيقي، ويحدّ من إغراق البيانات بطلب وهمي.
router.post('/search-log', rateLimit(30, 15 * 60 * 1000), async (req, res) => {
  const { q, category, city } = req.body || {};
  if (typeof q !== 'string' || q.trim().length < 2 || q.length > 200) return res.status(204).end();
  const cat = category === 'cosmetic' ? 'cosmetic' : 'medicine';
  const safeCity = typeof city === 'string' && /^[a-z_]{2,30}$/.test(city) ? city : null;
  try {
    await db.logSearch({ query: q, category: cat, city: safeCity });
  } catch (err) {
    console.error('تعذّر تسجيل البحث (لا يؤثر على المستخدم):', err.message);
  }
  res.status(204).end();
});

// م12: البحث عام ومفتوح، فله حدود تحمي الخادم المجاني دون أن تمس المريض:
//  - حرفان على الأقل (الواجهة لا تبحث حياً بأقل من ذلك أصلاً)، و100 حرف على الأكثر.
//  - 600 بحث كل 15 دقيقة لكل عنوان: سخي عمداً، لأن مشتركي شبكة الهاتف قد يتشاركون عنواناً واحداً،
//    ويكفي لإيقاف إغراق آلي.
//  - التوفر لكل الأدوية المطابقة يُجلب باستعلام واحد بدل استعلام لكل دواء.
const SEARCH_RATE = rateLimit(600, 15 * 60 * 1000);

router.get('/search', SEARCH_RATE, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const category = req.query.category || 'medicine';
  // فلتر مدينة اختياري. أي قيمة غير معروفة تُعامل كـ"كل المدن" بدل رمي خطأ —
  // البحث واجهة مريض عامة، وتعطيلها بسبب معامل تالف سلوك سيئ.
  const city = typeof req.query.city === 'string' && /^[a-z_]{2,30}$/.test(req.query.city) ? req.query.city : null;
  if (q.length < 2 || q.length > 100) return res.json([]);
  try {
    const medicines = await db.searchMedicines(q, category);
    const byMedicine = await db.getAvailabilityForMedicines(medicines.map(m => m.id), city);
    let results = medicines.map(medicine => ({ medicine, availability: byMedicine.get(medicine.id) || [] }));
    // عند الفلترة بمدينة، نستبعد الأدوية التي لا توجد لها أي صيدلية بتلك المدينة،
    // وإلا ظهرت بطاقة دواء فارغة بلا أي صيدلية تحتها.
    if (city) results = results.filter(r => r.availability.length > 0);
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء البحث' });
  }
});

// اقتراح نتائج متشابهة إملائياً (متاح للجميع - واجهة المريض)
// GET /api/medicines/suggest?q=بندول&category=medicine
router.get('/suggest', SEARCH_RATE, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
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
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
  if (name.length > MAX_MEDICINE_NAME) return res.status(400).json({ error: NAME_TOO_LONG_ERROR });
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
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!username || !password) {
    return res.status(400).json({ error: 'بيانات الدخول مطلوبة' });
  }
  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
  if (name.length > MAX_MEDICINE_NAME) return res.status(400).json({ error: NAME_TOO_LONG_ERROR });
  const { value: validCategory, error: categoryError } = validateCategory(category);
  if (categoryError) return res.status(400).json({ error: categoryError });
  try {
    const pharmacy = await db.findPharmacyByUsername(username);
    if (!pharmacy) { await bcrypt.compare(String(password || ''), DUMMY_PASSWORD_HASH); return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' }); }

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
    if (!pharmacy) { await bcrypt.compare(String(password || ''), DUMMY_PASSWORD_HASH); return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' }); }
    const valid = await bcrypt.compare(password, pharmacy.owner_password_hash);
    if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    let added = 0, linked = 0, skipped = 0;
    const errors = [];
    for (const item of items) {
      const name = typeof (item && item.name) === 'string' ? item.name.trim() : '';
      if (!name) { skipped++; continue; }
      if (name.length > MAX_MEDICINE_NAME) { skipped++; errors.push(`${name.slice(0, 40)}…: ${NAME_TOO_LONG_ERROR}`); continue; }
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
