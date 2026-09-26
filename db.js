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
  // شارة التوثيق: كل صيدلية على المنصة سجّلتها الإدارة يدوياً بعد تحقق بشري، لا تسجيل ذاتي.
  // العمود يجعل هذه الحقيقة قابلة للعرض للمريض، ويترك الباب مفتوحاً لسحب التوثيق
  // من صيدلية بعينها مستقبلاً دون حذف حسابها.
  await pool.query(`ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT true;`);

  // رقم واتساب الصيدلية — عمود منفصل عن phone عن قصد وليس اختصاراً كسولاً:
  // كثير من الصيدليات السورية تسجّل رقماً أرضياً لا واتساب له، ورابط wa.me على رقم
  // أرضي يفتح واتساب برسالة "هذا الرقم غير مسجّل" — فيقرأها المريض كعطل في المنصة
  // لا كخطأ في الرقم. بعمود منفصل يظهر زر واتساب فقط لمن أدخل رقماً فعلياً،
  // فلا يوجد رابط ميت إطلاقاً. يُخزَّن بصيغة دولية منسّقة (مثال: 963932985852).
  await pool.query(`ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;`);

  // إحداثيات الصيدلية على الخريطة — تُمكّن زر "الاتجاهات" الذي يفتح ملاحة جوجل للمريض.
  // DOUBLE PRECISION لا NUMERIC: الحسابات الجغرافية عشرية بطبعها، والدقة أكثر من كافية
  // (ست خانات عشرية ≈ 11 سم على الأرض).
  // العمودان اختياريان: صيدلية بلا موقع تبقى تعمل بالكامل، ولا يظهر لها زر اتجاهات
  // بدل أن يظهر زر يقود المريض إلى لا مكان — نفس مبدأ زر واتساب.
  // هل تُحدّث هذه الصيدلية مخزونها على المنصة؟
  //
  // السبب: getAvailability تستخدم LEFT JOIN على كل الصيدليات مع COALESCE(available,false)،
  // فصيدلية بلا سجل مخزون كانت تظهر "غير متوفر" — وهذا ادعاء خبري كاذب عن صيدلية
  // لم تُسأل أصلاً: يضلّل المريض فيتجاوز صيدلية عندها دواؤه، ويضر بسمعة الصيدلية.
  // بهذا العمود نفرّق بين "سألناها فقالت لا" و"لم نسألها".
  //
  // التعبئة الخلفية على ثلاث خطوات مقصودة: نضيف العمود بلا افتراضي أولاً فتبقى
  // السجلات القديمة NULL، ثم نجعلها true (فهي صيدليات كاملة أُضيفت قبل هذا التقسيم)،
  // ثم نثبّت الافتراضي false للسجلات الجديدة — لأن الإدراج للمناوبة فقط هو الحالة
  // الأكثر توقعاً عند إضافة صيدليات المدينة دفعة واحدة، والخطأ الآمن هو عدم الادعاء.
  // تتبّع آخر تعديل للمناوبة: من عدّل ومتى.
  // السبب: المناوبة صار يضبطها طرفان — الصيدلي من لوحته والإدارة من لوحتها.
  // فبدون هذا السجل لا يمكن الإجابة على "لماذا تغيّرت هذه المناوبة؟"، وقد تدهس
  // الإدارة تعديلاً حديثاً للصيدلي دون أن تدري أنه يدير مناوبته بنفسه.
  // NULL للسجلات القديمة عمداً: لا نعرف من عدّلها، وادعاء ذلك تضليل.
  await pool.query(`ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS duty_updated_by TEXT;`);
  await pool.query(`ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS duty_updated_at TIMESTAMP;`);

  await pool.query(`ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS manages_stock BOOLEAN;`);
  await pool.query(`UPDATE pharmacies SET manages_stock = true WHERE manages_stock IS NULL;`);
  await pool.query(`ALTER TABLE pharmacies ALTER COLUMN manages_stock SET DEFAULT false;`);

  // ساعات دوام الصيدلية.
  //
  // الحاجة: مريض يبحث ليلاً فيرى "متوفر"، فيرسل طلباً لا يأتيه رد عليه، ثم يتصل
  // بالصيدلي في ساعة متأخرة فيزعجه. والحل ليس زراً يوميّاً للفتح والإغلاق، لأنه
  // يفترض أن الصيدلي سيضغطه مرتين كل يوم طوال السنة، وأول ليلة ينساها تعيد
  // المشكلة أسوأ مما كانت، إذ يثق المريض بعلامة "مفتوحة" الظاهرة أمامه.
  //
  // لذلك نخزّن ساعات الدوام مرة واحدة ونحسب الحالة آلياً، ونضيف تجاوزاً يدويّاً
  // للطوارئ يعود تلقائياً إلى الجدول في اليوم التالي.
  //
  // TEXT بصيغة "HH:MM" لا TIME: نفس نمط on_duty_start_time القائم، ويتجنّب
  // التباس المناطق الزمنية عند التخزين لأن الوقت محلي لا لحظة زمنية مطلقة.
  await pool.query(`ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS opens_at TEXT;`);
  await pool.query(`ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS closes_at TEXT;`);

  // تجاوز يدوي مؤقت: التاريخ الذي أعلن فيه الصيدلي إغلاقاً استثنائياً بصيغة
  // "YYYY-MM-DD" بتوقيت دمشق. يُقارَن بتاريخ اليوم، فيسقط أثره تلقائياً غداً
  // دون أي إجراء من الصيدلي.
  await pool.query(`ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS closed_override_date TEXT;`);

  await pool.query(`ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;`);
  await pool.query(`ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;`);
  await pool.query(`UPDATE pharmacies SET verified = true WHERE verified IS NULL;`);

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
  // ⚠️ يجب أن يبقى بعد CREATE TABLE stock: كان قبله فيتعطل الإقلاع على قاعدة جديدة.
  // وقت آخر تحديث للمخزون — أهم عمود لثقة المريض.
  // بدونه يرى "متوفر" دون أن يعرف إن كانت المعلومة عمرها ساعة أم شهر.
  // يبقى NULL للسجلات القديمة عمداً: لا نعرف متى حُدّثت فعلاً، وادعاء وقت لم يحدث
  // أسوأ من عدم عرض شيء. تُملأ تلقائياً عند أول تحديث يقوم به الصيدلي.
  await pool.query(`ALTER TABLE stock ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;`);

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

  // ⚠️ يجب أن يبقى بعد CREATE TABLE orders، وإلا تعطل الإقلاع على قاعدة جديدة.
  // مفتاح تفرّد لكل محاولة إرسال طلب، يمنع تكرار الطلب عند الفشل الملتبس.
  //
  // المشكلة: المريض يرسل الطلب فيصل الخادم ويُحفظ، ثم يضيع الرد في الطريق
  // (انقطاع لحظي، شائع على الشبكة المحمولة). يرى "تعذّر الاتصال" فيظن الطلب فشل،
  // والسلة باقية، فيرسل مجدداً — فيتلقى الصيدلي طلبين متطابقين.
  //
  // الحل: الواجهة ترسل مفتاحاً ثابتاً لكل سلة، ويعيده المريض مع كل إعادة محاولة.
  // الفهرس الفريد على (المفتاح، الصيدلية) يضمن طلباً واحداً لكل صيدلية لكل سلة،
  // حتى لو وصل طلبان في اللحظة ذاتها — فالضمان في القاعدة لا في منطق التطبيق.
  //
  // جزئي (WHERE request_key IS NOT NULL) عن قصد: الطلبات القديمة بلا مفتاح،
  // وبدون الشرط لتصادمت فيما بينها.
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS request_key TEXT;`);
  try {
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS orders_request_key_pharmacy
                      ON orders (request_key, pharmacy_id) WHERE request_key IS NOT NULL;`);
  } catch (err) {
    // فشل إنشاء الفهرس يجب ألا يوقف الإقلاع؛ الطلبات تعمل بدونه وإن فقدت الحماية
    console.error('تعذّر إنشاء فهرس تفرّد الطلبات (لا يمنع الإقلاع):', err.message);
  }

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

  // سجل البحث المجهَّل — أساس "خريطة الطلب" لشركات الأدوية.
  //
  // ما لا يُخزَّن عمداً: عنوان IP، ومتصفح المستخدم، وأي معرّف جلسة أو حساب.
  // والوقت مقرَّب إلى الساعة، فلا يمكن ربط سطر ببحث شخص بعينه حتى لو قورن بسجلات
  // الخادم. النتيجة (وُجد، متوفر...) يحسبها الخادم بنفسه ولا يثق بما ترسله الواجهة،
  // فلا يستطيع أحد تزييف إشارة "نقص" بإرسال بيانات مصطنعة.
  //
  // ⚠️ بعد إنشاء جدول medicines: المفتاح الأجنبي يشير إليه.
  // ON DELETE SET NULL: حذف دواء من القائمة لا يمحو تاريخ الطلب عليه.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS search_log (
      id SERIAL PRIMARY KEY,
      query_norm TEXT NOT NULL,
      category TEXT NOT NULL,
      city TEXT,
      matched_count INTEGER NOT NULL DEFAULT 0,
      top_medicine_id INTEGER REFERENCES medicines(id) ON DELETE SET NULL,
      any_tracked BOOLEAN NOT NULL DEFAULT false,
      any_available BOOLEAN NOT NULL DEFAULT false,
      created_hour TIMESTAMP NOT NULL DEFAULT date_trunc('hour', NOW())
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS search_log_created ON search_log (created_hour);`);

  // إعدادات عامة للمنصة بصيغة مفتاح وقيمة. أول استخدام: تاريخ الإطلاق الرسمي.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // حماية RLS للجدولين الأحدث، لتبقى الجداول كلها على المستوى نفسه.
  // كانت تُفعَّل يدوياً من لوحة Supabase، فلا تُطبَّق عند الاسترجاع إلى قاعدة جديدة.
  // آمنة للتكرار (تفعيلها مرة ثانية لا يفعل شيئاً)، والخادم يتصل بصفته مالك الجداول
  // فلا تقيّده. ملفوفة بـtry/catch: فشلها لا يمنع الإقلاع أبداً.
  for (const table of ['search_log', 'app_settings']) {
    try {
      await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    } catch (err) {
      console.error(`تعذّر تفعيل RLS على ${table} (لا يمنع الإقلاع):`, err.message);
    }
  }

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

  // ⚠️ في آخر initDb عن قصد: يمس جداول الصيدليات والممرضين والأدوية، فيجب أن
  // تكون كلها منشأة قبله. كان قبل جدول الممرضين فيتخطاه بصمت على قاعدة جديدة.
  // تنظيف لمرة واحدة للمسافات الزائدة في البيانات المحفوظة سابقاً.
  //
  // آمن للتكرار: الشرط WHERE يطابق فقط ما لم يُنظَّف بعد، فتشغيله مع كل إقلاع
  // لا يمس شيئاً بعد المرة الأولى.
  //
  // ⚠️ استثنينا medicines.name عمداً: عليه فهرس فريد (name, category)، فلو وُجد
  // "بنادول" و"بنادول " معاً لأدى التنظيف إلى تصادم يُفشل التحديث.
  //
  // ⚠️ ملفوف بـtry/catch: فشل التنظيف يجب ألا يمنع الخادم من الإقلاع أبداً.
  // موقع يعمل ببيانات فيها مسافة زائدة أفضل بكثير من موقع متوقف.
  try {
    const norm = col => `btrim(regexp_replace(${col}, '\\s+', ' ', 'g'))`;
    const dirty = col => `${col} IS NOT NULL AND ${col} <> ${norm(col)}`;
    await pool.query(`UPDATE pharmacies SET name = ${norm('name')} WHERE ${dirty('name')};`);
    await pool.query(`UPDATE pharmacies SET address = ${norm('address')} WHERE ${dirty('address')};`);
    await pool.query(`UPDATE nurses SET name = ${norm('name')} WHERE ${dirty('name')};`);
    await pool.query(`UPDATE nurses SET specialty = ${norm('specialty')} WHERE ${dirty('specialty')};`);
    await pool.query(`UPDATE nurses SET university = ${norm('university')} WHERE ${dirty('university')};`);
    await pool.query(`UPDATE medicines SET generic_name = ${norm('generic_name')} WHERE ${dirty('generic_name')};`);
  } catch (err) {
    console.error('تعذّر تنظيف المسافات الزائدة (لا يمنع الإقلاع):', err.message);
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
async function addMedicine({ name: rawName, generic_name: rawGeneric, alt_names, category }) {
  const finalCategory = category || 'medicine';
  // تنظيف الاسم يمنع أيضاً تكراراً خفياً: "بنادول " كان سيُحفظ دواءً مستقلاً عن
  // "بنادول" لأن الفهرس الفريد يقارن النص حرفياً. بعد التنظيف يلتقطه ON CONFLICT.
  const name = cleanText(rawName);
  const generic_name = cleanText(rawGeneric);
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
    'SELECT id, name, address, phone, assistant_phone, city, whatsapp_phone, latitude, longitude, verified, manages_stock, opens_at, closes_at, closed_override_date, duty_updated_by, duty_updated_at, owner_username, on_duty, on_duty_day, on_duty_shift, on_duty_start_time, on_duty_end_time FROM pharmacies ORDER BY id'
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

// تنظيف الحقول النصية القصيرة قبل الحفظ: قصّ المسافات من الطرفين، وتوحيد
// المسافات المتتالية الداخلية إلى مسافة واحدة.
//
// السبب: كانت حقول مثل "سلميه " و"نصر باسل عفاره " تُحفظ بمسافة زائدة بعد آخر
// كلمة. لا تُرى بالعين لكنها تُفشل المطابقة (بحث عن "سلميه" لا يطابق "سلميه ")
// وتُنتج تباعداً غير متناسق في العرض.
//
// نطبّقها هنا في طبقة القاعدة لا في المسارات، فتشمل كل طريق حفظ مهما كان مصدره.
//
// ⚠️ للحقول ذات السطر الواحد فقط (أسماء، عناوين، تخصصات). لا تُطبَّق على
// الملاحظات والتعليقات، لأن توحيد المسافات يمحو أسطرها الجديدة.
// ولا على كلمات المرور وأسماء المستخدمين، فلها تحققها الخاص.
function cleanText(v) {
  if (typeof v !== 'string') return v;
  const cleaned = v.replace(/\s+/g, ' ').trim();
  return cleaned === '' ? null : cleaned;
}

async function addPharmacy({ name, address, phone, city, whatsappPhone, managesStock, username, passwordHash }) {
  const { rows } = await pool.query(
    `INSERT INTO pharmacies (name, address, phone, city, whatsapp_phone, manages_stock, owner_username, owner_password_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [cleanText(name), cleanText(address), cleanText(phone), city || null, whatsappPhone || null, !!managesStock, username, passwordHash]
  );
  return rows[0];
}

