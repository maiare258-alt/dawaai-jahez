// مؤقت المناوبة: حساب لحظة بداية المناوبة ونهايتها الفعليتين من «اليوم + من الساعة + إلى الساعة».
//
// السبب: كانت المناوبة مفتاحاً يدوياً يبقى مفعّلاً حتى يطفئه أحد، فإن نسي الصيدلي إطفاءه
// رأى المريض صباحاً أو ليلة أخرى أن الصيدلية مناوبة وهي مغلقة. الآن يحسب الخادم لحظة
// النهاية عند الحفظ ويخزّنها، وتنطفئ المناوبة وحدها عندها (db.expireEndedDuties).
//
// الحساب بتوقيت سوريا لا بتوقيت الخادم: الخادم في أوروبا، ولو حُسب بتوقيته لانطفأت المناوبة
// قبل موعدها بساعات. نستعمل منطقة Asia/Damascus كما يفعل باقي الموقع (damascusToday)،
// فإن تغيّر التوقيت الرسمي يوماً يتبعه الحساب دون تعديل هنا.

const DAMASCUS_TZ = 'Asia/Damascus';
const DAY_MS = 24 * 60 * 60 * 1000;

// أسماء الأيام كما يرسلها نموذج المناوبة، ورقم كل يوم كما في getUTCDay (الأحد = 0)
const DAY_INDEX = {
  'الأحد': 0, 'الاثنين': 1, 'الثلاثاء': 2, 'الأربعاء': 3, 'الخميس': 4, 'الجمعة': 5, 'السبت': 6
};

// أقصى مدة مسموحة بين الحفظ وبداية المناوبة. المناوبة تظهر للمرضى من لحظة حفظها، فلو
// سُمح بحفظ مناوبة الخميس يوم السبت لظهرت الصيدلية «مناوبة» خمسة أيام كاملة قبل موعدها.
const MAX_LEAD_MS = DAY_MS;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: DAMASCUS_TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
});

// التاريخ والساعة في سوريا للحظة معيّنة
function damascusParts(ms) {
  const p = {};
  for (const { type, value } of partsFormatter.formatToParts(new Date(ms))) p[type] = Number(value);
  return p;
}

// فرق توقيت سوريا عن التوقيت العالمي عند لحظة معيّنة (بالمللي ثانية)
function offsetAt(ms) {
  const p = damascusParts(ms);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - Math.floor(ms / 1000) * 1000;
}

// ساعة حائط في سوريا (سنة، شهر، يوم، ساعة، دقيقة) إلى لحظة عالمية.
// نصحّح الفرق مرتين كي يصح الحساب حتى لو وقع تغيير توقيت بين التخمين والنتيجة.
function damascusWallToUtc(year, month, day, hour, minute) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return t;
}

// "HH:MM" (أو "HH:MM:SS") إلى دقائق، أو null لأي قيمة تالفة
function toMinutes(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = hhmm.trim().match(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * يحسب أقرب مناوبة لم تنتهِ بعد بهذا اليوم وهذه الساعات.
 * - إن كانت ساعة النهاية أصغر من البداية أو تساويها (8 م إلى 3 ص، أو 8 ص إلى 8 ص)
 *   فالمناوبة تعبر منتصف الليل وتنتهي في اليوم التالي.
 * - صيدلي يحفظ الساعة 1 فجر الاثنين مناوبة «الأحد 8 م إلى 3 ص» هو في منتصفها، فنأخذ
 *   مناوبة الأمس لا مناوبة الأحد القادم.
 * @returns {{startsAt: Date, endsAt: Date} | null} null إن كانت المدخلات غير صالحة
 */
function computeDutyWindow(day, startTime, endTime, nowMs = Date.now()) {
  if (!Object.prototype.hasOwnProperty.call(DAY_INDEX, day)) return null;
  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  if (s === null || e === null) return null;

  const today = damascusParts(nowMs);
  const todayMidnight = Date.UTC(today.year, today.month - 1, today.day);
  const todayIndex = new Date(todayMidnight).getUTCDay();
  const delta = (DAY_INDEX[day] - todayIndex + 7) % 7;
  const crossesMidnight = e <= s;

  // أقرب ثلاثة مواعيد لهذا اليوم: الماضي، والقادم، والذي يليه. أول واحد لم تنتهِ مناوبته هو المقصود.
  for (const offset of [delta - 7, delta, delta + 7]) {
    const startDate = new Date(todayMidnight + offset * DAY_MS);
    const endDate = new Date(startDate.getTime() + (crossesMidnight ? DAY_MS : 0));
    const startsAt = damascusWallToUtc(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, startDate.getUTCDate(), Math.floor(s / 60), s % 60);
    const endsAt = damascusWallToUtc(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, endDate.getUTCDate(), Math.floor(e / 60), e % 60);
    if (endsAt > nowMs) return { startsAt: new Date(startsAt), endsAt: new Date(endsAt) };
  }
  return null;
}

module.exports = { computeDutyWindow, MAX_LEAD_MS, DAY_INDEX };
