// إشعارات الهاتف (Web Push) بلا أي خدمة مدفوعة ولا مكتبة خارجية.
//
// كيف تعمل: متصفح الهاتف (Chrome على أندرويد، وتطبيق PWABuilder الذي يعمل عبره) يعطينا
// «عنوان اشتراك» عند خدمة الإشعارات التابعة له (Google أو Mozilla أو Apple). حين يصل طلب
// جديد نرسل رسالة مشفّرة إلى ذلك العنوان، فتوصلها الخدمة إلى الهاتف حتى لو كان الموقع
// مغلقاً، ويعرضها service-worker.js.
//
// الأمان:
// - الرسالة مشفّرة (RFC 8291) بمفاتيح الجهاز نفسه: خدمة الإشعارات لا تقرأ محتواها.
// - ومع ذلك لا نضع فيها أي بيانات مريض (لا اسم ولا هاتف)، لأنها تظهر على شاشة القفل.
// - نوقّع كل إرسال بمفتاح VAPID خاص بالمنصة (RFC 8292)، فلا يستطيع غيرنا الإرسال إلى مشتركينا.
//   المفتاح يُنشأ تلقائياً أول مرة ويُحفظ في app_settings، فلا يحتاج أي إعداد في Render.
// - لا نرسل إلا إلى خدمات الإشعارات المعروفة (القائمة أدناه)، كي لا يصير الخادم أداة
//   لإرسال طلبات إلى أي عنوان يكتبه أحد (SSRF).

const crypto = require('crypto');
const db = require('./db');

const SUBJECT = process.env.VAPID_SUBJECT || 'https://dawaai-jahez.onrender.com';
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/, /^([a-z0-9-]+\.)*notify\.windows\.com$/];

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// عنوان الاشتراك: https، ومن خدمة إشعارات معروفة، وبطول معقول
function validEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  let u;
  try { u = new URL(endpoint); } catch (e) { return false; }
  return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') &&
    PUSH_HOSTS.some(re => re.test(u.hostname));
}

// مفتاحا الجهاز: p256dh نقطة على المنحنى P-256 (65 بايت تبدأ بـ4)، وauth سر من 16 بايت
function validKeys(keys) {
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return false;
  if (keys.p256dh.length > 120 || keys.auth.length > 40) return false;
  const p = fromB64u(keys.p256dh), a = fromB64u(keys.auth);
  if (p.length !== 65 || p[0] !== 4 || a.length !== 16) return false;
  // نقطة ليست على المنحنى تُرفض هنا، لا عند أول إرسال
  try { const e = crypto.createECDH('prime256v1'); e.generateKeys(); e.computeSecret(p); } catch (e) { return false; }
  return true;
}

// ---------- مفاتيح VAPID ----------
let vapidCache = null;
async function getVapidKeys() {
  if (vapidCache) return vapidCache;
  let raw = await db.getSetting('vapid_keys');
  if (!raw) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' });
    const pub = b64u(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)]));
    const candidate = JSON.stringify({ publicKey: pub, privateJwk: privateKey.export({ format: 'jwk' }) });
    // طلبان متزامنان أول مرة: يُحفظ أولهما فقط، ويقرأ الثاني ما حُفظ، فلا يتبدل المفتاح
    raw = await db.setSettingIfMissing('vapid_keys', candidate);
  }
  const parsed = JSON.parse(raw);
  vapidCache = {
    publicKey: parsed.publicKey,
    privateKey: crypto.createPrivateKey({ key: parsed.privateJwk, format: 'jwk' })
  };
  return vapidCache;
}

