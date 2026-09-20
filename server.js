const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./db');
const medicinesRoutes = require('./routes/medicines');
const pharmaciesRoutes = require('./routes/pharmacies');
const stockRoutes = require('./routes/stock');
const ordersRoutes = require('./routes/orders');
const nursesRoutes = require('./routes/nurses');
const statsRoutes = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// حد صريح لحجم جسم الطلب. الافتراضي في Express هو 100 كيلوبايت، لكن تثبيته
// صراحةً يجعل النية واضحة ويحمي من تغير الافتراضي في إصدار لاحق.
// المنصة لا ترفع ملفات عبر JSON، فـ64 كيلوبايت أكثر من كافية لأكبر طلب.
app.use(express.json({ limit: '64kb' }));

// جسم غير صالح أو أكبر من الحد يُنتج خطأ من express.json، ولولا هذا المعالج
// لعاد كصفحة HTML من Express بدل JSON، فتعرض الواجهة رسالة غامضة للمستخدم.
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.type === 'entity.parse.failed')) {
    return res.status(400).json({ error: 'بيانات الطلب غير صالحة' });
  }
  next(err);
});

// تقديم واجهة الموقع الثابتة
app.use(express.static(path.join(__dirname, 'frontend')));

// مسارات API
app.use('/api/medicines', medicinesRoutes);
app.use('/api/pharmacies', pharmaciesRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/nurses', nursesRoutes);
app.use('/api/stats', statsRoutes);

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
