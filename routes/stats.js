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

module.exports = router;