async function deletePharmacy(pharmacyId) {
  await pool.query('DELETE FROM pharmacies WHERE id = $1', [pharmacyId]);
}

// updatedBy: 'pharmacy' أو 'admin' — يُمرَّر من طبقة المسارات حيث تُعرف الهوية
// بيقين من المصادقة نفسها، لا من جسم الطلب الذي يمكن تزويره.
async function setDutyStatus(pharmacyId, onDuty, day, shift, startTime, endTime, updatedBy) {
  const { rows } = await pool.query(
    `UPDATE pharmacies
     SET on_duty = $1, on_duty_day = $2, on_duty_shift = $3, on_duty_start_time = $4, on_duty_end_time = $5,
         duty_updated_by = $6, duty_updated_at = NOW()
     WHERE id = $7 RETURNING *`,
    [
      !!onDuty,
      onDuty ? (day || null) : null,
      onDuty ? (shift || 'طوال اليوم') : null,
      onDuty ? (startTime || null) : null,
      onDuty ? (endTime || null) : null,
      updatedBy === 'admin' ? 'admin' : 'pharmacy',
      pharmacyId
    ]
  );
  return rows[0];
}

// إيقاف كل المناوبات دفعة واحدة — لبدء أسبوع جديد بنقرة بدل عشرات النقرات.
// نُفرغ حقول المناوبة كلها لا العلم فقط، حتى لا تبقى بيانات أسبوع ماضٍ معلّقة
// فتظهر للمريض لو أُعيد التفعيل دون إدخال يوم جديد.
// نرجّع عدد الصفوف المتأثرة فعلاً ليعرف المدير ماذا تغيّر بالضبط.
async function clearAllDuty() {
  const { rowCount } = await pool.query(
    `UPDATE pharmacies
     SET on_duty = false, on_duty_day = NULL, on_duty_shift = NULL,
         on_duty_start_time = NULL, on_duty_end_time = NULL,
         duty_updated_by = 'admin', duty_updated_at = NOW()
     WHERE on_duty = true`
  );
  return rowCount;
}

