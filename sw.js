const CACHE = 'kupa-v13';
const FILES = [
  './', 'index.html', 'terms.html', 'privacy.html', 'style.css', 'config.js',
  'vendor/convex-browser.bundle.js', 'manifest.webmanifest', 'icon.svg',
  'src/app.js', 'src/state.js', 'src/helpers.js', 'src/api.js', 'src/computations.js',
  'src/sheet.js', 'src/tabs.js', 'src/entryFlow.js', 'src/entriesList.js', 'src/push.js',
  'src/session.js',
  'src/screens/auth.js', 'src/screens/emailAuth.js', 'src/screens/home.js',
  'src/screens/pending.js', 'src/screens/recurring.js', 'src/screens/legacy.js',
  'src/screens/codes.js', 'src/screens/family.js', 'src/screens/friends.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((r) => {
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
