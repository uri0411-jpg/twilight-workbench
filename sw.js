// ═══════════════════════════════════════════
//  TWILIGHT — sw.js
//  Service Worker: offline support + push notifications
//  Plain JS (no ES6 modules in SW)
// ═══════════════════════════════════════════

// 🔴 BUMP THIS ON EVERY DEPLOY (twl-v3, twl-v4, ...)
const CACHE_NAME = 'twl-v8';
const TILE_CACHE = 'twl-tiles'; // persistent across deploys — managed by MAX_TILES
const MAX_TILES  = 250;         // ~6MB at ~25KB/tile

const STATIC_ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './manifest.json',
  './images/background.jpg',
  './images/sunrise.png',
  './images/sunset.png',
  './images/twilight.png',
  './images/icon-192.png',
  './images/icon-512.png',
  './js/app.js',
  './js/config.js',
  './js/utils.js',
  './js/cache.js',
  './js/api.js',
  './js/score.js',
  './js/location.js',
  './js/nav.js',
  './js/ui.js',
  './js/main-screen.js',
  './js/spots-screen.js',
  './js/settings-screen.js',
  './js/sw-register.js',
  './js/calibration.js',
  './js/install-prompt.js',
  './js/debugPanel.js',
  './js/engine/physicsLayer.js',
  './js/engine/scoreEngine.js',
  './js/engine/goldenWindow.js',
  './js/engine/decisionEngine.js'
];

const API_PATTERNS = [
  'api.open-meteo.com',
  'air-quality-api.open-meteo.com',
  'archive-api.open-meteo.com',
  'nominatim.openstreetmap.org',
  'overpass-api.de',
  'overpass.kumi.systems',
  'unpkg.com/leaflet',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// ─── INSTALL ───────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching static assets');
      // FIX #1: simplified — cache.add errors logged individually, no double-wrap
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(e => console.warn('[SW] Failed to cache:', url, e.message))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ──────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME && key !== TILE_CACHE)
            .map(key => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── FETCH ─────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Map tiles — stale-while-revalidate with capped cache
  if (
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('basemaps.cartocdn.com')
  ) {
    // FIX #4: pass event so we can extend SW lifetime via waitUntil
    event.respondWith(staleWhileRevalidateTile(request, event));
    return;
  }

  const isAPI = API_PATTERNS.some(
    p => url.hostname.includes(p) || url.href.includes(p)
  );
  if (isAPI) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

// ─── CACHE-FIRST ───────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (
      response &&
      response.status === 200 &&
      response.type !== 'opaque'
    ) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (request.headers.get('accept')?.includes('text/html')) {
      return caches.match('./index.html');
    }
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// ─── NETWORK-FIRST ─────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    // FIX #2: guard opaque responses — never cache cross-origin no-cors responses
    if (
      response &&
      response.status === 200 &&
      response.type !== 'opaque'
    ) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(
      JSON.stringify({ error: 'offline' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ─── MAP TILE CACHE ────────────────────
// FIX #4: accept `event` to extend SW lifetime during background revalidation
async function staleWhileRevalidateTile(request, event) {
  const cache  = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);

  // Background revalidation — extend SW lifetime so it isn't killed mid-fetch
  const revalidatePromise = fetch(request).then(async response => {
    if (
      response &&
      response.status === 200 &&
      response.type !== 'opaque'
    ) {
      await cache.put(request, response.clone());
      await trimTileCache(cache);
    }
    return response;
  }).catch(() => null);

  // FIX #4: keep SW alive while background update runs
  if (event) event.waitUntil(revalidatePromise);

  // Serve cached immediately; fall back to network fetch if not cached
  return cached
    || revalidatePromise
    || new Response('Tile unavailable', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' }
       });
}

async function trimTileCache(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_TILES) {
    const excess = keys.slice(0, keys.length - MAX_TILES);
    await Promise.all(excess.map(k => cache.delete(k)));
  }
}

// ─── PUSH NOTIFICATIONS ────────────────
self.addEventListener('push', event => {
  const data  = event.data?.json() || {};
  const title = data.title || 'TWILIGHT · דמדומים';
  const options = {
    body:    data.body || 'תנאי שקיעה מעולים היום!',
    icon:    '/twilight-workbench/images/sunset.png',
    badge:   '/twilight-workbench/images/icon-192.png',
    dir:     'rtl',
    lang:    'he',
    data:    { url: data.url || '/twilight-workbench/' },
    actions: [
      { action: 'open',    title: 'פתח אפליקציה' },
      { action: 'dismiss', title: 'סגור' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/twilight-workbench/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // FIX #5: use URL object to compare pathname — handles query-param variants
      for (const client of clientList) {
        const clientPath = new URL(client.url).pathname;
        const targetPath = new URL(targetUrl, self.location.origin).pathname;
        if (clientPath === targetPath && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// ✎ fixed #2:  networkFirst — opaque response guard added
// ✎ fixed #3:  badge icon — .svg → .png
// ✎ fixed #4:  staleWhileRevalidateTile — event.waitUntil wraps background fetch
// ✎ fixed #5:  notificationclick — pathname comparison instead of full URL
// ✓ sw.js — complete