// تحديث رقم واتساب الصيدلية. يستقبل الرقم منسّقاً مسبقاً من طبقة المسارات
// (normalizeWhatsappPhone) حتى يبقى التنسيق في مكان واحد ولا يدخل القاعدة رقم تالف.
// الصيدليات التي لديها رقم واتساب — لقائمة الاستشارة الدوائية بالصفحة الرئيسية.
// نُرجع الحقول العامة فقط: صفر كلمات مرور، صفر أسماء مستخدمين.
// city اختياري: يسمح للمريض بحصر القائمة بمدينته.
async function getWhatsappPharmacies(city) {
  const { rows } = await pool.query(
    `SELECT id, name, address, city, whatsapp_phone, COALESCE(verified, false) AS verified,
            COALESCE(on_duty, false) AS on_duty
     FROM pharmacies
     WHERE whatsapp_phone IS NOT NULL AND whatsapp_phone <> ''
       AND ($1::text IS NULL OR city = $1)
     ORDER BY on_duty DESC, name`,
    [city || null]
  );
  return rows;
}

// حفظ إحداثيات الصيدلية. تستقبل القيم مُتحقَّقاً منها ومقرَّبة من طبقة المسارات،
// فلا يدخل القاعدة رقم تالف. تمرير null للاثنين يمسح الموقع — إجراء مشروع.
// نحفظهما معاً دائماً: إحداثي واحد بلا الآخر بلا معنى، وقد يُنتج زراً معطوباً.
// تبديل حالة "تُحدّث مخزونها" — للإدارة فقط
async function setManagesStock(pharmacyId, managesStock) {
  const { rows } = await pool.query(
    `UPDATE pharmacies SET manages_stock = $1 WHERE id = $2
     RETURNING id, name, manages_stock`,
    [!!managesStock, pharmacyId]
  );
  return rows[0];
}

