const express = require('express');

// ===== شبكة أمان للأخطاء في المسارات غير المتزامنة =====
// الموقع يعمل بـExpress 4، وهو لا يلتقط الأخطاء التي تقع داخل دالة غير متزامنة خارج
// try/catch: تتحول إلى وعد مرفوض بلا معالج، فتُسقط Node العملية كلها. أثبت الاختبار أن
// طلباً واحداً من زائر مجهول ({"name": 123} إلى مسار إضافة دواء) كان يُسقط الخادم.
// هنا نمرّر أي خطأ من هذا النوع إلى معالج الأخطاء الأخير، فيعود رد 500 عادياً ويبقى
// الخادم حياً. (Express 5 يفعل هذا بنفسه، فالتعديل يُتخطى إن لم يوجد الملف.)
try {
  const Layer = require('express/lib/router/layer');
  const originalHandle = Layer.prototype.handle_request;
  Layer.prototype.handle_request = function (req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) return originalHandle.call(this, req, res, next); // معالجات الأخطاء
    try {
      const result = fn(req, res, next);
      if (result && typeof result.catch === 'function') result.catch(next);
    } catch (err) {
      next(err);
    }
  };
} catch (e) { /* Express 5: يلتقطها بنفسه */ }

// ملاذ أخير: وعد مرفوض في أي مكان آخر يُسجَّل ولا يُسقط الخادم
process.on('unhandledRejection', (reason) => {
  console.error('وعد مرفوض بلا معالج (لم يُسقط الخادم):', reason && reason.message ? reason.message : reason);
});
const cors = require('cors');
const compression = require('compression');
const path = require('path');
require('dotenv').config();

const db = require('./db');
const medicinesRoutes = require('./routes/medicines');
const pharmaciesRoutes = require('./routes/pharmacies');
const stockRoutes = require('./routes/stock');
const ordersRoutes = require('./routes/orders');
const nursesRoutes = require('./routes/nurses');
const statsRoutes = require('./routes/stats');
const adsRoutes = require('./routes/ads');
const { clientIp } = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 3000;

// ضغط الاستجابات. app.js وindex.html وحدهما 366 كيلوبايت، والضغط يجعلها نحو 91.
// على اتصال محمول بسرعة 1 ميغابت، هذا الفرق بين نحو 3 ثوانٍ وثانية واحدة لأول تحميل.
// الحزمة من فريق Express الرسمي، وتتخطى تلقائياً الاستجابات الصغيرة والمضغوطة أصلاً.
app.use(compression());

// ترويسات أمان أساسية.
// - DENY يمنع تضمين الموقع داخل إطار في موقع آخر: بدونه يمكن خداع المدير بصفحة تضع
//   لوحة الإدارة داخل إطار شفاف فيضغط "حذف" أو "بدء الإطلاق" وهو يظن أنه يضغط شيئاً آخر.
// - nosniff يمنع المتصفح من تخمين نوع الملف وتنفيذ ما ليس برنامجاً.
app.use((req, res, next) => {
  res.set('X-Frame-Options', 'DENY');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(cors());

// حد صريح لحجم جسم الطلب. الافتراضي في Express هو 100 كيلوبايت، لكن تثبيته
// صراحةً يجعل النية واضحة ويحمي من تغير الافتراضي في إصدار لاحق.
// المنصة لا ترفع ملفات عبر JSON، فـ64 كيلوبايت أكثر من كافية لأكبر طلب.
// الاستثناء الوحيد: استيراد الأدوية من ملف يقبل حتى 500 صنف (نحو 70 كيلوبايت أو أكثر)،
// فله حد أكبر خاص به. يجب أن يسبق الحد العام، لأن الجسم يُقرأ مرة واحدة.
app.use('/api/medicines/bulk-import', express.json({ limit: '512kb' }));
app.use(express.json({ limit: '64kb' }));

// جسم غير صالح أو أكبر من الحد يُنتج خطأ من express.json، ولولا هذا المعالج
// لعاد كصفحة HTML من Express بدل JSON، فتعرض الواجهة رسالة غامضة للمستخدم.
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.type === 'entity.parse.failed')) {
    return res.status(400).json({ error: 'بيانات الطلب غير صالحة' });
  }
  next(err);
});

// ===== تنقية المدخلات قبل وصولها لأي مسار =====
// اختبار الإدخال المشوَّه كشف أن أنواعاً غير متوقعة تُسقط الطلب بخطأ 500. نعالجها هنا
// مرة واحدة، فتحمي المسارات الحالية وأي مسار يُضاف مستقبلاً.

// حرف NUL (\u0000) لا يقبله PostgreSQL في النصوص، فيرمي خطأً عند الحفظ.
function containsNul(v, depth = 0) {
  if (depth > 6) return false;
  if (typeof v === 'string') return v.includes('\u0000');
  if (Array.isArray(v)) return v.some(x => containsNul(x, depth + 1));
  if (v && typeof v === 'object') return Object.keys(v).some(k => containsNul(k, depth + 1) || containsNul(v[k], depth + 1));
  return false;
}
const CREDENTIAL_FIELDS = ['username', 'password', 'current_password', 'new_password'];

