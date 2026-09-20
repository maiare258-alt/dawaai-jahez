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

module.exports = router;
