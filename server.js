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

app.get('/health', (req, res) => res.json({ status: 'ok' }));

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