app.use('/api', (req, res, next) => {
  // معامل مكرّر في الرابط (?q=a&q=b) يصل قائمةً لا نصاً، فنأخذ أول قيمة نصية فقط
  for (const k of Object.keys(req.query || {})) {
    const v = req.query[k];
    if (Array.isArray(v)) req.query[k] = typeof v[0] === 'string' ? v[0] : '';
    else if (v && typeof v === 'object') req.query[k] = '';
  }
  if (containsNul(req.body) || containsNul(req.query)) {
    return res.status(400).json({ error: 'بيانات الطلب غير صالحة' });
  }
  // كلمة مرور ليست نصاً (رقم أو كائن) كانت تُسقط مكتبة التشفير بخطأ 500
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  for (const f of CREDENTIAL_FIELDS) {
    if (body[f] !== undefined && body[f] !== null && typeof body[f] !== 'string') {
      return res.status(400).json({ error: 'بيانات الدخول غير صالحة' });
    }
  }
  next();
});

// ===== حد لمحاولات كلمة المرور الخاطئة =====
// كلمة مرور الإدارة كانت بلا أي حد، ومسارات الصيدلي (غير الدخول) تختبر كلمة المرور
// بلا حد أيضاً فتلتف على حماية الدخول. نحتسب هنا كل رد 401 (بيانات دخول خاطئة) لكل
// زائر، وبعد 20 محاولة خاطئة في ربع ساعة نوقفه مؤقتاً. الطلبات الناجحة لا تُحتسب،
// فالمدير والصيادلة لا يتأثرون، والمرضى لا يُدخلون كلمات مرور أصلاً.
const AUTH_FAIL_MAX = 20;
const AUTH_FAIL_WINDOW_MS = 15 * 60 * 1000;
const authFailures = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of authFailures) if (now > e.resetAt) authFailures.delete(k);
}, 10 * 60 * 1000).unref();

app.use('/api', (req, res, next) => {
  const ip = clientIp(req).ip;
  const now = Date.now();
  const entry = authFailures.get(ip);
  if (entry && now <= entry.resetAt && entry.count >= AUTH_FAIL_MAX) {
    res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'محاولات كثيرة جداً. حاول بعد قليل.' });
  }
  res.on('finish', () => {
    if (res.statusCode !== 401) return;
    const e = authFailures.get(ip);
    if (!e || Date.now() > e.resetAt) authFailures.set(ip, { count: 1, resetAt: Date.now() + AUTH_FAIL_WINDOW_MS });
    else e.count++;
  });
  next();
});

// تقديم واجهة الموقع الثابتة
// ملفات الخط لا تتغير أبداً (تغييرها يكون باسم ملف جديد)، فيحفظها المتصفح سنة كاملة دون
// أن يسأل الخادم عنها. هذا ما يجعل الخط حاضراً فوراً في كل زيارة بعد الأولى، فلا وميض.
app.use(express.static(path.join(__dirname, 'frontend'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.woff2')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}));

// مسارات API
app.use('/api/medicines', medicinesRoutes);
app.use('/api/pharmacies', pharmaciesRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/nurses', nursesRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/ads', adsRoutes);

// فحص الصحة. يفحص قاعدة البيانات فعلياً لا يرد "ok" بلا شرط:
// رد إيجابي من خادم لا يصل إلى قاعدته يُفرغ المراقبة من معناها.
//
// 503 عند العطل مقصود: أدوات المراقبة تعتبر أي رد خارج 2xx تعطّلاً فتُرسل
// تنبيهاً، وهذا بالضبط ما نريده. والخادم يبقى مستيقظاً على أي حال، فطلب
// إبقاء الخدمة حية يؤدي غرضه سواء كانت القاعدة سليمة أم لا.
//
// no-store ضروري: رد مخبَّأ من وسيط أو شبكة توصيل يجعل المراقبة ترى حالة قديمة.
app.get('/health', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await db.ping();
    res.json({ status: 'ok', db: 'ok', time: new Date().toISOString() });
  } catch (err) {
    console.error('فحص الصحة: تعذّر الوصول إلى قاعدة البيانات', err.message);
    res.status(503).json({ status: 'degraded', db: 'down', time: new Date().toISOString() });
  }
});

// معالج أخير لأي خطأ لم يُلتقط داخل مساره. بدونه يرد Express بصفحة HTML قد تحوي
// مسار الملفات على الخادم وسطور الكود، فنرد برسالة عامة بصيغة JSON ونسجّل التفاصيل.
app.use((err, req, res, next) => {
  console.error('خطأ غير ملتقط:', req.method, req.originalUrl, err && err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'حدث خطأ في الخادم' });
});

db.initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`الخادم يعمل على http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('فشل الاتصال بقاعدة البيانات:', err);
    process.exit(1);
  });
