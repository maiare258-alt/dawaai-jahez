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
      alt_names TEXT[] DEFAULT '{}',
      category TEXT DEFAULT 'medicine'
    );
  `);
  await pool.query(`ALTER TABLE medicines ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'medicine';`);

  // حماية جذرية من تكرار الدواء الواحد بالقائمة العامة، على مستوى قاعدة البيانات نفسها.
  // بدون هذا الفهرس، فحص "هل الدواء موجود؟" بالكود ممكن ينخدع لو وصل طلبان بنفس اللحظة
  // تماماً (مثلاً ضغط زر الرفع مرتين وقت بطء الشبكة): الاثنان بيفحصوا فيلاقوا الدواء غير
  // موجود، فيضيفوه مرتين. الفهرس الفريد بيمنع هذا نهائياً لأن القاعدة نفسها بترفض الصف الثاني.
  // ملاحظة: لو كانت القاعدة تحتوي مكررات قديمة، إنشاء الفهرس بيفشل — لهذا هو داخل try/catch
  // حتى لا يتعطل إقلاع السيرفر بالكامل، مع طباعة تحذير واضح بالسجل (والكود يتعامل مع الحالتين).
  try {
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS medicines_name_category_unique ON medicines (name, category);`);
  } catch (err) {
    console.error('[تحذير] تعذّر إنشاء فهرس منع تكرار الأدوية — على الأرجح توجد أدوية مكررة بالقائمة العامة. نظّفها ثم أعد تشغيل الخادم.', err.message);
  }

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
  // رقم هاتف مساعد اختياري، يظهر جنب الرقم الأساسي — لتخفيف ضغط العمل على رقم واحد بس
  await pool.query(`ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS assistant_phone TEXT;`);

  // عمود المدينة — أساس التوسع خارج سلمية.
  // يُخزَّن كمفتاح إنكليزي ثابت (مثل 'salamiyah') وليس كاسم عربي، لسببين:
  // (1) الترجمة: نفس السجل يُعرض "سلمية" بالعربي و"Salamiyah" بالإنكليزي.
  // (2) منع تعدد الإملاء: "سلمية" و"سلميه" و"السلمية" كانت ستصبح ثلاث مدن مختلفة
  //     فينكسر أي تجميع أو فلترة — نفس الدرس المستفاد من تكرار أسماء الأدوية.
  // العمود اختياري (صفر NOT NULL) حفاظاً على توافق السجلات القديمة، تماماً كباقي
  // الأعمدة المضافة لاحقاً (assistant_phone, on_duty_shift...).
  await pool.query(`ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS city TEXT;`);
  // تعبئة السجلات القديمة بسلمية — هي الواقع الفعلي لكل الصيدليات المسجّلة حتى الآن.
  // آمن ومتكرر: يمس الصفوف الفارغة فقط، فتشغيله مراراً لا يغيّر أي مدينة محدّدة.
  await pool.query(`UPDATE pharmacies SET city = 'salamiyah' WHERE city IS NULL;`);

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
  // تاريخا الصنع والانتهاء خاصان بدفعة كل صيدلية من الدواء — أداة داخلية للصيدلي فقط، ما بتظهر للمريض إطلاقاً
  await pool.query(`ALTER TABLE stock ADD COLUMN IF NOT EXISTS manufacture_date DATE;`);
  await pool.query(`ALTER TABLE stock ADD COLUMN IF NOT EXISTS expiry_date DATE;`);

  // طلبات المرضى: كل طلب مرتبط بصيدلية واحدة (السلة الواحدة ممكن تنقسم لعدة طلبات لو فيها صيدليات مختلفة)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      pharmacy_id INTEGER REFERENCES pharmacies(id) ON DELETE CASCADE,
      patient_name TEXT NOT NULL,
      patient_phone TEXT NOT NULL,
      items JSONB DEFAULT '[]',
      seen BOOLEAN DEFAULT false,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  // ملاحظة نصية اختيارية من المريض (مثلاً توضيح إضافي لو خط الطبيب مو واضح) — بتظهر للصيدلي مع الطلب
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';`);
  // حذف ناعم للطلبات. السبب: كل إحصاءات المنصة (إجمالي الطلبات، النوافذ الزمنية،
  // أكثر الأدوية طلباً، أنشط الصيدليات) محسوبة من جدول orders. الحذف النهائي السابق
  // كان يمحو الصف فتضيع معه الإحصاءات — أي أن الصيدلية الأنشط (التي تنظّف قائمتها
  // باستمرار) كانت تظهر بأقل الأرقام، وهو عكس المطلوب تماماً.
  // الآن يُعلَّم الصف كمحذوف فيختفي عن الصيدلي، ويبقى محسوباً بالإحصاءات.
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`);

  // خدمات التمريض
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nurses (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      specialty TEXT,
      university TEXT,
      graduation_year TEXT,
      phone TEXT,
      available BOOLEAN DEFAULT true
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS nurse_ratings (
      id SERIAL PRIMARY KEY,
      nurse_id INTEGER REFERENCES nurses(id) ON DELETE CASCADE,
      patient_name TEXT NOT NULL,
      patient_phone TEXT NOT NULL,
      stars INTEGER NOT NULL,
      comment TEXT,
      status TEXT DEFAULT 'pending',
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

async function searchMedicines(query, category = 'medicine') {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const { rows } = await pool.query(
    `SELECT * FROM medicines
     WHERE category = $2
       AND (LOWER(name) LIKE $1
        OR LOWER(COALESCE(generic_name, '')) LIKE $1
        OR EXISTS (SELECT 1 FROM unnest(alt_names) a WHERE LOWER(a) LIKE $1))`,
    [`%${q}%`, category]
  );
  return rows;
}

// إضافة دواء للقائمة العامة، بشكل آمن ضد التكرار.
// لو كان الاسم + التصنيف موجودين أصلاً، ما بينضاف صف جديد إطلاقاً، وبترجع الدالة الدواء
// الموجود بهدوء بدل ما ترمي خطأ — هيك المستخدم ما بيشوف رسالة خطأ سيرفر قبيحة، والنتيجة
// النهائية صحيحة بكل الحالات (نسخة واحدة فقط بالقائمة العامة).
async function addMedicine({ name, generic_name, alt_names, category }) {
  const finalCategory = category || 'medicine';
  try {
    const { rows } = await pool.query(
      `INSERT INTO medicines (name, generic_name, alt_names, category)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name, category) DO NOTHING
       RETURNING *`,
      [name, generic_name || null, alt_names || [], finalCategory]
    );
    if (rows[0]) return rows[0];
    // ما رجع أي صف = القاعدة رفضت الإضافة لأن الدواء موجود مسبقاً → نجيب الموجود ونرجّعه
    return await findMedicineByExactName(name, finalCategory);
  } catch (err) {
    // 42P10 = الفهرس الفريد غير موجود بقاعدة البيانات (حالة نادرة: فشل إنشاؤه بسبب مكررات قديمة).
    // بهذه الحالة فقط نرجع للسلوك القديم (فحص يدوي ثم إضافة) حتى يبقى الموقع شغالاً.
    if (err.code !== '42P10') throw err;
    const existing = await findMedicineByExactName(name, finalCategory);
    if (existing) return existing;
    const { rows } = await pool.query(
      'INSERT INTO medicines (name, generic_name, alt_names, category) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, generic_name || null, alt_names || [], finalCategory]
    );
    return rows[0];
  }
}

async function findMedicineByExactName(name, category) {
  const { rows } = await pool.query(
    'SELECT * FROM medicines WHERE name = $1 AND category = $2 LIMIT 1',
    [name, category]
  );
  return rows[0] || null;
}

async function getAllMedicines() {
  const { rows } = await pool.query('SELECT * FROM medicines ORDER BY id');
  return rows;
}

async function suggestMedicines(query, category = 'medicine') {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const allMedicines = await getAllMedicines();
  const medicines = allMedicines.filter(m => m.category === category);
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
    'SELECT id, name, address, phone, assistant_phone, city, owner_username, on_duty, on_duty_day, on_duty_shift, on_duty_start_time, on_duty_end_time FROM pharmacies ORDER BY id'
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

async function addPharmacy({ name, address, phone, city, username, passwordHash }) {
  const { rows } = await pool.query(
    `INSERT INTO pharmacies (name, address, phone, city, owner_username, owner_password_hash)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name, address || null, phone || null, city || null, username, passwordHash]
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

