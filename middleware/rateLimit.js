// حماية من تخمين كلمات المرور بالقوة الغاشمة (brute force).
//
// قرار تصميمي: مبني بلا أي مكتبة خارجية عن قصد. المشروع يعتمد 5 حزم فقط،
// وإضافة حزمة لأجل عدّاد بسيط يزيد سطح الهجوم وحجم النشر بلا مقابل.
//
// التخزين في ذاكرة العملية: يُصفَّر عند إعادة تشغيل الخادم، وهذا مقبول تماماً
// هنا — الهجوم يحتاج آلاف المحاولات المتتالية، وإعادة التشغيل تقطعها أصلاً.
// (لو صار للمشروع عدة خوادم لاحقاً، سيحتاج مخزناً مشتركاً مثل Redis.)

const attempts = new Map();

// تنظيف دوري للمداخل المنتهية حتى لا تنمو الخريطة بلا حد مع كثرة عناوين IP.
// unref حتى لا يمنع هذا المؤقت الخادم من الإغلاق الطبيعي.
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now > entry.resetAt) attempts.delete(key);
  }
}, CLEANUP_INTERVAL_MS).unref();

/**
 * @param {number} max      أقصى عدد محاولات ضمن النافذة
 * @param {number} windowMs طول النافذة الزمنية بالمللي ثانية
 */
function rateLimit(max = 10, windowMs = 15 * 60 * 1000) {
  return function (req, res, next) {
    // Render خلف بروكسي، فالعنوان الحقيقي في x-forwarded-for.
    // نأخذ أول عنوان لأن السلسلة قد تحوي عدة وكلاء.
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (forwarded ? String(forwarded).split(',')[0] : req.ip || '').trim() || 'unknown';
    const key = `${req.baseUrl}${req.path}:${ip}`;
    const now = Date.now();

    let entry = attempts.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      attempts.set(key, entry);
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'محاولات كثيرة جداً. حاول بعد قليل.' });
    }

    next();
  };
}

module.exports = rateLimit;
