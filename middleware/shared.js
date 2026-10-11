// أدوات مشتركة بين ملفات المسارات (routes). كانت كل أداة منها منسوخة في عدة ملفات،
// فأي تعديل عليها كان يتطلب تذكّر كل النسخ. الآن مكان واحد.

const bcrypt = require('bcryptjs');

// المعرّفات في الرابط أرقام صحيحة موجبة ضمن نطاق PostgreSQL. أي قيمة أخرى ("abc"،
// "1.5"، رقم من عشرين خانة) كانت تصل إلى القاعدة فترمي خطأً يعود 500 بدل رفض واضح.
// الاستعمال: router.param('id', validIdParam);
function validIdParam(req, res, next, value) {
  if (/^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647) return next();
  return res.status(400).json({ error: 'معرّف غير صالح' });
}

// ن8: حين لا يوجد اسم المستخدم نقارن كلمة المرور بتجزئة وهمية بالكلفة نفسها (10) بدل الرد
// فوراً. كان الرد السريع (3 ملّي ثانية مقابل 70) يكشف أي أسماء المستخدمين موجودة.
// تُحسب مرة واحدة عند تشغيل الخادم (كانت تُحسب أربع مرات، مرة في كل ملف).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dawaai-jahez-no-such-user', 10);

module.exports = { validIdParam, DUMMY_PASSWORD_HASH };
