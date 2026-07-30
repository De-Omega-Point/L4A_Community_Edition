const CACHE_NAME = 'loyalty-for-all-community-v1';
const APP_SHELL = [
  './',
  './index.html',
  './privacy.html',
  './terms.html',
  './config.js',
  './manifest.webmanifest',
  './assets/icon.svg',
  './css/styles.css',
  './js/app.js',
  './js/alerts.js',
  './js/branding.js',
  './js/cards.js',
  './js/crm.js',
  './js/qr.js',
  './js/registration.js',
  './js/rewards.js',
  './js/scanner.js',
  './js/state.js',
  './js/ui.js',
  './js/utils.js',
  './js/vendor/qrcode.js',
  './js/vendor/jsQR.js',
  './js/vendor/jsQR-LICENSE.txt'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (!response || response.status !== 200 || response.type === 'opaque') return response;
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => {
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    }))
  );
});