async function setAssistantPhone(pharmacyId, assistantPhone) {
  const { rows } = await pool.query(
    `UPDATE pharmacies SET assistant_phone = $1 WHERE id = $2 RETURNING *`,
    [assistantPhone || null, pharmacyId]
  );
  return rows[0];
}

// تعديل اسم الصيدلية (الإدارة حصراً — يُستدعى من مسار محمي بـadminAuth).
// عمداً لا يمس owner_username ولا owner_password_hash ولا أي بيانات أخرى: تغيير الاسم
// تصحيح لواجهة العرض فقط، وليس نقل ملكية. لو تغيّر مالك الصيدلية فعلياً، الإجراء
// الصحيح هو حذف الصيدلية وتسجيل واحدة جديدة، حتى لا يرث المالك الجديد بيانات غيره.
async function setPharmacyName(pharmacyId, name) {
  const { rows } = await pool.query(
    `UPDATE pharmacies SET name = $1 WHERE id = $2 RETURNING *`,
    [name, pharmacyId]
  );
  return rows[0];
}

// ---------- إحصاءات لوحة الإدارة ----------
// كل الأرقام محسوبة من البيانات المخزّنة أصلاً — صفر جدول تتبّع جديد وصفر نمو بالتخزين.
// النوافذ الزمنية متدحرجة (آخر 24 ساعة / 7 أيام) وليست تقويمية عن قصد: خادم Render
// يعمل بتوقيت UTC، فـ"اليوم" كان سيعني يوماً مختلفاً عن يوم المستخدم في سوريا.
async function getAdminStats() {
  const totalsQ = pool.query(`
    SELECT
      (SELECT COUNT(*) FROM pharmacies)::int AS pharmacies,
      (SELECT COUNT(*) FROM pharmacies WHERE on_duty = true)::int AS pharmacies_on_duty,
      (SELECT COUNT(*) FROM medicines WHERE category = 'medicine')::int AS medicines,
      (SELECT COUNT(*) FROM medicines WHERE category = 'cosmetic')::int AS cosmetics,
      (SELECT COUNT(*) FROM nurses)::int AS nurses,
      (SELECT COUNT(*) FROM stock WHERE available = true)::int AS available_stock,
      (SELECT COUNT(*) FROM orders)::int AS orders_total,
      (SELECT COUNT(*) FROM orders WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS orders_24h,
      (SELECT COUNT(*) FROM orders WHERE created_at >= NOW() - INTERVAL '7 days')::int AS orders_7d,
      (SELECT COUNT(*) FROM orders WHERE created_at >= NOW() - INTERVAL '30 days')::int AS orders_30d
  `);

  // أكثر الأدوية طلباً: تُستخرج من مصفوفة items بكل طلب (JSONB).
  // COALESCE يحمي من صف قديم قيمته NULL قبل أن يصبح للعمود قيمة افتراضية.
  const topMedicinesQ = pool.query(`
    SELECT item->>'medicineName' AS name, COUNT(*)::int AS count
    FROM orders, jsonb_array_elements(COALESCE(items, '[]'::jsonb)) AS item
    WHERE item->>'medicineName' IS NOT NULL AND item->>'medicineName' <> ''
    GROUP BY 1 ORDER BY count DESC, name ASC LIMIT 5
  `);

  // أنشط الصيدليات. LEFT JOIN مقصود: صيدلية بصفر طلبات تظهر بصفر، لا تختفي.
  const topPharmaciesQ = pool.query(`
    SELECT p.id, p.name, p.city, COUNT(o.id)::int AS orders_count
    FROM pharmacies p LEFT JOIN orders o ON o.pharmacy_id = p.id
    GROUP BY p.id, p.name, p.city
    ORDER BY orders_count DESC, p.name ASC LIMIT 5
  `);

  const byCityQ = pool.query(`
    SELECT city, COUNT(*)::int AS count
    FROM pharmacies WHERE city IS NOT NULL
    GROUP BY city ORDER BY count DESC, city ASC
  `);

  const [totals, topMedicines, topPharmacies, byCity] =
    await Promise.all([totalsQ, topMedicinesQ, topPharmaciesQ, byCityQ]);

  return {
    totals: totals.rows[0],
    topMedicines: topMedicines.rows,
    topPharmacies: topPharmacies.rows,
    byCity: byCity.rows
  };
}

