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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// تقديم واجهة الموقع الثابتة
app.use(express.static(path.join(__dirname, 'frontend')));

// مسارات API
app.use('/api/medicines', medicinesRoutes);
app.use('/api/pharmacies', pharmaciesRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/nurses', nursesRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ⚠️ مسار مؤقت لمرة واحدة: نقل كل البيانات لقاعدة Supabase الجديدة — يُحذف بعد إتمام النقل
app.get('/api/admin/migrate-to-supabase', async (req, res) => {
  if (req.query.password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'كلمة مرور خاطئة' });
  }
  try {
    const runMigration = require('./migrate-to-supabase');
    const summary = await runMigration();
    res.json({ success: true, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ⚠️ مسار مؤقت لنقل البيانات لقاعدة جديدة — احذف هذا الجزء كامل بعد نجاح النقل
app.get('/api/admin/migrate-temp', async (req, res) => {
  if (req.query.password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'كلمة مرور خاطئة' });
  }
  if (!process.env.NEW_DATABASE_URL) {
    return res.status(400).json({ error: 'متغيّر NEW_DATABASE_URL غير موجود بإعدادات Render' });
  }
  try {
    const { runMigration } = require('./migrate-temp');
    const result = await runMigration();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'فشل النقل', details: err.message });
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
