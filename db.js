// طبقة تخزين تعتمد على قاعدة بيانات PostgreSQL حقيقية
// البيانات هون دائمة ولا تُفقد عند إعادة تشغيل الخادم

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

// ينشئ الجداول تلقائياً إذا لم تكن موجودة، ويضيف الأدوية الافتراضية أول مرة فقط
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS medicines (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      generic_name TEXT,
      alt_names TEXT[] DEFAULT '{}'
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pharmacies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      owner_username TEXT UNIQUE NOT NULL,
      owner_password_hash TEXT NOT NULL,
      on_duty BOOLEAN DEFAULT false,
      on_duty_day TEXT,
      on_duty_shift TEXT,
      on_duty_start_time TEXT,
      on_duty_end_time TEXT
    );
  `);

  // ترحيل آمن: يضيف الأعمدة الجديدة إذا كانت قاعدة البيانات منشأة من نسخة سابقة
  await pool.query(`ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS on_duty_shift TEXT;`);
  await pool.query(`ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS on_duty_start_time TEXT;`);
  await pool.query(`ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS on_duty_end_time TEXT;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock (
      pharmacy_id INTEGER REFERENCES pharmacies(id) ON DELETE CASCADE,
      medicine_id INTEGER REFERENCES medicines(id) ON DELETE CASCADE,
      available BOOLEAN DEFAULT false,
      PRIMARY KEY (pharmacy_id, medicine_id)
    );
  `);

  // طلبات المرضى: كل طلب مرتبط بصيدلية واحدة (السلة الواحدة ممكن تنقسم لعدة طلبات لو فيها صيدليات مختلفة)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      pharmacy_id INTEGER REFERENCES pharmacies(id) ON DELETE CASCADE,
      patient_name TEXT NOT NULL,
      patient_phone TEXT NOT NULL,
      items JSONB DEFAULT '[]',
      seen BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  const { rows } = await pool.query('SELECT COUNT(*) FROM medicines');
  if (Number(rows[0].count) === 0) {
    const defaults = [
      ['بنادول', 'باراسيتامول', ['بندول', 'panadol', 'paracetamol']],
      ['سيتامول', 'باراسيتامول', ['paracetamol', 'panadol']],
      ['بروسبان', 'مستخلص أوراق اللبلاب', ['bruspan', 'شراب سعال']],
      ['أوجمنتين', 'أموكسيسيلين + كلافولانيك', ['augmentin']],
      ['فولتارين', 'ديكلوفيناك', ['voltaren']]
    ];
    for (const [name, generic_name, alt_names] of defaults) {
      await pool.query(
        'INSERT INTO medicines (name, generic_name, alt_names) VALUES ($1, $2, $3)',
        [name, generic_name, alt_names]
      );
    }
  }
}

// ---------- أدوات مساعدة للتشابه الإملائي ----------

// تحسب "مسافة التحرير" بين كلمتين: أقل عدد تعديلات (إضافة/حذف/استبدال حرف)
// لتحويل كلمة لأخرى. كل ما كانت الرقم أصغر، كل ما كانت الكلمتين أقرب لبعض
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

// ---------- الأدوية ----------

async function searchMedicines(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const { rows } = await pool.query(
    `SELECT * FROM medicines
     WHERE LOWER(name) LIKE $1
        OR LOWER(COALESCE(generic_name, '')) LIKE $1
        OR EXISTS (SELECT 1 FROM unnest(alt_names) a WHERE LOWER(a) LIKE $1)`,
    [`%${q}%`]
  );
  return rows;
}

async function addMedicine({ name, generic_name, alt_names }) {
  const { rows } = await pool.query(
    'INSERT INTO medicines (name, generic_name, alt_names) VALUES ($1, $2, $3) RETURNING *',
    [name, generic_name || null, alt_names || []]
  );
  return rows[0];
}

async function getAllMedicines() {
  const { rows } = await pool.query('SELECT * FROM medicines ORDER BY id');
  return rows;
}

// تقترح أدوية قريبة إملائياً من كلمة البحث (تتحمل خطأ حرف أو حرفين)
async function suggestMedicines(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const medicines = await getAllMedicines();
  const maxDistance = q.length <= 3 ? 1 : (q.length <= 6 ? 2 : 3);

  const scored = [];
  for (const m of medicines) {
    const candidates = [m.name, ...(m.alt_names || [])];
    let bestDistance = Infinity;
    for (const candidate of candidates) {
      const c = candidate.toLowerCase();
      const distanceFull = levenshtein(q, c);
      const distancePartial = levenshtein(q, c.slice(0, q.length));
      const distance = Math.min(distanceFull, distancePartial);
      if (distance < bestDistance) bestDistance = distance;
    }
    if (bestDistance <= maxDistance && bestDistance > 0) {
      scored.push({ id: m.id, name: m.name, generic_name: m.generic_name, distance: bestDistance });
    }
  }

  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, 5).map(({ distance, ...rest }) => rest);
}

async function deleteMedicine(medicineId) {
  await pool.query('DELETE FROM medicines WHERE id = $1', [medicineId]);
}

// ---------- الصيدليات ----------

async function getAllPharmacies() {
  const { rows } = await pool.query(
    'SELECT id, name, address, phone, owner_username, on_duty, on_duty_day, on_duty_shift, on_duty_start_time, on_duty_end_time FROM pharmacies ORDER BY id'
  );
  return rows;
}

async function findPharmacyByUsername(username) {
  const { rows } = await pool.query('SELECT * FROM pharmacies WHERE owner_username = $1', [username]);
  return rows[0];
}

async function getPharmacyById(pharmacyId) {
  const { rows } = await pool.query('SELECT * FROM pharmacies WHERE id = $1', [pharmacyId]);
  return rows[0];
}

async function addPharmacy({ name, address, phone, username, passwordHash }) {
  const { rows } = await pool.query(
    `INSERT INTO pharmacies (name, address, phone, owner_username, owner_password_hash)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, address || null, phone || null, username, passwordHash]
  );
  return rows[0];
}