async function getOnDutyPharmacies(city) {
  const { rows } = await pool.query(
    `SELECT id, name, address, phone, assistant_phone, city, on_duty, on_duty_day, on_duty_shift, on_duty_start_time, on_duty_end_time
     FROM pharmacies WHERE on_duty = true AND ($1::text IS NULL OR city = $1) ORDER BY on_duty_shift, id`,
    [city || null]
  );
  return rows;
}

// ---------- المخزون ----------

// city اختياري: لو مُرِّر، تُعاد صيدليات تلك المدينة فقط. لو كان null أو غير مُمرَّر،
// يبقى السلوك كما كان تماماً (كل الصيدليات) — صفر تأثير على أي استدعاء قديم.
async function getAvailability(medicineId, city) {
  const { rows } = await pool.query(
    `SELECT p.id AS pharmacy_id, p.name AS pharmacy_name, p.address, p.phone, p.assistant_phone, p.city,
            COALESCE(s.available, false) AS available
     FROM pharmacies p
     LEFT JOIN stock s ON s.pharmacy_id = p.id AND s.medicine_id = $1
     WHERE ($2::text IS NULL OR p.city = $2)
     ORDER BY p.name`,
    [medicineId, city || null]
  );
  return rows;
}

async function getStockForPharmacy(pharmacyId) {
  const { rows } = await pool.query(
    `SELECT m.id AS medicine_id, m.name, m.generic_name, m.category,
            COALESCE(s.available, false) AS available,
            s.manufacture_date, s.expiry_date
     FROM medicines m
     LEFT JOIN stock s ON s.medicine_id = m.id AND s.pharmacy_id = $1
     ORDER BY m.name`,
    [pharmacyId]
  );
  return rows;
}

