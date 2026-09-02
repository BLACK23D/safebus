# Task 8 — pwa-layer — Work Record

## Deliverables (all verified on live dev server, port 3000)

| File | Action | Notes |
|---|---|---|
| `public/manifest.webmanifest` | created | Blueprint-exact: standalone, portrait-primary, theme `#1976D2`, bg `#F8FAFC`, 4 icons + 4 shortcuts (/track, /driver, /notifications, /emergency). |
| `scripts/generate-icons.mjs` | created | SVG source (blue rounded square, white front-view bus glyph, darker-blue diagonal accents) → sharp → 6 PNGs. Run: `bun scripts/generate-icons.mjs`. |
| `public/icons/icon-192.png` / `icon-512.png` | generated | Rounded square (rx 22.5%), opaque bg, glyph 62%. 4.6 KB / 13.4 KB. |
| `public/icons/maskable-192.png` / `maskable-512.png` | generated | FULL-BLEED square, glyph 58% → max glyph radius ≈39.5% of canvas (inside 80% safe zone). 100% opaque (alpha min 255). |
| `public/icons/apple-touch-icon.png` | generated | 180×180, full-bleed opaque (iOS masks it). |
| `public/icons/favicon-32.png` | generated | 32×32 rounded square. |
| `public/sw.js` | created | §30.4-patched privacy-strict SW, byte-exact per blueprint (see below). |
| `src/components/pwa/register-sw.tsx` | replaced | Registration + consent-gated update banner (details below). |
| `next.config.ts` | edited | Added `headers()` for `/sw.js` (Cache-Control no-cache trio + `Service-Worker-Allowed: /`). Preserved `output:'standalone'`, `typescript.ignoreBuildErrors`, `reactStrictMode:false`. |
| `src/app/offline/page.tsx` | edited | Additive only: `next/link` import + "Try the home page" → `/` shown when `online`. |

`public/offline.html` intentionally NOT created (Next route `/offline` is precached instead).

## Service worker contract (for reviewers)

- NEVER caches: `/api/*`, `/socket.io`, non-GET, Authorization/cookie-bearing requests, navigations (authenticated HTML). No Background Sync — safety writes never replayed.
- Branch 1: `/â_next/static/` + `/icons/` → cache-first even with cookies. Branch 2: navigations + cookie GETs → network-only, fallback `caches.match('/offline')`. Branch 3: other public same-origin GETs → stale-while-revalidate (`manifest.webmanifest`, `logo.svg` land here — fine).
- Install precaches `['/offline','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png']`; NO skipWaiting on install. New versions activate ONLY after the UI banner posts `SKIP_WAITING` (user consent). `controllerchange` → one reload (module flag `reloadedOnce`).

## Update UX (register-sw.tsx)

- Registers only on `https:` or `localhost`; polls `reg.update()` every 60s; `reg.waiting` + existing controller → banner (first install silent).
- Banner: fixed `bottom-24 right-4 md:bottom-6 md:right-6`, `role="alertdialog"`; amber warning when on `/driver/trips`: "You have an active trip open. Finish or hand off the trip before updating." Buttons: **Later** (dismiss) / **Reload app** (`waiting.postMessage('SKIP_WAITING')`).

## Verification results

- Icon gen: 6/6 written, exact px confirmed via sharp metadata; maskable/apple fully opaque; rounded icons transparent corners only. (Gotcha fixed: sharp `density` upscales SVG raster — pin with `.resize(size,size)`.)
- `curl /manifest.webmanifest` → 200, `Content-Type: application/manifest+json` ✅ (correct MIME even in dev).
- `curl /sw.js` → 200 with `Cache-Control: no-cache, no-store, must-revalidate` + `Service-Worker-Allowed: /` ✅.
- All 6 icon URLs → 200. `sw.js` parses clean. Scoped eslint on my files → 0 problems.

## ⚠️ Handoffs for other agents

1. **Task 9 / orchestrator — middleware bug (I did not touch `src/middleware.ts`, out of my file scope):** line 74 handles the logged-in bounce exemption for `/offline`, but anonymous requests fall through to the `if (!session)` redirect → `GET /offline` without cookies = **307 → /login?next=/offline&reason=signin** (with session = 200, verified). Impact on PWA layer: SW install while anonymous caches the login HTML under '/offline'; a 5xx on that chain fails install. Suggested fix (one block):
   ```ts
   if (isPublic) {
     if (session && pathname !== '/offline' && !pathname.startsWith('/verify-email')) {
       return NextResponse.redirect(new URL(ROLE_HOME[session.role], req.url));
     }
     return res;
   }
   ```
   After that fix, zero changes needed in `sw.js` / `register-sw.tsx`.
2. **Task 6 — pre-existing lint error (not mine, not fixed):** `src/features/messaging/messages-page.tsx:65` — `void load()` in effect body triggers `react-hooks/set-state-in-effect`. Repo-wide `bun run lint` currently fails on that single error; my files are clean.
