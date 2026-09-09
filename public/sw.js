/* SafeBus service worker — privacy-strict.
   NEVER caches: /api/*, /socket.io, non-GET, Authorization/cookie-bearing requests,
   navigations (authenticated HTML). No Background Sync — safety writes are never replayed.

   v3 hardening (issue #20):
   - Subresource misses fail as 504 — the /offline HTML page is reserved for NAVIGATIONS
     (a CSS/JS request must never receive text/html).
   - The offline shell is REVALIDATED on activate (cache:'reload', best-effort) so a
     deploy can no longer rot the precached page until the next version bump.
   - Cache writes only store ok/basic responses and are handed to e.waitUntil, so a
     transient 5xx can no longer poison the offline copy and the SW can be killed
     mid-write safely.

   v2 (history): asset strategy became NETWORK-FIRST with cache fallback — cache-first
   pinned stale dev chunks (stable URLs across restarts) so pages ran old code. Install
   purges foreign caches for self-healing. Updates remain consent-gated (SKIP_WAITING). */
const VERSION = 'v3';
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const PRECACHE = ['/offline', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

const OFFLINE_504 = () => new Response('', { status: 504, statusText: 'Offline' });

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
    // Revalidate the offline shell against the server so the precached HTML (and its
    // asset references) cannot silently rot after a deploy. Best-effort: offline we
    // simply keep the cached copy.
    const shell = await caches.open(SHELL);
    await Promise.all(PRECACHE.map(async (u) => {
      try {
        const fresh = await fetch(u, { cache: 'reload' });
        if (fresh && fresh.ok) await shell.put(u, fresh);
      } catch { /* offline — keep cached copy */ }
    }));
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

const isExcluded = (url) =>
  url.pathname.startsWith('/api/') ||
  url.pathname.startsWith('/socket.io') ||
  url.pathname.startsWith('/_next/webpack-hmr');

/** Only cache genuinely good, same-origin responses. */
const cacheable = (res) => res && res.status === 200 && res.type === 'basic';

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
          if (cacheable(res)) {
            e.waitUntil(caches.open(ASSETS).then((c) => c.put(req, res.clone())));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit ?? OFFLINE_504())),
    );
    return;
  }
  // 2) Navigations and other cookie-bearing GETs — network-only + offline fallback.
  //    Only NAVIGATIONS may receive the /offline HTML page; other cookie-bearing
  //    requests fail as 504 so the app treats them as errors (never as HTML).
  if (req.mode === 'navigate' || req.headers.has('cookie')) {
    e.respondWith(
      fetch(req).catch(() =>
        req.mode === 'navigate'
          ? caches.match('/offline').then((hit) => hit ?? OFFLINE_504())
          : OFFLINE_504(),
      ),
    );
    return;
  }
  // 3) Other same-origin public GETs — stale-while-revalidate.
  //    (manifest.webmanifest and logo.svg land here — fine: public assets.)
  e.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (cacheable(res)) {
            e.waitUntil(caches.open(ASSETS).then((c) => c.put(req, res.clone())));
          }
          return res;
        })
        .catch(() => hit ?? OFFLINE_504());
      return hit ?? network;
    }),
  );
});