// توقيع VAPID: JWT بخوارزمية ES256، صالح 12 ساعة، لجمهور خدمة الإشعارات نفسها
function vapidAuthorization(endpoint, keys) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT }));
  const data = `${header}.${claims}`;
  const sig = crypto.sign('sha256', Buffer.from(data), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${data}.${b64u(sig)}, k=${keys.publicKey}`;
}

// ---------- التشفير (RFC 8291، الترميز aes128gcm من RFC 8188) ----------
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

function encryptPayload(text, p256dh, auth, { salt = crypto.randomBytes(16), ecdh = null } = {}) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  const local = ecdh || crypto.createECDH('prime256v1');
  if (!ecdh) local.generateKeys();
  const asPublic = local.getPublicKey();
  const shared = local.computeSecret(uaPublic);

  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const plain = Buffer.concat([Buffer.from(text, 'utf8'), Buffer.from([2])]);   // 2 = آخر سجل، بلا حشو
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// ---------- الإرسال ----------
// النتيجة: 'sent' (قبلته خدمة الإشعارات)، أو 'gone' (الاشتراك انتهى فحُذف)، أو 'failed'
async function sendOne(sub, message) {
  if (!validEndpoint(sub.endpoint)) { await db.deletePushSubscription(sub.id); return { result: 'gone' }; }
  const keys = await getVapidKeys();
  const lang = sub.lang === 'en' ? 'en' : 'ar';
  const payload = JSON.stringify({
    title: message[lang].title, body: message[lang].body, url: message.url || '/', tag: message.tag || 'dj', lang
  });
  let res;
  try {
    res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        TTL: String(24 * 3600),          // إن كان الهاتف مطفأً تنتظر الرسالة يوماً
        Urgency: 'high',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        Authorization: vapidAuthorization(sub.endpoint, keys)
      },
      body: encryptPayload(payload, sub.p256dh, sub.auth),
      signal: AbortSignal.timeout(10000),
      redirect: 'error'
    });
  } catch (err) {
    console.error('push: network error', err && err.message);
    return { result: 'failed', status: 0 };
  }
  if (res.status >= 200 && res.status < 300) {
    await db.markPushOk(sub.id).catch(() => {});
    return { result: 'sent', status: res.status };
  }
  if (res.status === 404 || res.status === 410) {      // ألغى المستخدم الإذن أو انتهى الاشتراك
    await db.deletePushSubscription(sub.id).catch(() => {});
    return { result: 'gone', status: res.status };
  }
  const text = await res.text().catch(() => '');
  console.error('push: rejected', res.status, text.slice(0, 200));
  await db.markPushFailed(sub.id).catch(() => {});
  return { result: 'failed', status: res.status };
}

// targets: { roles: ['manager'], pharmacyIds: [..] }
async function notify(targets, message) {
  try {
    const subs = await db.getPushSubscriptionsFor(targets);
    await Promise.allSettled(subs.map(s => sendOne(s, message)));
  } catch (err) {
    console.error('push: notify failed', err);
  }
}

// ---------- الرسائل ----------
// بلا أي بيانات مريض: تظهر على شاشة القفل، وقد يراها غير صاحب الهاتف.
// المستلمون: الصيدلية صاحبة الطلب، ومدير التمريض. الإدارة لا تصلها إشعارات (قرار ميار:
// كثرتها مزعجة، والمدير لا يتصرف في كل طلب بنفسه)، فتتابع من لوحتها حين تشاء.

async function notifyNewOrders(orders) {
  if (!orders || !orders.length) return;
  const pharmacyIds = [...new Set(orders.map(o => o.pharmacy_id))];
  await notify({ pharmacyIds }, {
    ar: { title: '🛒 طلب دواء جديد', body: 'وصل طلب جديد إلى صيدليتك. افتح لوحة الصيدلي لرؤيته.' },
    en: { title: '🛒 New medicine order', body: 'A new order has reached your pharmacy. Open the pharmacist panel to see it.' },
    url: '/?open=pharmacist', tag: 'dj-order'
  });
}

async function notifyNurseRequest(nurseName) {
  await notify({ roles: ['manager'] }, {
    ar: { title: '🩺 طلب زيارة تمريضية جديد', body: `طلب زيارة للممرض/ة ${nurseName}. افتح اللوحة لترى بيانات المريض.` },
    en: { title: '🩺 New nursing visit request', body: `A visit request for ${nurseName}. Open the panel to see the patient's details.` },
    url: '/?open=admin', tag: 'dj-nurse-request'
  });
}

const TEST_MESSAGE = {
  ar: { title: '🔔 الإشعارات تعمل', body: 'هكذا سيصلك إشعار كل طلب جديد على هذا الجهاز.' },
  en: { title: '🔔 Notifications are working', body: 'This is how each new request will reach this device.' },
  url: '/', tag: 'dj-test'
};

module.exports = {
  getVapidKeys, validEndpoint, validKeys, sendOne, notify, notifyNewOrders, notifyNurseRequest, TEST_MESSAGE,
  // للاختبار فقط
  _encryptPayload: encryptPayload, _vapidAuthorization: vapidAuthorization
};
