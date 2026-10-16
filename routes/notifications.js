const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

const db = require('../db');
const push = require('../push');
const rateLimit = require('../middleware/rateLimit');
const { DUMMY_PASSWORD_HASH } = require('../middleware/shared');

// اشتراكات إشعارات الهاتف. دوران، ولكل دور كلمة المرور التي يدخل بها لوحته:
//   manager  ← كلمة مرور مدير التمريض (x-nursing-password)
//   pharmacy ← اسم مستخدم الصيدلية وكلمة مرورها (x-pharmacy-username وx-pharmacy-password)
// الإدارة لا تشترك (قرار ميار: لا يريد إشعاراً بكل طلب). الجهاز الواحد قد يشترك بالدورين.

const ROLES = ['manager', 'pharmacy'];

function decodeHeader(v) {
  try { return decodeURIComponent(String(v)); } catch (e) { return null; }
}

// يعيد { pharmacyId } عند النجاح، أو null
async function authorize(req, role) {
  if (role === 'manager') {
    const raw = req.headers['x-nursing-password'];
    if (!raw) return null;
    const password = decodeHeader(raw) || '';
    const hash = await db.getSetting('nursing_manager_hash');
    if (!hash) { await bcrypt.compare(password, DUMMY_PASSWORD_HASH); return null; }
    return (await bcrypt.compare(password, hash)) ? { pharmacyId: null } : null;
  }
  if (role === 'pharmacy') {
    const username = decodeHeader(req.headers['x-pharmacy-username'] || '');
    const password = decodeHeader(req.headers['x-pharmacy-password'] || '');
    if (!username || !password) return null;
    const ph = await db.findPharmacyByUsername(username);
    if (!ph) { await bcrypt.compare(password, DUMMY_PASSWORD_HASH); return null; }
    return (await bcrypt.compare(password, ph.owner_password_hash)) ? { pharmacyId: ph.id } : null;
  }
  return null;
}

// كل مسار هنا يبدأ بالتحقق من الدور وكلمة مروره. الخطأ 401 يُحتسب في حد المحاولات العام.
function withRole(handler) {
  return async (req, res) => {
    const role = req.body && req.body.role;
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'قيمة غير صالحة' });
    try {
      const who = await authorize(req, role);
      if (!who) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
      await handler(req, res, role, who);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
  };
}

const limit = rateLimit(60, 15 * 60 * 1000);

// المفتاح العام لـVAPID: يحتاجه المتصفح ليشترك. عام بطبيعته.
router.get('/key', limit, async (req, res) => {
  try {
    res.json({ publicKey: (await push.getVapidKeys()).publicKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

// POST /api/push/subscribe  { role, lang, subscription: { endpoint, keys: { p256dh, auth } } }
router.post('/subscribe', limit, withRole(async (req, res, role, who) => {
  const sub = req.body.subscription || {};
  if (!push.validEndpoint(sub.endpoint) || !push.validKeys(sub.keys)) {
    return res.status(400).json({ error: 'اشتراك الإشعارات غير صالح' });
  }
  const lang = req.body.lang === 'en' ? 'en' : 'ar';
  await db.savePushSubscription({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, role, pharmacyId: who.pharmacyId, lang });
  res.json({ subscribed: true });
}));

// هل هذا الجهاز مشترك بهذا الدور؟ (قد يكون الخادم حذف الاشتراك لأنه انتهى)
router.post('/status', limit, withRole(async (req, res, role, who) => {
  const endpoint = req.body.endpoint;
  if (!push.validEndpoint(endpoint)) return res.json({ subscribed: false });
  const sub = await db.findPushSubscription(endpoint, role);
  res.json({ subscribed: !!sub && (role !== 'pharmacy' || sub.pharmacy_id === who.pharmacyId) });
}));

// إيقاف الإشعارات على هذا الجهاز لهذا الدور
router.post('/unsubscribe', limit, withRole(async (req, res, role) => {
  const endpoint = req.body.endpoint;
  if (typeof endpoint === 'string') await db.deletePushSubscriptionByEndpoint(endpoint, role);
  res.json({ subscribed: false });
}));

// إشعار تجريبي إلى هذا الجهاز وحده. النتيجة sent تعني أن خدمة الإشعارات قبلته، والتأكد
// الحقيقي أن يظهر على الهاتف.
router.post('/test', rateLimit(10, 15 * 60 * 1000), withRole(async (req, res, role, who) => {
  const endpoint = req.body.endpoint;
  const sub = push.validEndpoint(endpoint) ? await db.findPushSubscription(endpoint, role) : null;
  if (!sub || (role === 'pharmacy' && sub.pharmacy_id !== who.pharmacyId)) {
    return res.status(404).json({ error: 'الإشعارات غير مفعّلة على هذا الجهاز' });
  }
  const r = await push.sendOne(sub, push.TEST_MESSAGE);
  res.json(r);
}));

module.exports = router;
