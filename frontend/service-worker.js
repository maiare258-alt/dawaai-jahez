// Service Worker بسيط جداً لدوائي جاهز — الهدف الوحيد هنا هو تحقيق شرط "قابلية التثبيت"
// (Installability) المطلوب من متصفحات أندرويد/PWABuilder، بدون أي تعقيد أو تخزين مؤقت طموح.
// عمداً بدون أي تخزين Offline حقيقي حالياً — الموقع يعتمد بالكامل على بيانات حية من السيرفر
// (بحث، سلة، طلبات، مناوبة...)، فتخزين نسخة قديمة محلياً ممكن يسبب لبس أو بيانات غير دقيقة
// للمريض. هذا الملف قابل للتوسعة لاحقاً لو حبينا Offline support حقيقي بمرحلة لاحقة.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// صفر اعتراض لطلبات الشبكة حالياً — كل طلب بيروح للسيرفر مباشرة زي ما هو تماماً
self.addEventListener('fetch', () => {});
