// Service worker — עבודה אופליין. להעלות VERSION בכל שינוי.
const VERSION = 'ascend-v1.7.0';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/engine.js', './js/research.js', './js/health.js', './js/habits.js', './js/specials.js', './js/achievements.js', './js/norms.js', './vendor/fflate.js',
  './icons/icon.svg', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// רשת קודם (כדי לקבל עדכונים), מטמון כגיבוי אופליין
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
