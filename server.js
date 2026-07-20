const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const medicinesRoutes = require('./routes/medicines');
const pharmaciesRoutes = require('./routes/pharmacies');
const stockRoutes = require('./routes/stock');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// تقديم واجهة الموقع الثابتة
app.use(express.static(path.join(__dirname, '../frontend')));

// مسارات API
app.use('/api/medicines', medicinesRoutes);
app.use('/api/pharmacies', pharmaciesRoutes);
app.use('/api/stock', stockRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`الخادم يعمل على http://localhost:${PORT}`);
});