// حفظ ساعات الدوام. القيم مُتحقَّق منها في طبقة المسارات، وتمرير null للاثنين
// يمسح الجدول فتتوقف المنصة عن عرض أي حالة لهذه الصيدلية.
async function setPharmacyHours(pharmacyId, opensAt, closesAt) {
  const { rows } = await pool.query(
    `UPDATE pharmacies SET opens_at = $1, closes_at = $2 WHERE id = $3
     RETURNING id, name, opens_at, closes_at, closed_override_date`,
    [opensAt, closesAt, pharmacyId]
  );
  return rows[0];
}

// إعلان إغلاق استثنائي لليوم، أو التراجع عنه. التاريخ بتوقيت دمشق يُمرَّر
// من طبقة المسارات حيث يُحسب، فلا يعتمد على توقيت الخادم.
async function setClosedOverride(pharmacyId, dateOrNull) {
  const { rows } = await pool.query(
    `UPDATE pharmacies SET closed_override_date = $1 WHERE id = $2
     RETURNING id, name, opens_at, closes_at, closed_override_date`,
    [dateOrNull, pharmacyId]
  );
  return rows[0];
}

async function setPharmacyLocation(pharmacyId, latitude, longitude) {
  const { rows } = await pool.query(
    `UPDATE pharmacies SET latitude = $1, longitude = $2 WHERE id = $3
     RETURNING id, name, latitude, longitude`,
    [latitude, longitude, pharmacyId]
  );
  return rows[0];
}

