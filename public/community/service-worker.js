const CACHE_PREFIX = 'loyalty-4-all-community-';
const CACHE_NAME = `${CACHE_PREFIX}v32`;
const APP_SHELL = [
  './',
  './index.html',
  './privacy.html',
  './terms.html',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './assets/loyalty-4-all-logo.png',
  './css/styles.css',
  './js/app.js',
  './js/acquisition.js',
  './js/registered-product.js',
  './js/install-first.js',
  './js/install-guidance.js',
  './js/install-controller.js',
  './js/uninstall-guidance.js',
  './js/branding.js',
  './js/cards.js',
  './js/crm.js',
  './js/member-dashboard.js',
  './js/membership.js',
  './js/note-drafts.js',
  './js/qr.js',
  './js/rewards.js',
  './js/scanner.js',
  './js/state.js',
  './js/storage.js',
  './js/data-schema.js',
  './js/ui.js',
  './js/utils.js',
  './js/vendor/qrcode.js',
  './js/vendor/jsQR.js',
  './js/vendor/jsQR-LICENSE.txt'
];

const SHELL_URLS = new Set(APP_SHELL.map(path => new URL(path, self.location.href).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  // Do not replace the worker underneath an open merchant session. The complete
  // new shell takes over once the previous version's tabs have been closed.
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  url.search = '';
  url.hash = '';
  // Never cache API responses, arbitrary navigations, membership requests or
  // another app's resources. Only this version's known static shell is offline.
  if (!SHELL_URLS.has(url.href)) return;
  event.respondWith(
    caches.open(CACHE_NAME)
      .then(cache => cache.match(url.href))
      // Keep cached HTML and modules on the same release; do not replace files
      // individually with stale-while-revalidate. A missing/evicted cache entry
      // may use the network, but is not written into the active version.
      .then(cached => cached || fetch(event.request))
      .catch(() => Response.error())
  );
});

// Answer only the current static-shell readiness question, never cached identity.
self.addEventListener('message', event => {
  if (event.data?.type !== 'L4A_CHECK_SHELL' || !event.ports?.[0]) return;
  event.waitUntil(caches.open(CACHE_NAME).then(async cache => {
    const responses = await Promise.all([...SHELL_URLS].map(url => cache.match(url)));
    event.ports[0].postMessage({ type: 'L4A_SHELL_STATUS', ready: responses.every(response => response?.ok && !response.redirected) });
  }).catch(() => event.ports[0].postMessage({ type: 'L4A_SHELL_STATUS', ready: false })));
});
