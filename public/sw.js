/* SafeBus service worker — privacy-strict.
   NEVER caches: /api/*, /socket.io, non-GET, Authorization/cookie-bearing requests,
   navigations (authenticated HTML). No Background Sync — safety writes are never replayed. */
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const PRECACHE = ['/offline', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE))); // no skipWaiting: wait for consent
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

const isExcluded = (url) =>
  url.pathname.startsWith('/api/') ||
  url.pathname.startsWith('/socket.io') ||
  url.pathname.startsWith('/_next/webpack-hmr');

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                    // never intercept writes
  const url = new URL(req.url);
  if (url.origin !== location.origin || isExcluded(url)) return;
  if (req.headers.get('authorization')) return;        // belt & suspenders

  // 1) Immutable hashed assets + icons — public by definition; cache-first EVEN with cookies.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(ASSETS).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }
  // 2) Navigations and other cookie-bearing GETs — network-only + offline fallback.
  if (req.mode === 'navigate' || req.headers.has('cookie')) {
    e.respondWith(fetch(req).catch(() => caches.match('/offline')));
    return;
  }
  // 3) Other same-origin public GETs — stale-while-revalidate.
  //    (manifest.webmanifest and logo.svg land here — fine: public assets.)
  e.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(ASSETS).then((c) => c.put(req, copy));
        return res;
      }).catch(() => hit);
      return hit ?? network;
    }),
  );
});
