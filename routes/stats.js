const express = require('express');
const router = express.Router();
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');
const rateLimit = require('../middleware/rateLimit');
const { clientIp } = rateLimit;

// زوار ليسوا بشراً: محركات البحث، ومراقب UptimeRobot، ومعاينات الروابط في واتساب وفيسبوك،
// والمتصفحات الآلية. لا تُحسب، وإلا تضخمت الأرقام المعروضة على المعلنين.
const NON_HUMAN_UA = /bot|crawl|spider|slurp|uptimerobot|monitor|preview|facebookexternalhit|whatsapp|headless|lighthouse/i;

// تسجيل زيارة (عام) — POST /api/stats/visit
// الجسم: { device: 'mobile' | 'desktop' } ولا شيء غيره. يرد دائماً 204 بلا محتوى، حتى
// عند الرفض، فلا يعرف من يحاول التلاعب هل احتُسبت زيارته أم لا.
router.post('/visit', rateLimit(30, 15 * 60 * 1000), async (req, res) => {
  const device = req.body && req.body.device;
  if ((device === 'mobile' || device === 'desktop') && !NON_HUMAN_UA.test(String(req.get('user-agent') || ''))) {
    try { await db.recordVisit(device); } catch (err) { console.error('تعذّر تسجيل زيارة (لا يؤثر على الزائر):', err.message); }
  }
  res.status(204).end();
});

// تقرير الزيارات (للإدارة فقط) — GET /api/stats/visits?days=7|30|90
// كل أيام الفترة حاضرة في السلسلة، ومنها أيام بلا زيارات (صفر)، فلا تبدو الأعمدة متصلة كذباً.
router.get('/visits', adminAuth, async (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  try {
    const rows = await db.getVisitRows(days);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Damascus' }).format(new Date());
    const base = Date.parse(today + 'T00:00:00Z');
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(base - i * 86400000).toISOString().slice(0, 10);
      const mobile = rows.filter(r => r.day === day && r.device === 'mobile').reduce((s, r) => s + r.visits, 0);
      const desktop = rows.filter(r => r.day === day && r.device === 'desktop').reduce((s, r) => s + r.visits, 0);
      series.push({ day, mobile, desktop, total: mobile + desktop });
    }
    const sum = k => series.reduce((s, d) => s + d[k], 0);
    res.set('Cache-Control', 'no-store');
    res.json({ days, today: series[series.length - 1].total, total: sum('total'), mobile: sum('mobile'), desktop: sum('desktop'), series });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب الزيارات' });
  }
});

// إحصاءات لوحة الإدارة (للإدارة فقط)
// GET /api/stats
//
// قرار تصميمي مقصود: كل الأرقام تُحسب لحظياً من البيانات المخزّنة أصلاً
// (صيدليات، أدوية، طلبات، مخزون) — صفر جدول تتبّع جديد، وصفر كتابة عند كل بحث.
// السبب: قاعدة Supabase المجانية محدودة السعة، وجدول سجلات ينمو بلا حد كان
// سيحتاج تنظيفاً دورياً ويستهلك الحصة بلا مقابل يذكر بهذه المرحلة.
//
// ملاحظة: صفر بيانات شخصية بالاستجابة — لا أسماء مرضى ولا أرقام هواتف.
// الأرقام تجميعية بحتة، وأسماء الصيدليات والأدوية بيانات عامة أصلاً.
router.get('/', adminAuth, async (req, res) => {
  try {
    const stats = await db.getAdminStats();
    // مصدر هوية الزائر في حد المحاولات: "cloudflare" يعني أن الحماية تعتمد على عنوان
    // لا يستطيع الزائر تزييفه. يظهر في لوحة الإدارة للتحقق من ذلك على الموقع الحي.
    stats.clientIpSource = clientIp(req).source;
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب الإحصاءات' });
  }
});

// تصدير نسخة احتياطية كاملة (للإدارة فقط)
// GET /api/stats/backup
//
// خطة Supabase المجانية بلا نسخ احتياطي تلقائي، فحذف عرضي أو خلل أو انتهاء خطة
// يعني ضياع كل البيانات بلا استرجاع. هذا المسار يتيح تنزيل نسخة كاملة يدوياً.
//
// وُضع تحت /api/stats لا مسار جديد لأنه إجراء إداري من الطبقة نفسها، فلا يزيد
// سطح المسارات بلا داعٍ.
//
// ⚠️ الملف الناتج حساس: يتضمن هاش كلمات المرور وبيانات المرضى في الطلبات غير
// المحذوفة. يجب حفظه في مكان آمن لا مشاركته.
router.get('/backup', adminAuth, async (req, res) => {
  try {
    const dump = await db.exportAll();
    const stamp = dump.exported_at.slice(0, 19).replace(/[:T]/g, '-');
    res.set('Content-Disposition', `attachment; filename="dawaai-jahez-backup-${stamp}.json"`);
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(JSON.stringify(dump, null, 2));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء إنشاء النسخة الاحتياطية' });
  }
});

// تقرير الطلب المجمَّع (للإدارة فقط) — GET /api/stats/demand?days=30
// أعداد مجمّعة فقط: أكثر الأدوية طلباً، والبحث بلا نتيجة، وإشارات النقص، والتوزيع بالمدن.
router.get('/demand', adminAuth, async (req, res) => {
  let days = parseInt(req.query.days, 10);
  if (!Number.isInteger(days) || days < 1) days = 30;
  if (days > 365) days = 365;
  try {
    res.set('Cache-Control', 'no-store');
    const report = await db.getDemandReport(days);
    report.launchedAt = await db.getSetting('launched_at');
    res.json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء إعداد تقرير الطلب' });
  }
});

// بدء الإطلاق الرسمي (للإدارة فقط) — POST /api/stats/launch-reset  { confirm: "حذف" }
//
// الواجهة تطلب كتابة الكلمة وتنزّل نسخة احتياطية قبل الاستدعاء، والخادم يتحقق من
// الكلمة مرة أخرى: الواجهة قابلة للتجاوز، والحذف لا رجعة فيه.
// يعمل مرة واحدة في عمر المنصة؛ أي محاولة بعدها ترجع 409 دون حذف شيء.
router.post('/launch-reset', adminAuth, async (req, res) => {
  const confirm = req.body && typeof req.body.confirm === 'string' ? req.body.confirm.trim() : '';
  if (confirm !== 'حذف') {
    return res.status(400).json({ error: 'كلمة التأكيد غير صحيحة' });
  }
  try {
    const result = await db.launchReset();
    if (result.alreadyLaunched) {
      return res.status(409).json({ error: 'بدأ الإطلاق الرسمي مسبقاً', launchedAt: result.launchedAt });
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء بدء الإطلاق، ولم يُحذف شيء' });
  }
});

module.exports = router;
