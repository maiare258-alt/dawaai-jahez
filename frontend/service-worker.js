// Service Worker لدوائي جاهز.
// المهمة الأولى: شرط "قابلية التثبيت" كتطبيق (PWABuilder وأندرويد).
// المهمة الثانية: صفحة "لا يوجد اتصال" حين يُفتح الموقع أو التطبيق دون إنترنت.
// المهمة الثالثة: إشعارات الهاتف للصيدليات ومدير التمريض (أسفل الملف).
//
// لا نخزّن أي بيانات أو نسخة من الموقع: الموقع يعتمد كلياً على بيانات حية (بحث، مناوبة،
// طلبات)، ونسخة قديمة قد تُري المريض توفراً أو مناوبة لم تعد صحيحة. الشيء الوحيد المخزّن
// هو offline.html، وهو نص ثابت بلا أي بيانات.
//
// بدون هذا كان Chrome داخل التطبيق يعرض عند انقطاع الإنترنت آخر نسخة حفظها هو من
// الموقع، وقد تكون قديمة جداً ولا تعمل، فيظن المريض أن الموقع معطّل.
//
// ⚠️ عند تعديل offline.html غيّر رقم الإصدار هنا، كي تُحمَّل النسخة الجديدة على الأجهزة.

const OFFLINE_CACHE = 'dj-offline-v2';   // v2: أرقام الطوارئ في صفحة عدم الاتصال (أكتوبر 2026)
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .catch(() => { /* تعذّر التخزين الآن: يُعاد عند التحديث القادم، والموقع يعمل كالمعتاد */ })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// نعترض فتح الصفحات فقط (لا البحث ولا الصور ولا أي طلب بيانات): يذهب إلى الخادم كالمعتاد
// تماماً، وإن فشل بسبب انقطاع الإنترنت نعرض صفحة "لا يوجد اتصال" بدل خطأ أو نسخة قديمة.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL).then((cached) => cached || new Response(
        '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<body style="font-family:Tahoma,sans-serif;text-align:center;padding:40px 16px;background:#eaf5fc;color:#163a5c">' +
        '<h1 style="font-size:20px">لا يوجد اتصال بالإنترنت</h1><p>No internet connection</p>' +
        '<button onclick="location.reload()" style="min-height:48px;padding:0 24px;font-size:16px">إعادة المحاولة / Try again</button>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      ))
    )
  );
});

// ===================== إشعارات الهاتف (أكتوبر 2026) =====================
// يرسلها الخادم (push.js) مشفّرة حين يصل طلب دواء إلى صيدلية، أو طلب زيارة إلى مدير التمريض.
// الرسالة: { title, body, url, tag, lang }، بلا أي بيانات مريض لأنها تظهر على شاشة القفل.

// الرابط الذي يفتحه الإشعار: مسار داخل الموقع فقط ("/?open=pharmacist" مثلاً). أي شيء آخر
// (رابط موقع خارجي، أو "//موقع") يصير الصفحة الرئيسية.
function notificationTarget(url) {
  if (typeof url === 'string' && url.startsWith(self.location.origin + '/')) return url;   // محفوظ في الإشعار
  const path = typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/';
  return new URL(path, self.location.origin).href;
}

function notificationOptions(data) {
  const ar = data.lang !== 'en';
  return {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icon-192.png',
    // إشعاران من النوع نفسه (طلبان جديدان) يصيران إشعاراً واحداً محدّثاً، والهاتف يهتز للثاني أيضاً
    tag: typeof data.tag === 'string' ? data.tag : 'dj',
    renotify: true,
    dir: ar ? 'rtl' : 'ltr',
    lang: ar ? 'ar' : 'en',
    vibrate: [200, 100, 200],
    data: { url: notificationTarget(data.url) }
  };
}

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = typeof data.title === 'string' && data.title
    ? data.title
    : (data.lang === 'en' ? 'Dawaai Jahez' : 'دوائي جاهز');
  event.waitUntil(self.registration.showNotification(title, notificationOptions(data)));
});

// الضغط على الإشعار: إن كان الموقع مفتوحاً (ولو في الخلفية) نعيده إلى الواجهة ونطلب منه فتح
// اللوحة دون إعادة تحميل، فلا يضطر الصيدلي إلى تسجيل الدخول من جديد. وإن كان مغلقاً نفتحه.
async function openFromNotification(target) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const mine = windows.filter((c) => new URL(c.url).origin === self.location.origin);
  const client = mine.find((c) => c.focused) || mine[0];
  if (client) {
    try { await client.focus(); } catch (e) { /* بعض الأنظمة ترفض التركيز: تبقى الرسالة أدناه */ }
    client.postMessage({ type: 'dj-open', url: target });
    return 'focused';
  }
  await self.clients.openWindow(target);
  return 'opened';
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(openFromNotification(notificationTarget(data.url)));
});