async function setStock(pharmacyId, medicineId, available, manufactureDate, expiryDate) {
  const mfgProvided = manufactureDate !== undefined;
  const expProvided = expiryDate !== undefined;
  await pool.query(
    `INSERT INTO stock (pharmacy_id, medicine_id, available, manufacture_date, expiry_date)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (pharmacy_id, medicine_id) DO UPDATE SET
       available = $3,
       manufacture_date = CASE WHEN $6 THEN $4 ELSE stock.manufacture_date END,
       expiry_date = CASE WHEN $7 THEN $5 ELSE stock.expiry_date END`,
    [pharmacyId, medicineId, !!available, manufactureDate || null, expiryDate || null, mfgProvided, expProvided]
  );
}

// ---------- الطلبات ----------

async function createOrder(pharmacyId, patientName, patientPhone, items, notes) {
  const { rows } = await pool.query(
    `INSERT INTO orders (pharmacy_id, patient_name, patient_phone, items, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [pharmacyId, patientName, patientPhone, JSON.stringify(items), notes || null]
  );
  return rows[0];
}

async function getOrdersForPharmacy(pharmacyId) {
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE pharmacy_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [pharmacyId]
  );
  return rows;
}

async function markOrderSeen(orderId) {
  await pool.query(`UPDATE orders SET seen = true WHERE id = $1 AND deleted_at IS NULL`, [orderId]);
}

// حذف ناعم: الصف يبقى للإحصاءات، وهوية المريض تُمحى فعلياً.
// ما يبقى (اسم الدواء، التاريخ، الصيدلية) لا يدل على شخص بعينه، فالنتيجة خصوصية
// أفضل من السابق: قبل هذا التغيير كان اسم المريض ورقمه يبقيان مخزَّنين ما دام
// الصيدلي لم يحذف الطلب — أي شهوراً أحياناً.
// patient_name عمود NOT NULL، فيُستبدل بنص ثابت بدل NULL حفاظاً على القيد.
async function deleteOrder(orderId) {
  await pool.query(
    `UPDATE orders
     SET deleted_at = NOW(), patient_name = '[محذوف]', patient_phone = '', notes = NULL
     WHERE id = $1 AND deleted_at IS NULL`,
    [orderId]
  );
}

async function confirmOrder(orderId) {
  await pool.query(`UPDATE orders SET status = 'confirmed' WHERE id = $1 AND deleted_at IS NULL`, [orderId]);
}

async function getOrdersStatus(ids) {
  const { rows } = await pool.query(
    `SELECT o.id, o.status, p.name AS pharmacy_name
     FROM orders o JOIN pharmacies p ON o.pharmacy_id = p.id
     WHERE o.id = ANY($1::int[]) AND o.deleted_at IS NULL`,
    [ids]
  );
  return rows;
}

// ---------- خدمات التمريض ----------

async function getAllNurses() {
  const { rows } = await pool.query('SELECT * FROM nurses ORDER BY id');
  return rows;
}

async function getNursesWithRatings() {
  const { rows } = await pool.query(`
    SELECT n.*,
           COALESCE(AVG(r.stars) FILTER (WHERE r.status = 'approved'), 0)::float AS avg_rating,
           COUNT(r.id) FILTER (WHERE r.status = 'approved')::int AS rating_count
    FROM nurses n
    LEFT JOIN nurse_ratings r ON r.nurse_id = n.id
    GROUP BY n.id
    ORDER BY n.id
  `);
  return rows;
}

async function addNurse({ name, specialty, university, graduation_year, phone }) {
  const { rows } = await pool.query(
    `INSERT INTO nurses (name, specialty, university, graduation_year, phone)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, specialty || null, university || null, graduation_year || null, phone || null]
  );
  return rows[0];
}

