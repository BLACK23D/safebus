/* SafeBus service worker — privacy-strict.
   NEVER caches: /api/*, /socket.io, non-GET, Authorization/cookie-bearing requests,
   navigations (authenticated HTML). No Background Sync — safety writes are never replayed.

   v2: asset strategy is NETWORK-FIRST with cache fallback (was cache-first). Dev-mode
   chunk URLs are stable across server restarts, so cache-first pinned stale JS in
   browsers that had visited an older build — the page HTML stayed fresh but ran old
   code (symptom: calls to routes that no longer exist, hydration crashes after login).
   Network-first always consults the server while online; the cache only serves when
   the network is unreachable, so offline still works. Install also purges any cache
   left by an older SW version so existing users self-heal on their next reload. */
const VERSION = 'v2';
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const PRECACHE = ['/offline', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    // Purge caches from previous SW versions NOW (install), not just on activate,
    // so stale entries cannot be served even before this SW takes over.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k)));
    const shell = await caches.open(SHELL);
    await shell.addAll(PRECACHE);
  })()); // no skipWaiting: wait for consent (update banner)
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

  // 1) Hashed assets + icons — NETWORK-FIRST, cache fallback. Public by definition;
  //    but cache-first pinned stale chunks when dev URLs stayed constant across
  //    rebuilds, so always revalidate with the server while online.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(ASSETS).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit ?? caches.match('/offline'))),
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

/* v2 revalidation touch */
