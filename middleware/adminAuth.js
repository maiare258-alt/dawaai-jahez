const crypto = require('crypto');

// يتأكد أن الطلب يحمل كلمة مرور الإدارة الصحيحة قبل تنفيذ أي عملية حساسة
// (إضافة/حذف صيدليات، إضافة/حذف أدوية، إعادة تعيين كلمات المرور، الإحصاءات)

// مقارنة ثابتة الزمن: المقارنة العادية (!==) تتوقف عند أول حرف مختلف، فزمن الرد
// يكشف عدد الأحرف الصحيحة من بدايتها، ويمكن نظرياً استنتاج كلمة المرور حرفاً حرفاً.
// timingSafeEqual يقارن كل البايتات دائماً فلا يتسرب أي شيء من الزمن.
// نجزّئ المدخلين بـSHA-256 أولاً لأن timingSafeEqual يرفض المخازن المختلفة الطول،
// وطول الخلاصة ثابت دائماً (32 بايت) فلا يتسرب حتى طول كلمة المرور.
function safeCompare(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = function adminAuth(req, res, next) {
  const password = req.headers['x-admin-password'];
  const expected = process.env.ADMIN_PASSWORD;

  // حارس تشغيلي: لو نُسي ضبط المتغير بالبيئة، نرفض كل شيء بدل أن يمرّ الجميع.
  // (بدونه كان `undefined !== undefined` سيصير false فينفتح الباب للجميع لو أُرسلت
  //  ترويسة فارغة — خطأ إعداد يتحول إلى ثغرة كاملة.)
  if (!expected) {
    console.error('[خطأ إعداد] ADMIN_PASSWORD غير مضبوط — رُفضت كل طلبات الإدارة.');
    return res.status(500).json({ error: 'خطأ في إعداد الخادم' });
  }

  if (!password || !safeCompare(password, expected)) {
    return res.status(401).json({ error: 'كلمة مرور الإدارة غير صحيحة' });
  }
  next();
};