async function setWhatsappPhone(pharmacyId, whatsappPhone) {
  const { rows } = await pool.query(
    `UPDATE pharmacies SET whatsapp_phone = $1 WHERE id = $2 RETURNING *`,
    [whatsappPhone || null, pharmacyId]
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
// تحديث هاش كلمة مرور الصيدلية. تستقبل الهاش جاهزاً لا الكلمة الصريحة، حتى تبقى
// عملية التشفير (bcrypt) في طبقة المسارات مكاناً واحداً، ولا تمر كلمة مرور صريحة
// عبر طبقة قاعدة البيانات إطلاقاً.
async function setPharmacyPassword(pharmacyId, passwordHash) {
  const { rows } = await pool.query(
    `UPDATE pharmacies SET owner_password_hash = $1 WHERE id = $2 RETURNING id, name`,
    [passwordHash, pharmacyId]
  );
  return rows[0];
}

// تغيير اسم المستخدم لحساب صيدلية.
// عمداً لا يمس كلمة المرور ولا المخزون ولا الطلبات ولا المناوبة: اسم الدخول
// وحده هو ما يتغير، فيستمر الصيدلي بالعمل بكلمة مروره نفسها.
//
// العمود عليه قيد UNIQUE، فمحاولة تعيين اسم محجوز تُطلق الخطأ 23505.
// نتحقق مسبقاً في طبقة المسارات لإعطاء رسالة مفهومة، ونلتقط الخطأ هنا أيضاً
// لأن التحقق المسبق لا يمنع تسجيل صيدلية أخرى بالاسم نفسه في اللحظة ذاتها.
async function setPharmacyUsername(pharmacyId, username) {
  try {
    const { rows } = await pool.query(
      `UPDATE pharmacies SET owner_username = $1 WHERE id = $2
       RETURNING id, name, owner_username`,
      [username, pharmacyId]
    );
    return { row: rows[0], duplicate: false };
  } catch (err) {
    if (err && err.code === '23505') return { row: null, duplicate: true };
    throw err;
  }
}

async function setPharmacyName(pharmacyId, name) {
  const { rows } = await pool.query(
    `UPDATE pharmacies SET name = $1 WHERE id = $2 RETURNING *`,
    [cleanText(name), pharmacyId]
  );
  return rows[0];
}

// ---------- إحصاءات لوحة الإدارة ----------
// كل الأرقام محسوبة من البيانات المخزّنة أصلاً — صفر جدول تتبّع جديد وصفر نمو بالتخزين.
// النوافذ الزمنية متدحرجة (آخر 24 ساعة / 7 أيام) وليست تقويمية عن قصد: خادم Render
// يعمل بتوقيت UTC، فـ"اليوم" كان سيعني يوماً مختلفاً عن يوم المستخدم في سوريا.
// فحص حيّ لاتصال قاعدة البيانات.
//
// السبب: كان /health يرجّع "ok" بلا شرط، فلو توقفت قاعدة البيانات لبقي يقول
// إن الموقع سليم — فتطمئن أداة المراقبة بينما الموقع معطّل تماماً. وهذا يُفرغ
// المراقبة من معناها.
//
// المهلة ضرورية: استعلام معلّق على قاعدة بطيئة يُبقي الطلب مفتوحاً إلى الأبد
// بدل أن يُبلغ عن الخلل، فأداة المراقبة ترى انتهاء مهلة غامضاً لا سبباً واضحاً.
async function ping(timeoutMs = 4000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('db ping timeout')), timeoutMs);
  });
  try {
    await Promise.race([pool.query('SELECT 1'), timeout]);
    return true;
  } finally {
    clearTimeout(timer);
  }
}

