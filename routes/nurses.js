const express = require('express');
const router = express.Router();

const { validIdParam, ALLOWED_CITIES } = require('../middleware/shared');
router.param('id', validIdParam);

// ===================== شهادات الممرضين (Supabase Storage) =====================
// الشهادة وثيقة شخصية (اسم ورقم نقابي وأحياناً رقم وطني)، فتُحفظ في مجلد خاص لا يصل
// إليه إلا الخادم بالمفتاح السري، ويراها المدير برابط مؤقت ينتهي خلال دقائق. والمرضى
// لا يرون الملف أبداً، بل بطاقة خبرة وشارة "شهادة موثّقة" بعد أن يراجعها المدير.
// خادم Render المجاني يمسح أي ملف محلي مع كل إعادة تشغيل، ولهذا التخزين خارجي.
const CERT_BUCKET = 'nurse-certificates';
const CERT_MAX_BYTES = 3 * 1024 * 1024;
const CERT_EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function storageConfig() {
  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_SECRET_KEY || '').trim();
  return url && key ? { url, key } : null;
}

// نوع الملف من أول بايتاته، لا مما يعلنه المتصفح: ملف خبيث بامتداد .pdf لا يمر.
function sniffCertType(buf) {
  if (!Buffer.isBuffer(buf)) return null;
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

function storageError(code) { const e = new Error(code); e.storageCode = code; return e; }

// طلب إلى Supabase Storage.
// نوعا المفاتيح يُرسلان بطريقتين: الجديد (sb_secret_) في ترويسة apikey وحدها، والقديم
// (JWT يبدأ بـ eyJ) في apikey وAuthorization معاً. لا نعرف مسبقاً أي نوع وُضع في Render،
// فنبدأ بالطريقة المناسبة لشكله، ونعيد المحاولة مرة واحدة بالأخرى إن رُفض الطلب.
async function storageRequest(path, { method = 'GET', headers = {}, body } = {}) {
  const cfg = storageConfig();
  if (!cfg) throw storageError('NOCFG');
  if (typeof fetch !== 'function') throw storageError('NOFETCH');
  const url = `${cfg.url}/storage/v1${path}`;
  const isJwt = cfg.key.startsWith('eyJ');
  const attempt = async (withAuth) => {
    const h = { apikey: cfg.key, ...headers };
    if (withAuth) h.Authorization = `Bearer ${cfg.key}`;
    const opts = { method, headers: h, body };
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opts.signal = AbortSignal.timeout(20000);
    return fetch(url, opts);
  };
  let res = await attempt(isJwt);
  if ([400, 401, 403].includes(res.status)) {
    const alt = await attempt(!isJwt);
    if (alt.ok || ![400, 401, 403].includes(alt.status)) res = alt;
  }
  return res;
}

const objectPath = p => `/object/${CERT_BUCKET}/${String(p).split('/').map(encodeURIComponent).join('/')}`;

async function deleteCertObject(path) {
  if (!path) return;
  try { await storageRequest(objectPath(path), { method: 'DELETE' }); }
  catch (e) { console.error('تعذّر حذف ملف شهادة قديم (لا يؤثر على الطلب):', e.message); }
}

// ما يراه المريض فقط. تحديد صريح للحقول: الاستعلام يجلب كل الأعمدة (n.*)، فلولا هذا
// لوصل مسار الشهادة الخاصة إلى كل زائر.
// رقم الممرض والشارع لا يُرسلان أبداً (أكتوبر 2026): المريض يطلب الزيارة عبر مدير التمريض،
// والشارع قد يكون عنوان بيت الممرض أو الممرضة. يرى المريض المدينة والحي فقط.
const PUBLIC_NURSE_FIELDS = ['id', 'name', 'specialty', 'university', 'graduation_year',
  'available', 'avg_rating', 'rating_count', 'experience_years', 'services', 'city', 'area'];
function publicNurse(n) {
  const o = {};
  for (const k of PUBLIC_NURSE_FIELDS) o[k] = n[k];
  o.cert_verified = Boolean(n.cert_path && n.cert_verified);
  return o;
}
function adminNurse(n) {
  const o = publicNurse(n);
  o.phone = n.phone || null;
  o.street = n.street || null;
  o.has_certificate = Boolean(n.cert_path);
  o.cert_mime = n.cert_mime || null;
  o.cert_size = n.cert_size || null;
  o.cert_uploaded_at = n.cert_uploaded_at || null;
  o.cert_verified = Boolean(n.cert_verified);
  return o;
}

// مكان عمل الممرض: المدينة من القائمة المعروفة، والحي والشارع نص قصير. الحقل الغائب
// عن الطلب يبقى undefined (لا تغيير)، والفارغ يُمسح.
const MAX_AREA = 80;
const MAX_STREET = 120;
function parseLocation(body) {
  const out = {};
  if (body.city !== undefined) {
    if (body.city === null || body.city === '') out.city = null;
    else if (typeof body.city !== 'string' || !ALLOWED_CITIES.includes(body.city)) return { error: 'مدينة غير صالحة' };
    else out.city = body.city;
  }
  for (const [key, max, msg] of [['area', MAX_AREA, 'اسم الحي طويل جداً'], ['street', MAX_STREET, 'الشارع أو العلامة طويلة جداً']]) {
    if (body[key] === undefined) continue;
    if (body[key] === null) { out[key] = null; continue; }
    if (typeof body[key] !== 'string') return { error: 'قيمة غير صالحة' };
    if (body[key].trim().length > max) return { error: msg };
    out[key] = body[key];
  }
  return { value: out };
}

// true/false فقط: كانت القيمة النصية "false" تُفهم «نعم» فيصير الممرض متاحاً بالخطأ
function parseStrictBool(v) {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return null;
}

function parseExperience(v) {
  if (v === undefined || v === null || v === '') return { value: null };
  const n = Number(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (!Number.isInteger(n) || n < 0 || n > 60) return { error: 'سنوات الخبرة يجب أن تكون رقماً بين 0 و60' };
  return { value: n };
}
function parseServices(v) {
  if (v === undefined || v === null) return { value: null };
  if (typeof v !== 'string') return { error: 'الخدمات غير صالحة' };
  if (v.trim().length > 200) return { error: 'نص الخدمات طويل جداً' };
  return { value: v };
}

const db = require('../db');
const adminAuth = require('../middleware/adminAuth');
const nursingAuth = require('../middleware/nursingAuth');
const bcrypt = require('bcryptjs');
const rateLimit = require('../middleware/rateLimit');

// ========== مسارات عامة (واجهة المريض) ==========

// قائمة الممرضين مع متوسط تقييمهم
// GET /api/nurses
router.get('/', async (req, res) => {
  try {
    const nurses = await db.getNursesWithRatings();
    res.json(nurses.map(publicNurse));
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
// مسار عام بالضرورة (المريض ليس له حساب)، فهو معرّض للإساءة.
// 5 تقييمات كل 15 دقيقة لكل عنوان: يكفي لمن يقيّم أكثر من ممرض في جلسة،
// ويقطع السبام الآلي الذي قد يغرق قائمة المراجعة لدى الإدارة.
const MAX_RATING_NAME = 80;
const MAX_COMMENT = 500;

router.post('/:id/ratings', rateLimit(5, 15 * 60 * 1000), async (req, res) => {
  const { patient_name, patient_phone, stars, comment } = req.body;
  if (!patient_name || !patient_phone) {
    return res.status(400).json({ error: 'الاسم ورقم الهاتف مطلوبان' });
  }
  if (typeof patient_name !== 'string' || patient_name.trim().length > MAX_RATING_NAME) {
    return res.status(400).json({ error: 'الاسم طويل جداً' });
  }
  if (!/^[0-9]{7,15}$/.test(patient_phone)) {
    return res.status(400).json({ error: 'رقم الهاتف يجب أن يتكون من أرقام فقط' });
  }
  if (comment !== undefined && comment !== null && (typeof comment !== 'string' || comment.length > MAX_COMMENT)) {
    return res.status(400).json({ error: 'التعليق طويل جداً' });
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
    // مفتاح أجنبي لعنصر غير موجود (23503): رفض واضح بدل خطأ خادم
    if (err && err.code === '23503') return res.status(404).json({ error: 'الممرض غير موجود' });
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء إرسال التقييم' });
  }
});

// ========== مسارات الإدارة (تتطلب صلاحية) ==========

// إضافة ممرض جديد
// POST /api/nurses  { name, specialty, university, graduation_year, phone }
// يضيفه المدير أو مدير التمريض
router.post('/', nursingAuth, async (req, res) => {
  const { name, specialty, university, graduation_year, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم الممرض مطلوب' });
  const exp = parseExperience(req.body.experience_years);
  if (exp.error) return res.status(400).json({ error: exp.error });
  const svc = parseServices(req.body.services);
  if (svc.error) return res.status(400).json({ error: svc.error });
  const loc = parseLocation(req.body);
  if (loc.error) return res.status(400).json({ error: loc.error });
  try {
    const nurse = await db.addNurse({ name, specialty, university, graduation_year, phone,
      experience_years: exp.value, services: svc.value, ...loc.value });
    res.status(201).json(nurse);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء إضافة الممرض' });
  }
});

// قائمة التقييمات قيد المراجعة (لازم يجي قبل حذف الممرض بالترتيب عشان :id ما تلخبط عليه)
// GET /api/nurses/ratings/pending
router.get('/ratings/pending', nursingAuth, async (req, res) => {
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
router.get('/ratings/approved', nursingAuth, async (req, res) => {
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
router.put('/ratings/:id/approve', nursingAuth, async (req, res) => {
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
router.delete('/ratings/:id', nursingAuth, async (req, res) => {
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
// مدير التمريض «يخفي» الممرض بجعله غير متاح؛ الحذف النهائي للإدارة وحدها (أدناه)
router.put('/:id/availability', nursingAuth, async (req, res) => {
  const available = parseStrictBool(req.body.available);
  if (available === null) return res.status(400).json({ error: 'قيمة غير صالحة' });
  try {
    const nurse = await db.setNurseAvailability(req.params.id, available);
    if (!nurse) return res.status(404).json({ error: 'الممرض غير موجود' });
    res.json(adminNurse(nurse));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث حالة التوفر' });
  }
});

// حذف ممرض
// DELETE /api/nurses/:id
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    // نقرأ مسار الشهادة، نحذف الممرض، ثم ملفه: الترتيب نفسه (السجل قبل الملف)
    const existing = await db.getNurseById(req.params.id);
    await db.deleteNurse(req.params.id);
    if (existing && existing.cert_path) await deleteCertObject(existing.cert_path);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء حذف الممرض' });
  }
});


// ---------- مسارات الإدارة: الخبرة والشهادات ----------

// قائمة الممرضين كاملة للإدارة (مع حالة الشهادة، دون مسارها)
router.get('/admin/all', nursingAuth, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json((await db.getNursesWithRatings()).map(adminNurse));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب الممرضين' });
  }
});

// فحص التخزين: هل الإعداد في Render صحيح، والمجلد موجود وخاص؟ ومقدار المستخدم
router.get('/storage/check', adminAuth, async (req, res) => {
  let usage = { bytes: 0, count: 0 };
  try { usage = await db.getCertStorageUsage(); } catch (e) { /* القاعدة تُفحص في /health */ }
  const base = { usedBytes: usage.bytes, count: usage.count, limitBytes: 1024 * 1024 * 1024 };
  try {
    const r = await storageRequest(`/bucket/${CERT_BUCKET}`);
    if (r.status === 404 || r.status === 400) {
      const txt = await r.text().catch(() => '');
      if (/not.?found/i.test(txt) || r.status === 404) return res.json({ ...base, ok: false, code: 'NOBUCKET' });
      return res.json({ ...base, ok: false, code: 'AUTH' });
    }
    if (r.status === 401 || r.status === 403) return res.json({ ...base, ok: false, code: 'AUTH' });
    if (!r.ok) return res.json({ ...base, ok: false, code: 'UNAVAILABLE' });
    const bucket = await r.json().catch(() => ({}));
    if (bucket.public) return res.json({ ...base, ok: false, code: 'PUBLIC' });
    res.json({ ...base, ok: true });
  } catch (err) {
    res.json({ ...base, ok: false, code: err.storageCode || 'UNAVAILABLE' });
  }
});

// تعديل بطاقة الخبرة، ومعها مكان العمل إن أُرسل (المدينة والحي والشارع)
router.put('/:id/profile', nursingAuth, async (req, res) => {
  const exp = parseExperience(req.body.experience_years);
  if (exp.error) return res.status(400).json({ error: exp.error });
  const svc = parseServices(req.body.services);
  if (svc.error) return res.status(400).json({ error: svc.error });
  const loc = parseLocation(req.body);
  if (loc.error) return res.status(400).json({ error: loc.error });
  try {
    // تعديل المكان وحده لا يمسح الخبرة والخدمات: لا تُلمسان إلا إن أُرسلتا
    const body = req.body || {};
    const touchesProfile = 'experience_years' in body || 'services' in body;
    const updated = touchesProfile
      ? await db.setNurseProfile(req.params.id, exp.value, svc.value)
      : await db.getNurseById(req.params.id);
    if (!updated) return res.status(404).json({ error: 'الممرض غير موجود' });
    const out = { id: updated.id, experience_years: updated.experience_years, services: updated.services };
    if (Object.keys(loc.value).length) Object.assign(out, await db.setNurseLocation(req.params.id, loc.value));
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء حفظ بيانات الخبرة' });
  }
});

// رفع شهادة: الملف نفسه في جسم الطلب (لا JSON)، بحد 3 ميغابايت.
// نقرأ الجسم هنا لا في الخادم العام، ونرد على تجاوز الحجم برسالة واضحة: خطأ القراءة
// لو تُرك يصل إلى المعالج العام لعاد "خطأ في الخادم" لا يفهمه المدير.
const readCertBody = express.raw({ type: () => true, limit: CERT_MAX_BYTES });
router.post('/:id/certificate', adminAuth, (req, res, next) => {
  readCertBody(req, res, (err) => {
    if (!err) return next();
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'حجم الملف أكبر من 3 ميغابايت', code: 'TOOBIG' });
    return res.status(400).json({ error: 'تعذّرت قراءة الملف', code: 'BADFILE' });
  });
}, async (req, res) => {
  const mime = sniffCertType(req.body);
  if (!mime) return res.status(415).json({ error: 'نوع الملف غير مقبول', code: 'BADTYPE' });
  try {
    const nurse = await db.getNurseById(req.params.id);
    if (!nurse) return res.status(404).json({ error: 'الممرض غير موجود' });
    // اسم جديد لكل رفع، فلا يكتب فوق ملف قديم قبل التأكد من نجاح الجديد
    const path = `nurse-${nurse.id}/${Date.now()}.${CERT_EXT[mime]}`;
    const up = await storageRequest(objectPath(path), {
      method: 'POST', headers: { 'Content-Type': mime, 'x-upsert': 'false' }, body: req.body
    });
    if (!up.ok) {
      const code = up.status === 401 || up.status === 403 ? 'AUTH' : (up.status === 404 ? 'NOBUCKET' : 'UNAVAILABLE');
      console.error('فشل رفع الشهادة إلى التخزين:', up.status, await up.text().catch(() => ''));
      return res.status(502).json({ error: 'تعذّر رفع الشهادة إلى التخزين', code });
    }
    let saved;
    try {
      saved = await db.setNurseCertificate(nurse.id, { path, mime, size: req.body.length });
    } catch (dbErr) {
      // الملف رُفع لكن حفظه في القاعدة فشل: نحذفه كي لا يبقى يتيماً يستهلك المساحة
      await deleteCertObject(path);
      throw dbErr;
    }
    if (!saved) { await deleteCertObject(path); return res.status(404).json({ error: 'الممرض غير موجود' }); }
    // شهادة واحدة فعّالة لكل ممرض: القديمة تُحذف بعد نجاح الجديدة، فلا تتراكم ملفات منسية
    if (saved.old_path && saved.old_path !== path) await deleteCertObject(saved.old_path);
    res.status(201).json({ has_certificate: true, cert_mime: saved.cert_mime, cert_size: saved.cert_size,
      cert_uploaded_at: saved.cert_uploaded_at, cert_verified: saved.cert_verified });
  } catch (err) {
    if (err.storageCode) return res.status(502).json({ error: 'التخزين غير متاح', code: err.storageCode });
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء رفع الشهادة' });
  }
});

// عرض الشهادة: رابط مؤقت لخمس دقائق. لو تسرّب الرابط لا يبقى صالحاً.
router.get('/:id/certificate/link', adminAuth, async (req, res) => {
  try {
    const nurse = await db.getNurseById(req.params.id);
    if (!nurse || !nurse.cert_path) return res.status(404).json({ error: 'لا توجد شهادة لهذا الممرض' });
    const r = await storageRequest(`/object/sign/${CERT_BUCKET}/${nurse.cert_path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 300 })
    });
    const data = await r.json().catch(() => ({}));
    const signed = data.signedURL || data.signedUrl;
    if (!r.ok || !signed) return res.status(502).json({ error: 'تعذّر إنشاء رابط العرض', code: 'UNAVAILABLE' });
    const cfg = storageConfig();
    res.set('Cache-Control', 'no-store');
    res.json({ url: /^https?:/.test(signed) ? signed : `${cfg.url}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}` });
  } catch (err) {
    if (err.storageCode) return res.status(502).json({ error: 'التخزين غير متاح', code: err.storageCode });
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء إنشاء رابط العرض' });
  }
});

router.delete('/:id/certificate', adminAuth, async (req, res) => {
  try {
    // السجل أولاً ثم الملف: لو فشل حذف الملف يبقى يتيماً (أهون)، لا سجلاً يشير إلى لا شيء
    const cleared = await db.clearNurseCertificate(req.params.id);
    if (!cleared.found) return res.status(404).json({ error: 'الممرض غير موجود' });
    if (cleared.oldPath) await deleteCertObject(cleared.oldPath);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء حذف الشهادة' });
  }
});

// توثيق الشهادة بعد مراجعتها (أو إلغاؤه)
router.put('/:id/certificate/verified', adminAuth, async (req, res) => {
  if (typeof req.body.verified !== 'boolean') return res.status(400).json({ error: 'قيمة غير صالحة' });
  try {
    const updated = await db.setNurseCertVerified(req.params.id, req.body.verified);
    if (!updated) return res.status(404).json({ error: 'لا توجد شهادة لهذا الممرض' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث التوثيق' });
  }
});

// ===================== طلبات الزيارات التمريضية =====================
// المريض يطلب زيارة من ممرض بعينه، فيصل الطلب إلى مدير التمريض فيتصل بالمريض والممرض.
// رقم الممرض لا يُنشر، فهذا هو الطريق الوحيد إليه. مسار عام (المريض بلا حساب)، فهو
// محدود بخمسة طلبات كل 15 دقيقة لكل عنوان كي لا تُغرق اللوحة بطلبات وهمية.

const MAX_REQ_NAME = 60;
const MAX_REQ_AREA = 120;
const MAX_REQ_NOTES = 300;

// الأرقام العربية تُحوَّل، والمسافات والشرطات تُزال، ثم أرقام فقط بين 7 و15 خانة
function normalizePatientPhone(raw) {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[\s\-()]/g, '');
  return /^[0-9]{7,15}$/.test(digits) ? digits : null;
}

// POST /api/nurses/:id/requests  { patient_name, patient_phone, patient_area, notes }
router.post('/:id/requests', rateLimit(5, 15 * 60 * 1000), async (req, res) => {
  const { patient_name, patient_area, notes } = req.body || {};
  if (typeof patient_name !== 'string' || !patient_name.trim()) return res.status(400).json({ error: 'الاسم مطلوب' });
  if (patient_name.trim().length > MAX_REQ_NAME) return res.status(400).json({ error: 'الاسم طويل جداً' });
  const phone = normalizePatientPhone(req.body && req.body.patient_phone);
  if (!phone) return res.status(400).json({ error: 'رقم الهاتف يجب أن يتكون من أرقام فقط' });
  if (typeof patient_area !== 'string' || !patient_area.trim()) return res.status(400).json({ error: 'المنطقة أو الحي مطلوب' });
  if (patient_area.trim().length > MAX_REQ_AREA) return res.status(400).json({ error: 'اسم المنطقة طويل جداً' });
  if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > MAX_REQ_NOTES)) {
    return res.status(400).json({ error: 'الملاحظة طويلة جداً' });
  }
  try {
    const nurse = await db.getNurseById(req.params.id);
    if (!nurse) return res.status(404).json({ error: 'الممرض غير موجود' });
    if (!nurse.available) return res.status(409).json({ error: 'الممرض غير متاح حالياً' });
    const created = await db.createNurseRequest({
      nurse_id: nurse.id, nurse_name: nurse.name, patient_name, patient_phone: phone, patient_area, notes: notes || null
    });
    res.status(201).json({ success: true, id: created.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء إرسال الطلب' });
  }
});

// قائمة الطلبات لمدير التمريض والإدارة، الأحدث أولاً (والأقدم من 30 يوماً يُحذف قبلها)
router.get('/requests', nursingAuth, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await db.getNurseRequests());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب الطلبات' });
  }
});

router.put('/requests/:id/contacted', nursingAuth, async (req, res) => {
  try {
    const r = await db.markNurseRequestContacted(req.params.id);
    if (!r) return res.status(404).json({ error: 'الطلب غير موجود' });
    res.json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث الطلب' });
  }
});

router.delete('/requests/:id', nursingAuth, async (req, res) => {
  try {
    if (!(await db.deleteNurseRequest(req.params.id))) return res.status(404).json({ error: 'الطلب غير موجود' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء حذف الطلب' });
  }
});

// ===================== مدير التمريض: الإعدادات =====================

// رقم مدير التمريض للعامة: بطاقة «هل أنت ممرض أو ممرضة؟» في صفحة التمريض.
// GET /api/nurses/contact → { phone } (null إن لم يُضبط، فلا تظهر البطاقة)
router.get('/contact', async (req, res) => {
  try {
    res.json({ phone: await db.getSetting('nursing_contact_phone') });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

// ما بعده للإدارة وحدها: مدير التمريض لا يغيّر كلمة مروره ولا رقمه العام.
router.get('/manager/settings', adminAuth, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const [hash, phone, updated] = await Promise.all([
      db.getSetting('nursing_manager_hash'), db.getSetting('nursing_contact_phone'), db.getSetting('nursing_manager_set_at')
    ]);
    res.json({ enabled: !!hash, phone: phone || null, password_set_at: hash ? updated : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

// كلمة مرور مدير التمريض: 8 أحرف على الأقل، ولا تساوي كلمة مرور الإدارة (وإلا صار
// مدير التمريض قادراً على الدخول إلى الإدارة كلها). تُحفظ تجزئتها فقط.
router.put('/manager/password', adminAuth, async (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
  }
  if (password.length > 100) return res.status(400).json({ error: 'كلمة المرور طويلة جداً' });
  if (password === process.env.ADMIN_PASSWORD) {
    return res.status(400).json({ error: 'لا تستعمل كلمة مرور الإدارة لمدير التمريض' });
  }
  try {
    await db.setSetting('nursing_manager_hash', await bcrypt.hash(password, 10));
    await db.setSetting('nursing_manager_set_at', new Date().toISOString());
    res.json({ success: true, enabled: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء حفظ كلمة المرور' });
  }
});

// إيقاف دخول مدير التمريض فوراً: تُحذف التجزئة، فيُرفض أي طلب بكلمة المرور القديمة
router.delete('/manager/password', adminAuth, async (req, res) => {
  try {
    await db.setSetting('nursing_manager_hash', null);
    res.json({ success: true, enabled: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء إيقاف الدخول' });
  }
});

// رقم مدير التمريض الذي يظهر للممرضين الراغبين بالانضمام. الفراغ يحذفه فتختفي البطاقة.
router.put('/manager/contact', adminAuth, async (req, res) => {
  const raw = req.body ? req.body.phone : undefined;
  if (raw === '' || raw === null) {
    try { await db.setSetting('nursing_contact_phone', null); return res.json({ phone: null }); }
    catch (err) { console.error(err); return res.status(500).json({ error: 'حدث خطأ في الخادم' }); }
  }
  if (typeof raw !== 'string') return res.status(400).json({ error: 'رقم الهاتف غير صالح' });
  const digits = raw.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[\s\-()]/g, '');
  if (!/^\+?\d{7,15}$/.test(digits)) return res.status(400).json({ error: 'رقم الهاتف غير صالح' });
  try {
    await db.setSetting('nursing_contact_phone', digits);
    res.json({ phone: digits });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

module.exports = router;
