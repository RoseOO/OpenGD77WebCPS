/**
 * OpenGD77 CPS (standalone) Service Worker
 * Provides offline capability and caching for the standalone CPS web app.
 *
 * IMPORTANT: keep CACHE_NAME in sync with CACHE_VERSION.
 *
 * Strategy:
 * - Navigations are network-first so a freshly deployed index.html (with new
 *   ?v= asset URLs) is picked up; the cached shell is only an offline fallback.
 * - Static assets are cache-first keyed by the full URL (including ?v=), so a
 *   new build's ?v= URLs always fetch fresh; stale entries are purged when
 *   CACHE_NAME is bumped on release.
 */

const CACHE_NAME = 'opengd77-cps-v44';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/api.js',
  '/js/codeplug.js',
  '/js/config.js',
  '/js/theme-init.js',
  '/js/g77.js',
  '/js/mk22_cipher.js',
  '/js/stm32_ciphers.js',
  '/js/theme.js',
  '/js/ui.js',
  '/js/utils.js',
  '/js/webusb.js',
  '/js/firmware.js',
  '/js/sw-register.js',
  '/js/user-guide.js',
  '/js/dm32flash.js',
  '/js/dm32microcode.js',
  '/manifest.json',
  '/m12.TTF'
];

const EXTERNAL_PATTERNS = [
  'https://fonts.googleapis.com/',
  'https://fonts.gstatic.com/',
  'https://cdn.jsdelivr.net/npm/@mdi/font',
  'https://cdn.jsdelivr.net/npm/marked',
  'https://unpkg.com/leaflet'
];

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(STATIC_ASSETS.map((asset) => cache.add(asset)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith('opengd77-cps-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/') || url.hostname === 'api.grid.radio') {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ ok: false, offline: true, error: 'Offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  if (request.mode === 'navigate' && url.pathname.startsWith('/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error()))
    );
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const external = EXTERNAL_PATTERNS.some((pattern) => request.url.startsWith(pattern));
  if (!sameOrigin && !external) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && (response.status === 200 || response.type === 'opaque')) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())).catch(() => {});
          }
          return response;
        })
        .catch(() => Response.error());
    })
  );
});