// تصدير كامل للبيانات، للنسخ الاحتياطي اليدوي.
//
// السبب: خطة Supabase المجانية بلا نسخ احتياطي تلقائي. فحذف عرضي أو خلل أو
// انتهاء خطة يعني ضياع كل الصيدليات والأدوية والطلبات بلا استرجاع.
//
// نُصدّر الجداول الستة كاملة بما فيها هاش كلمات المرور: بدونه يتعذّر استرجاع
// الحسابات ويلزم إعادة تعيين كلمة مرور كل صيدلية. الهاش ليس كلمة مرور، لكن
// الملف يبقى حساساً ويجب حفظه في مكان آمن.
async function exportAll() {
  const tables = ['pharmacies', 'medicines', 'stock', 'orders', 'nurses', 'nurse_ratings', 'search_log', 'app_settings'];
  const data = {};
  for (const table of tables) {
    // أسماء الجداول ثابتة في المصفوفة أعلاه ولا تأتي من المستخدم إطلاقاً،
    // فلا مجال لحقن SQL هنا رغم أن الاسم يُدمج نصياً.
    const { rows } = await pool.query(`SELECT * FROM ${table}`);
    data[table] = rows;
  }
  return {
    exported_at: new Date().toISOString(),
    schema_version: 1,
    counts: Object.fromEntries(tables.map(t => [t, data[t].length])),
    data
  };
}