async function deletePharmacy(pharmacyId) {
  await pool.query('DELETE FROM pharmacies WHERE id = $1', [pharmacyId]);
}

async function setDutyStatus(pharmacyId, onDuty, day, shift, startTime, endTime) {
  const { rows } = await pool.query(
    `UPDATE pharmacies
     SET on_duty = $1, on_duty_day = $2, on_duty_shift = $3, on_duty_start_time = $4, on_duty_end_time = $5
     WHERE id = $6 RETURNING *`,
    [
      !!onDuty,
      onDuty ? (day || null) : null,
      onDuty ? (shift || 'طوال اليوم') : null,
      onDuty ? (startTime || null) : null,
      onDuty ? (endTime || null) : null,
      pharmacyId
    ]
  );
  return rows[0];
}

async function getOnDutyPharmacies() {
  const { rows } = await pool.query(
    'SELECT id, name, address, phone, on_duty, on_duty_day, on_duty_shift, on_duty_start_time, on_duty_end_time FROM pharmacies WHERE on_duty = true ORDER BY on_duty_shift, id'
  );
  return rows;
}

// ---------- المخزون ----------

async function getAvailability(medicineId) {
  const { rows } = await pool.query(
    `SELECT p.id AS pharmacy_id, p.name AS pharmacy_name, p.address, p.phone,
            COALESCE(s.available, false) AS available
     FROM pharmacies p
     LEFT JOIN stock s ON s.pharmacy_id = p.id AND s.medicine_id = $1
     ORDER BY p.name`,
    [medicineId]
  );
  return rows;
}

async function getStockForPharmacy(pharmacyId) {
  const { rows } = await pool.query(
    `SELECT m.id AS medicine_id, m.name, m.generic_name,
            COALESCE(s.available, false) AS available
     FROM medicines m
     LEFT JOIN stock s ON s.medicine_id = m.id AND s.pharmacy_id = $1
     ORDER BY m.name`,
    [pharmacyId]
  );
  return rows;
}

async function setStock(pharmacyId, medicineId, available) {
  await pool.query(
    `INSERT INTO stock (pharmacy_id, medicine_id, available)
     VALUES ($1, $2, $3)
     ON CONFLICT (pharmacy_id, medicine_id) DO UPDATE SET available = $3`,
    [pharmacyId, medicineId, !!available]
  );
}

// ---------- الطلبات ----------

async function createOrder(pharmacyId, patientName, patientPhone, items) {
  const { rows } = await pool.query(
    `INSERT INTO orders (pharmacy_id, patient_name, patient_phone, items)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [pharmacyId, patientName, patientPhone, JSON.stringify(items)]
  );
  return rows[0];
}

async function getOrdersForPharmacy(pharmacyId) {
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE pharmacy_id = $1 ORDER BY created_at DESC`,
    [pharmacyId]
  );
  return rows;
}

async function markOrderSeen(orderId) {
  await pool.query(`UPDATE orders SET seen = true WHERE id = $1`, [orderId]);
}

async function deleteOrder(orderId) {
  await pool.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
}

module.exports = {
  initDb,
  searchMedicines,
  addMedicine,
  getAllMedicines,
  suggestMedicines,
  deleteMedicine,
  getAllPharmacies,
  findPharmacyByUsername,
  getPharmacyById,
  addPharmacy,
  deletePharmacy,
  setDutyStatus,
  getOnDutyPharmacies,
  getAvailability,
  getStockForPharmacy,
  setStock,
  createOrder,
  getOrdersForPharmacy,
  markOrderSeen,
  deleteOrder
};