async function deleteNurse(nurseId) {
  await pool.query('DELETE FROM nurses WHERE id = $1', [nurseId]);
}

async function setNurseAvailability(nurseId, available) {
  const { rows } = await pool.query(
    'UPDATE nurses SET available = $1 WHERE id = $2 RETURNING *',
    [!!available, nurseId]
  );
  return rows[0];
}

// التقييمات الموافق عليها بس لممرض معين (تظهر للعموم بالتفاصيل)
// ملاحظة: patient_name مقصود حذفه من هون تحديداً — الواجهة الأمامية العامة ما بتستخدمه إطلاقاً
// (بتعرض بس النجوم والتعليق)، فما في داعي يترجع أصلاً بنقطة API عامة بلا مصادقة (تقليل البيانات
// المُصدَّرة للحد الأدنى). لوحة الإدارة (getPendingRatings/getApprovedRatings) غير متأثرة إطلاقاً
// وتضل ترجع كل الأعمدة (بما فيها patient_name وpatient_phone) لأنها محمية بـadminAuth ومحتاجتهم فعلياً
async function getApprovedRatingsForNurse(nurseId) {
  const { rows } = await pool.query(
    `SELECT id, stars, comment, created_at
     FROM nurse_ratings
     WHERE nurse_id = $1 AND status = 'approved'
     ORDER BY created_at DESC`,
    [nurseId]
  );
  return rows;
}

async function addNurseRating({ nurse_id, patient_name, patient_phone, stars, comment }) {
  const { rows } = await pool.query(
    `INSERT INTO nurse_ratings (nurse_id, patient_name, patient_phone, stars, comment)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [nurse_id, patient_name, patient_phone, stars, comment || null]
  );
  return rows[0];
}

async function getPendingRatings() {
  const { rows } = await pool.query(
    `SELECT r.*, n.name AS nurse_name
     FROM nurse_ratings r JOIN nurses n ON n.id = r.nurse_id
     WHERE r.status = 'pending'
     ORDER BY r.created_at ASC`
  );
  return rows;
}

async function getApprovedRatings() {
  const { rows } = await pool.query(
    `SELECT r.*, n.name AS nurse_name
     FROM nurse_ratings r JOIN nurses n ON n.id = r.nurse_id
     WHERE r.status = 'approved'
     ORDER BY r.created_at DESC`
  );
  return rows;
}

async function approveRating(ratingId) {
  await pool.query(`UPDATE nurse_ratings SET status = 'approved' WHERE id = $1`, [ratingId]);
}

async function rejectRating(ratingId) {
  await pool.query('DELETE FROM nurse_ratings WHERE id = $1', [ratingId]);
}

module.exports = {
  pool,
  initDb,
  searchMedicines,
  addMedicine,
  findMedicineByExactName,
  getAllMedicines,
  suggestMedicines,
  deleteMedicine,
  getAllPharmacies,
  findPharmacyByUsername,
  getPharmacyById,
  addPharmacy,
  deletePharmacy,
  setDutyStatus,
  setAssistantPhone,
  setPharmacyName,
  getAdminStats,
  getOnDutyPharmacies,
  getAvailability,
  getStockForPharmacy,
  setStock,
  createOrder,
  getOrdersForPharmacy,
  markOrderSeen,
  deleteOrder,
  confirmOrder,
  getOrdersStatus,
  getAllNurses,
  getNursesWithRatings,
  addNurse,
  deleteNurse,
  setNurseAvailability,
  getApprovedRatingsForNurse,
  addNurseRating,
  getPendingRatings,
  getApprovedRatings,
  approveRating,
  rejectRating
};
