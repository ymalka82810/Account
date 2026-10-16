const CACHE = 'kupa-v25';
// מאז שהאתר עובר דרך Vite build, קובץ ה-JS הראשי יוצא עם hash בשם
// (למשל assets/index-ABC123.js) שלא ידוע מראש. לכן לא מפרטים כאן כל
// קובץ src/*.js בנפרד (כמו קודם) - caches.addAll() נכשל כולו אם קובץ
// אחד מהרשימה לא נמצא, וזה היה קורה מיד עם כל build חדש.
// הקבצים היציבים (שלא משתנה שמם) עדיין מוטענים מראש כאן; שאר הקבצים
// (ה-JS/CSS המבונדלים) נשמרים ל-cache אוטומטית ע"י ה-fetch handler
// למטה, בפעם הראשונה שהם נטענים.
const FILES = [
  './', 'index.html', 'terms.html', 'privacy.html', 'style.css', 'config.js',
  'manifest.webmanifest', 'icon.svg',
];
self.addEventListener('install', (e) => {
  // cache: 'reload' - לא לקחת את הקבצים מהמטמון של הדפדפן (GitHub Pages שומר אותם 10 דקות)
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // קבצים מהאתר עצמו (לא דפי ניווט): מבקשים מהשרת עם no-cache, כדי שאחרי דחיפה
  // לא יוצג קובץ ישן ממטמון הדפדפן (GitHub Pages נותן max-age=600 גם ל-style.css)
  const sameOrigin = new URL(e.request.url).origin === location.origin;
  const req = sameOrigin && e.request.mode !== 'navigate' ? new Request(e.request, { cache: 'no-cache' }) : e.request;
  e.respondWith(
    fetch(req).then((r) => {
      if (r.ok && new URL(e.request.url).origin === location.origin) {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return r;
    }).catch(() => caches.match(e.request))
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { /* ignore */ }
  e.waitUntil(self.registration.showNotification(d.title || 'הקופה המשפחתית', {
    body: d.body || '',
    icon: 'icon.svg',
    badge: 'icon.svg',
    dir: 'rtl',
    lang: 'he',
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
