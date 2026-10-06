const express = require('express');
const router = express.Router();
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');
const rateLimit = require('../middleware/rateLimit');

// زوار ليسوا بشراً لا تُحسب لهم مشاهدة ولا نقرة (القائمة نفسها في عدّاد الزيارات)
const NON_HUMAN_UA = /bot|crawl|spider|slurp|uptimerobot|monitor|preview|facebookexternalhit|whatsapp|headless|lighthouse/i;

// الإعلانات المباشرة (أكتوبر 2026)
// يبيعها صاحب المنصة لمعلنين محليين ويديرها من لوحة الإدارة. لا شبكات إعلان خارجية:
// لا يختار غيرُنا ما يراه مريض قلِق، ولا تُحمَّل برامج خارجية تُبطئ الموقع.
//
// قيود ثابتة يفرضها الخادم لا الواجهة وحدها:
// - الصورة: JPEG أو PNG أو WEBP حقيقية (تُفحص بايتاتها الأولى لا امتدادها)، وبحد أقصى.
// - الرابط: موقع آمن https، أو رقم هاتف tel:، فقط. فلا يمر رابط javascript: أو http مكشوف.
// - المكان: الرئيسية أو التجميل فقط. ولا إعلانات في نتائج البحث ولا المناوبة أبداً.

// المعرّفات في الرابط أرقام صحيحة موجبة ضمن نطاق PostgreSQL (النمط نفسه في بقية المسارات)
function validIdParam(req, res, next, value) {
  if (/^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647) return next();
  return res.status(400).json({ error: 'معرّف غير صالح' });
}
router.param('id', validIdParam);

const AD_MAX_BYTES = 600 * 1024;   // الصورة تُضغط في المتصفح إلى نحو 100 كيلوبايت، والحد هامش أمان
const PLACEMENTS = ['home', 'cosmetic'];

function sniffImage(buf) {
  if (!Buffer.isBuffer(buf)) return null;
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

// يعيد الرابط مقبولاً أو null إن كان فارغاً، أو يرمي برسالة إن كان غير مسموح
function cleanLink(raw) {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return null;
  if (v.length > 300) throw new Error('الرابط طويل جداً');
  if (/^https:\/\/[^\s<>"']+$/i.test(v)) {
    try { new URL(v); return v; } catch (e) { /* يسقط إلى الرفض */ }
  }
  if (/^tel:\+?\d{6,15}$/.test(v)) return v;
  throw new Error('الرابط غير مقبول: يجب أن يبدأ بـ https:// أو أن يكون رقم هاتف');
}

function cleanDate(raw) {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z'))) throw new Error('تاريخ غير صالح');
  return v;
}

// قائمة الإعلانات للإدارة (دون الصور نفسها) — GET /api/ads/admin
router.get('/admin', adminAuth, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await db.listAdsAdmin());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب الإعلانات' });
  }
});

// إضافة إعلان — POST /api/ads?advertiser=&link=&placement=&starts=&ends=
// الصورة نفسها في جسم الطلب (لا JSON)، والبيانات في الرابط. نقرأ الجسم هنا لا في الخادم
// العام، ونرد على تجاوز الحجم برسالة واضحة بدل "خطأ في الخادم".
const readImageBody = express.raw({ type: () => true, limit: AD_MAX_BYTES });
router.post('/', adminAuth, (req, res, next) => {
  readImageBody(req, res, (err) => {
    if (!err) return next();
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'حجم الصورة كبير جداً', code: 'TOOBIG' });
    return res.status(400).json({ error: 'تعذّرت قراءة الصورة', code: 'BADFILE' });
  });
}, async (req, res) => {
  const mime = sniffImage(req.body);
  if (!mime) return res.status(415).json({ error: 'الصورة غير مقبولة', code: 'BADTYPE' });
  const advertiser = typeof req.query.advertiser === 'string' ? req.query.advertiser.trim() : '';
  if (!advertiser || advertiser.length > 80) return res.status(400).json({ error: 'اسم المعلن مطلوب (حتى 80 حرفاً)' });
  const placement = PLACEMENTS.includes(req.query.placement) ? req.query.placement : null;
  if (!placement) return res.status(400).json({ error: 'مكان الإعلان غير صالح' });
  let link, startsOn, endsOn;
  try {
    link = cleanLink(req.query.link);
    startsOn = cleanDate(req.query.starts);
    endsOn = cleanDate(req.query.ends);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  if (startsOn && endsOn && endsOn < startsOn) return res.status(400).json({ error: 'تاريخ النهاية قبل تاريخ البداية' });
  try {
    const ad = await db.createAd({ advertiser, link, placement, startsOn, endsOn, image: req.body, mime });
    res.status(201).json(ad);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء حفظ الإعلان' });
  }
});

// الإعلانات المعروضة الآن (عام) — GET /api/ads/active?placement=home|cosmetic
router.get('/active', async (req, res) => {
  const placement = PLACEMENTS.includes(req.query.placement) ? req.query.placement : 'home';
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await db.getRunningAds(placement));
  } catch (err) {
    console.error(err);
    res.json([]);   // فشل الإعلانات لا يظهر للزائر أبداً: لا إعلان، والصفحة سليمة
  }
});

// تسجيل ظهور أو نقرة (عام) — POST /api/ads/:id/event { type: 'impression' | 'click' }
// يرد دائماً 204 بلا محتوى، حتى عند الرفض، فلا يعرف من يحاول التلاعب هل احتُسب حدثه.
router.post('/:id/event', rateLimit(60, 15 * 60 * 1000), async (req, res) => {
  const type = req.body && req.body.type;
  if ((type === 'impression' || type === 'click') && !NON_HUMAN_UA.test(String(req.get('user-agent') || ''))) {
    try { await db.recordAdEvent(req.params.id, type); } catch (err) { console.error('تعذّر تسجيل حدث إعلان (لا يؤثر على الزائر):', err.message); }
  }
  res.status(204).end();
});

// صورة الإعلان — GET /api/ads/:id/image
// عامة: الصورة ستُعرض للزوار أصلاً. صورة كل معرّف لا تتغير أبداً (التعديل = إعلان جديد)،
// فتُخزَّن في المتصفح يوماً كاملاً ولا تُحمَّل مرة ثانية على الإنترنت الضعيف.
router.get('/:id/image', async (req, res) => {
  try {
    const img = await db.getAdImage(req.params.id);
    if (!img) return res.status(404).end();
    res.set('Content-Type', img.image_mime);
    res.set('Cache-Control', 'public, max-age=86400');
    // تحويل صريح إلى Buffer: مكتبة pg تعيد Buffer، لكن غيرها قد يعيد Uint8Array، وExpress
    // يرسل Uint8Array كأنه كائن JSON لا صورة. التحويل يجعل الخدمة صحيحة أياً كانت المكتبة.
    res.send(Buffer.from(img.image));
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

// إيقاف إعلان أو استئنافه — PUT /api/ads/:id/active { active: true|false }
router.put('/:id/active', adminAuth, async (req, res) => {
  if (typeof req.body.active !== 'boolean') return res.status(400).json({ error: 'قيمة غير صالحة' });
  try {
    const ad = await db.setAdActive(req.params.id, req.body.active);
    if (!ad) return res.status(404).json({ error: 'الإعلان غير موجود' });
    res.json(ad);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث الإعلان' });
  }
});

// حذف إعلان — DELETE /api/ads/:id
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    if (!(await db.deleteAd(req.params.id))) return res.status(404).json({ error: 'الإعلان غير موجود' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء حذف الإعلان' });
  }
});

module.exports = router;
