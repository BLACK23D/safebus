# ADR-0003: Privacy-strict service worker — network-first assets, consent-gated updates, no background replay

- Status: Accepted (2026-09)
- Deciders: engineering (Tasks 8, 9.4; SW v1→v2→v3)

## Context

v1 cached static assets cache-first. In dev, chunk URLs are stable across restarts, so **stale JS was pinned indefinitely** — users executed last week's code calling this week's endpoints (the `_bff` 404 incident). Separately, a school-transport app must never silently replay safety writes (attendance, location, emergency) after connectivity returns.

## Decision (`public/sw.js`, v2→v3)

1. **Network-first with cache fallback** for `/_next/static/*` and `/icons/*` — cache is the fallback, never the source of truth.
2. **Install-time purge** of every cache that isn't the current version (self-healing across version bumps).
3. **Never intercept**: `/api/*`, `/socket.io`, non-GET, `Authorization`-bearing, or **cookie-bearing** requests; navigations are network-only with `/offline` fallback — authenticated HTML is never served from cache.
4. **Subresource misses** fail as 504 (never the `/offline` HTML — v3 fix).
5. **Precache revalidation** on activate (`cache: 'reload'`, best-effort) so the offline shell cannot rot after deploys.
6. **Updates are consent-gated**: new worker waits → "Update available → Reload app" banner → `SKIP_WAITING` → single guarded reload (driver active-trip check first).

## Consequences

- Offline = shell + last-seen assets only; data surfaces fail loudly with visible error states by design.
- No Background Sync anywhere: a verified pickup is never double-applied by the platform.
