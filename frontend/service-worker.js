// Service Worker لدوائي جاهز.
// المهمة الأولى: شرط "قابلية التثبيت" كتطبيق (PWABuilder وأندرويد).
// المهمة الثانية: صفحة "لا يوجد اتصال" حين يُفتح الموقع أو التطبيق دون إنترنت.
//
// لا نخزّن أي بيانات أو نسخة من الموقع: الموقع يعتمد كلياً على بيانات حية (بحث، مناوبة،
// طلبات)، ونسخة قديمة قد تُري المريض توفراً أو مناوبة لم تعد صحيحة. الشيء الوحيد المخزّن
// هو offline.html، وهو نص ثابت بلا أي بيانات.
//
// بدون هذا كان Chrome داخل التطبيق يعرض عند انقطاع الإنترنت آخر نسخة حفظها هو من
// الموقع، وقد تكون قديمة جداً ولا تعمل، فيظن المريض أن الموقع معطّل.
//
// ⚠️ عند تعديل offline.html غيّر رقم الإصدار هنا، كي تُحمَّل النسخة الجديدة على الأجهزة.

const OFFLINE_CACHE = 'dj-offline-v1';
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
