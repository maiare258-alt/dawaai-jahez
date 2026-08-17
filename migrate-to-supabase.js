// سكريبت مؤقت لمرة واحدة: ينسخ كل البيانات من قاعدة Render القديمة (DATABASE_URL)
// إلى قاعدة Supabase الجديدة (SUPABASE_DATABASE_URL)، مع الحفاظ على نفس المعرّفات (IDs)
// عشان تضل العلاقات بين الجداول (مثل ربط المخزون بالصيدلية والدواء) سليمة تماماً.
//
// ⚠️ يُحذف هذا الملف والمسار المرتبط فيه بعد إتمام النقل بنجاح والتأكد منه.

const { Pool } = require('pg');
const oldPool = require('./db').pool; // القاعدة القديمة (نفس الاتصال الحالي للموقع)

async function runMigration() {
  if (!process.env.SUPABASE_DATABASE_URL) {
    throw new Error('متغيّر SUPABASE_DATABASE_URL غير موجود بإعدادات Render');
  }

  const newPool = new Pool({
    connectionString: process.env.SUPABASE_DATABASE_URL,
    ssl: process.env.SUPABASE_DATABASE_URL.includes('localhost')
      ? false
      : { rejectUnauthorized: false }
  });

  try {
    // 1) إنشاء نفس بنية الجداول بالقاعدة الجديدة (نفس تعريف db.js بالضبط)
    await newPool.query(`
      CREATE TABLE IF NOT EXISTS medicines (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        generic_name TEXT,
        alt_names TEXT[] DEFAULT '{}',
        category TEXT DEFAULT 'medicine'
      );
    `);
    await newPool.query(`
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
    await newPool.query(`
      CREATE TABLE IF NOT EXISTS stock (
        pharmacy_id INTEGER REFERENCES pharmacies(id) ON DELETE CASCADE,
        medicine_id INTEGER REFERENCES medicines(id) ON DELETE CASCADE,
        available BOOLEAN DEFAULT false,
        PRIMARY KEY (pharmacy_id, medicine_id)
      );
    `);
    await newPool.query(`
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
    await newPool.query(`
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
    await newPool.query(`
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

    const summary = {};

    // 2) نسخ البيانات بترتيب يحترم العلاقات (الجداول المستقلة أولاً، ثم المرتبطة فيها)
    async function copyTable(tableName, columns) {
      const { rows } = await oldPool.query(`SELECT ${columns.join(', ')} FROM ${tableName}`);
      let count = 0;
      for (const row of rows) {
        // عمود items بجدول orders من نوع JSONB — الـpg بيرجعه ككائن JS جاهز عند القراءة،
        // لازم نحوّله لنص JSON صريح قبل الإدراج عشان يترجم صح بالقاعدة الجديدة
        const values = columns.map(c => (c === 'items' ? JSON.stringify(row[c]) : row[c]));
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        await newPool.query(
          `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values
        );
        count++;
      }
      summary[tableName] = count;
      // إعادة ضبط عدّاد المعرّف التلقائي (لو الجدول فيه عمود id) عشان الإضافات الجديدة بعد النقل ما تتصادم
      if (columns.includes('id')) {
        await newPool.query(`SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), COALESCE((SELECT MAX(id) FROM ${tableName}), 1))`);
      }
    }

    await copyTable('medicines', ['id', 'name', 'generic_name', 'alt_names', 'category']);
    await copyTable('pharmacies', ['id', 'name', 'address', 'phone', 'owner_username', 'owner_password_hash', 'on_duty', 'on_duty_day', 'on_duty_shift', 'on_duty_start_time', 'on_duty_end_time']);
    await copyTable('stock', ['pharmacy_id', 'medicine_id', 'available']);
    await copyTable('orders', ['id', 'pharmacy_id', 'patient_name', 'patient_phone', 'items', 'seen', 'status', 'created_at']);
    await copyTable('nurses', ['id', 'name', 'specialty', 'university', 'graduation_year', 'phone', 'available']);
    await copyTable('nurse_ratings', ['id', 'nurse_id', 'patient_name', 'patient_phone', 'stars', 'comment', 'status', 'created_at']);

    return summary;
  } finally {
    await newPool.end();
  }
}

module.exports = runMigration;
