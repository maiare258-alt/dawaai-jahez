const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./db');
const medicinesRoutes = require('./routes/medicines');
const pharmaciesRoutes = require('./routes/pharmacies');
const stockRoutes = require('./routes/stock');
const ordersRoutes = require('./routes/orders');

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
