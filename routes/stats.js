const express = require('express');
const router = express.Router();
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');

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
    res.json(await db.getAdminStats());
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
