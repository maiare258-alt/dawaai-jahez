const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { DUMMY_PASSWORD_HASH } = require('./shared');

// صلاحية «التمريض»: يدخلها المدير بكلمة مرور الإدارة، أو مدير التمريض بكلمة مروره الخاصة.
//
// كلمة مرور مدير التمريض يضعها المدير من لوحة الإدارة، وتُحفظ تجزئتها (bcrypt) فقط في
// app_settings، لا النص نفسه. حين يوقفها المدير يُحذف المفتاح فيُرفض كل دخول فوراً،
// دون الحاجة إلى Render أو إعادة تشغيل الخادم.
//
// هذه الصلاحية لا تفتح إلا مسارات التمريض: إضافة الممرضين وتعديلهم، والتقييمات، وطلبات
// الزيارات. حذف الممرضين والشهادات وكل ما سوى التمريض يبقى لكلمة مرور الإدارة وحدها.
// req.nursingRole يصير 'admin' أو 'manager'.

function safeCompare(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// الترويسات لا تقبل إلا أحرفاً لاتينية، فالمتصفح يرسل كلمة المرور مشفّرة (encodeURIComponent)
// كي تعمل كلمات المرور العربية أيضاً
function decodeHeader(v) {
  try { return decodeURIComponent(String(v)); } catch (e) { return String(v); }
}

module.exports = async function nursingAuth(req, res, next) {
  const adminPw = req.headers['x-admin-password'];
  const expected = process.env.ADMIN_PASSWORD;
  if (adminPw && expected && safeCompare(adminPw, expected)) {
    req.nursingRole = 'admin';
    return next();
  }

  const raw = req.headers['x-nursing-password'];
  if (!raw) return res.status(401).json({ error: 'كلمة مرور مدير التمريض غير صحيحة' });
  const password = decodeHeader(raw);

  let hash = null;
  try {
    hash = await db.getSetting('nursing_manager_hash');
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
  // الدخول موقوف أو لم يُضبط بعد: نقارن بتجزئة وهمية بالكلفة نفسها، فلا يكشف زمن الرد
  // هل الدخول مفعّل أصلاً
  if (!hash) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return res.status(401).json({ error: 'كلمة مرور مدير التمريض غير صحيحة' });
  }
  if (!(await bcrypt.compare(password, hash))) {
    return res.status(401).json({ error: 'كلمة مرور مدير التمريض غير صحيحة' });
  }
  req.nursingRole = 'manager';
  next();
};