// تطبيع نص البحث: حروف صغيرة، مسافة واحدة، وطول أقصى. يجمع "Panadol" و"panadol "
// في سطر واحد عند التجميع.
function normalizeQuery(q) {
  return String(q || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
}

// حماية إضافية للخصوصية: لو كتب أحدهم رقم هاتف أو بريداً في مربع البحث بالخطأ،
// لا يُسجَّل إطلاقاً. ستة أرقام متتالية أو أكثر (لاتينية أو عربية) أو علامة @.
function looksPersonal(q) {
  const digits = q.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  return /\d{6,}/.test(digits.replace(/[\s-]/g, '')) || q.includes('@');
}

// أفضل تطابق: الاسم أو الاسم البديل المطابق تماماً أولاً، ثم أقصر اسم يحوي النص.
// searchMedicines لا ترتّب نتائجها، فبدون هذا يُنسب البحث إلى دواء عشوائي من المطابقات.
function pickTopMatch(medicines, q) {
  if (!medicines.length) return null;
  const exact = medicines.find(m =>
    String(m.name || '').toLowerCase() === q ||
    (Array.isArray(m.alt_names) && m.alt_names.some(a => String(a).toLowerCase() === q)));
  if (exact) return exact;
  return [...medicines].sort((a, b) => String(a.name).length - String(b.name).length)[0];
}

// تسجيل بحث واحد. يُرجع true إن سُجِّل، وfalse إن رُفض لأسباب الخصوصية.
async function logSearch({ query, category, city }) {
  const q = normalizeQuery(query);
  if (q.length < 2 || looksPersonal(q)) return false;
  const medicines = await searchMedicines(q, category);
  const top = pickTopMatch(medicines, q);
  let anyTracked = false, anyAvailable = false;
  if (top) {
    // "النقص" لا يُحتسب إلا حيث توجد صيدلية تُحدِّث مخزونها: صيدلية المناوبة فقط لا
    // تعرف ما لديها، فعدم التوفر عندها ليس معلومة بل غياب معلومة.
    const avail = await getAvailability(top.id, city || null);
    anyTracked = avail.some(r => r.manages_stock);
    anyAvailable = avail.some(r => r.manages_stock && r.available);
  }
  await pool.query(
    `INSERT INTO search_log (query_norm, category, city, matched_count, top_medicine_id, any_tracked, any_available)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [q, category, city || null, medicines.length, top ? top.id : null, anyTracked, anyAvailable]
  );
  return true;
}

// تقرير الطلب المجمَّع لفترة (بالأيام). لا يحوي إلا أعداداً مجمّعة.
async function getDemandReport(days) {
  const since = `NOW() - ($1::int * INTERVAL '1 day')`;
  const total = await pool.query(`SELECT COUNT(*)::int AS n FROM search_log WHERE created_hour >= ${since}`, [days]);
  const topMeds = await pool.query(
    `SELECT m.name, m.category, COUNT(*)::int AS count
       FROM search_log l JOIN medicines m ON m.id = l.top_medicine_id
      WHERE l.created_hour >= ${since}
      GROUP BY m.id, m.name, m.category ORDER BY count DESC, m.name LIMIT 15`, [days]);
  // بحث بلا أي تطابق: دواء لا تعرفه المنصة أصلاً — فرصة لإضافته إلى القائمة
  const notFound = await pool.query(
    `SELECT query_norm AS query, COUNT(*)::int AS count
       FROM search_log WHERE created_hour >= ${since} AND matched_count = 0
      GROUP BY query_norm ORDER BY count DESC, query_norm LIMIT 15`, [days]);
  // إشارة النقص: الدواء معروف، وتوجد صيدليات تُحدِّث مخزونها، ولا واحدة لديها
  const shortages = await pool.query(
    `SELECT m.name, COUNT(*)::int AS count
       FROM search_log l JOIN medicines m ON m.id = l.top_medicine_id
      WHERE l.created_hour >= ${since} AND l.any_tracked = true AND l.any_available = false
      GROUP BY m.id, m.name ORDER BY count DESC, m.name LIMIT 15`, [days]);
  const byCity = await pool.query(
    `SELECT COALESCE(city, '') AS city, COUNT(*)::int AS count
       FROM search_log WHERE created_hour >= ${since}
      GROUP BY city ORDER BY count DESC`, [days]);
  return {
    days,
    total: total.rows[0].n,
    topMedicines: topMeds.rows,
    notFound: notFound.rows,
    shortages: shortages.rows,
    byCity: byCity.rows
  };
}

async function getSetting(key) {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows.length ? rows[0].value : null;
}

// بدء الإطلاق الرسمي: يمسح بيانات الاستخدام التجريبية ويسجّل تاريخ الإطلاق، مرة واحدة فقط.
//
// ما يُمسح: سجل البحث، والطلبات، وتقييمات الممرضين — أي ما ينتج عن الاستخدام.
// ما لا يُمس: الصيدليات، والأدوية، والمخزون، والممرضون — أي بنية المنصة نفسها.
//
// كله في معاملة واحدة: إما يُمسح كل شيء ويُسجَّل التاريخ، أو لا يتغير شيء إطلاقاً.
// ونبدأ بتسجيل التاريخ عمداً: المفتاح الأساسي يمنع تسجيله مرتين، فلو ضُغط الزر من
// جهازين في اللحظة ذاتها ينتظر الثاني الأول ثم يجد الإطلاق قد تم فيتراجع دون أي حذف.
async function launchReset() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const launchedAt = new Date().toISOString();
    const claimed = await client.query(
      `INSERT INTO app_settings (key, value) VALUES ('launched_at', $1)
       ON CONFLICT (key) DO NOTHING RETURNING value`, [launchedAt]);
    if (claimed.rows.length === 0) {
      await client.query('ROLLBACK');
      return { alreadyLaunched: true, launchedAt: await getSetting('launched_at') };
    }
    const searches = await client.query('DELETE FROM search_log');
    const orders = await client.query('DELETE FROM orders');
    const ratings = await client.query('DELETE FROM nurse_ratings');
    await client.query('COMMIT');
    return {
      alreadyLaunched: false,
      launchedAt,
      deleted: { searches: searches.rowCount, orders: orders.rowCount, ratings: ratings.rowCount }
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

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
    `SELECT id, name, address, phone, assistant_phone, city, whatsapp_phone, latitude, longitude,
            COALESCE(verified, false) AS verified, COALESCE(manages_stock, false) AS manages_stock,
            opens_at, closes_at, closed_override_date,
            on_duty, on_duty_day, on_duty_shift, on_duty_start_time, on_duty_end_time
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
            COALESCE(p.verified, false) AS verified, p.whatsapp_phone,
            p.latitude, p.longitude,
            COALESCE(p.manages_stock, false) AS manages_stock,
            p.opens_at, p.closes_at, p.closed_override_date,
            COALESCE(s.available, false) AS available,
            s.updated_at AS stock_updated_at
     FROM pharmacies p
     LEFT JOIN stock s ON s.pharmacy_id = p.id AND s.medicine_id = $1
     WHERE ($2::text IS NULL OR p.city = $2)
     -- الترتيب بالأولوية: المتوفر أولاً، ثم من تُحدّث مخزونها ولا تملكه،
     -- ثم من لا تُحدّث مخزونها. فأنفع المعلومات تظهر قبل أضعفها دائماً.
     ORDER BY COALESCE(s.available, false) DESC,
              COALESCE(p.manages_stock, false) DESC,
              p.name`,
    [medicineId, city || null]
  );
  return rows;
}

async function getStockForPharmacy(pharmacyId) {
  const { rows } = await pool.query(
    `SELECT m.id AS medicine_id, m.name, m.generic_name, m.category,
            COALESCE(s.available, false) AS available,
            s.manufacture_date, s.expiry_date, s.updated_at
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
    `INSERT INTO stock (pharmacy_id, medicine_id, available, manufacture_date, expiry_date, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (pharmacy_id, medicine_id) DO UPDATE SET
       available = $3,
       updated_at = NOW(),
       manufacture_date = CASE WHEN $6 THEN $4 ELSE stock.manufacture_date END,
       expiry_date = CASE WHEN $7 THEN $5 ELSE stock.expiry_date END`,
    [pharmacyId, medicineId, !!available, manufactureDate || null, expiryDate || null, mfgProvided, expProvided]
  );
}

// ---------- الطلبات ----------

// إنشاء طلب. requestKey اختياري: إن وُجد وسبق استخدامه لهذه الصيدلية، يُعاد
// الطلب الموجود بدل إنشاء نسخة. ولغيابه (عميل قديم) يعمل كالسابق تماماً.
//
// ON CONFLICT ... DO NOTHING لا يرجّع صفاً عند التصادم، فنقرأ الموجود بعدها.
// والضمان هنا في القاعدة لا في التطبيق: طلبان متزامنان بالمفتاح نفسه ينتجان
// طلباً واحداً، ويرجع كلاهما المعرّف نفسه.
async function createOrder(pharmacyId, patientName, patientPhone, items, notes, requestKey) {
  if (!requestKey) {
    const { rows } = await pool.query(
      `INSERT INTO orders (pharmacy_id, patient_name, patient_phone, items, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [pharmacyId, patientName, patientPhone, JSON.stringify(items), notes || null]
    );
    return rows[0];
  }
  const inserted = await pool.query(
    `INSERT INTO orders (pharmacy_id, patient_name, patient_phone, items, notes, request_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (request_key, pharmacy_id) WHERE request_key IS NOT NULL DO NOTHING
     RETURNING *`,
    [pharmacyId, patientName, patientPhone, JSON.stringify(items), notes || null, requestKey]
  );
  if (inserted.rows.length) return inserted.rows[0];
  const existing = await pool.query(
    `SELECT * FROM orders WHERE request_key = $1 AND pharmacy_id = $2`,
    [requestKey, pharmacyId]
  );
  return existing.rows[0];
}

async function getOrdersForPharmacy(pharmacyId) {
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE pharmacy_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [pharmacyId]
  );
  return rows;
}

// جلب طلب واحد — يُستخدم للتحقق من ملكيته قبل السماح بأي تعديل عليه.
// نُرجع pharmacy_id فقط (لا بيانات المريض) لأن هذا كل ما يحتاجه فحص الصلاحية،
// فلا تمر بيانات شخصية في مسار لا يحتاجها.
async function getOrderOwner(orderId) {
  const { rows } = await pool.query(
    `SELECT id, pharmacy_id FROM orders WHERE id = $1 AND deleted_at IS NULL`,
    [orderId]
  );
  return rows[0] || null;
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
    [cleanText(name), cleanText(specialty), cleanText(university), cleanText(graduation_year), cleanText(phone)]
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
  clearAllDuty,
  setAssistantPhone,
  setWhatsappPhone,
  setPharmacyLocation,
  setPharmacyHours,
  setClosedOverride,
  setManagesStock,
  getWhatsappPharmacies,
  setPharmacyName,
  setPharmacyUsername,
  setPharmacyPassword,
  ping,
  exportAll,
  logSearch,
  getDemandReport,
  getSetting,
  launchReset,
  getAdminStats,
  getOnDutyPharmacies,
  getAvailability,
  getStockForPharmacy,
  setStock,
  createOrder,
  getOrdersForPharmacy,
  getOrderOwner,
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
