/* v0.3.0-dev-r5 */
importScripts('./js/config.js');

const CONFIG = self.SDSO_CONFIG;
const CACHE_NAME = `${CONFIG.cachePrefix}v${CONFIG.version}`;
const CACHE_PREFIX = CONFIG.cachePrefix;
const NAVIGATION_TIMEOUT_MS = 4000;
const ASSET_TIMEOUT_MS = 2000;
const DEGRADED_WINDOW_MS = 30000;
let networkDegradedUntil = 0;

const APP_SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/config.js',
  './js/app.js',
  './js/api.js',
  './js/dashboard-compresores.js',
  './js/offline.js',
  './js/db.js',
  './js/auth.js',
  './manifest.webmanifest',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

function isNetworkDegraded() {
  return Date.now() < networkDegradedUntil;
}

function markNetworkDegraded() {
  networkDegradedUntil = Date.now() + DEGRADED_WINDOW_MS;
}

function fetchFresh(request, timeoutMs) {
  const freshRequest = new Request(request, { cache: 'no-cache' });
  return Promise.race([
    fetch(freshRequest),
    new Promise((_, reject) => setTimeout(() => reject(new Error('network-timeout')), timeoutMs))
  ]);
}

async function putIfOk(cacheKey, response) {
  if (!response || !response.ok) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(cacheKey, response.clone());
}

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(APP_SHELL.map(async url => {
    const request = new Request(url, { cache: 'no-cache' });
    const response = await fetch(request);
    if (!response.ok) throw new Error(`No fue posible precachear ${url}: HTTP ${response.status}`);
    await cache.put(url, response.clone());
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(precacheShell());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cachedIndex = await caches.match('./index.html');

      // N3: durante la ventana degradada se responde de inmediato con caché.
      // La red vuelve a probarse al expirar la ventana de degradación.
      if (isNetworkDegraded() && cachedIndex) return cachedIndex;

      try {
        const response = await fetchFresh(request, NAVIGATION_TIMEOUT_MS);
        const scope = new URL(self.registration.scope);
        const isAppEntry = response.ok && (url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`);

        if (response.ok) {
          if (isAppEntry) await putIfOk('./index.html', response);
          return response;
        }

        if (response.status >= 500 && cachedIndex) {
          markNetworkDegraded();
          return cachedIndex;
        }
        return response;
      } catch {
        markNetworkDegraded();
        return cachedIndex || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);

    if (isNetworkDegraded() && cached) return cached;

    try {
      const response = await fetchFresh(request, ASSET_TIMEOUT_MS);
      if (response.ok) {
        await putIfOk(request, response);
        return response;
      }

      if (response.status >= 500 && cached) {
        markNetworkDegraded();
        return cached;
      }
      return response;
    } catch {
      markNetworkDegraded();
      return cached || Response.error();
    }
  })());
});
