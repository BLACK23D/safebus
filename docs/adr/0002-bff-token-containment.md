# ADR-0002: BFF token containment — the browser never holds tokens

- Status: Accepted (2026-09)
- Deciders: engineering (Tasks 1, 9)

## Context

The backend issues JWT access tokens (15 min) and rotating refresh tokens (7 days). Handing either to browser JS would expose them to XSS, extensions, and history/cache leakage.

## Decision

- Browser receives **only HttpOnly cookies**: `sb_at` (15 min), `sb_rt` (7d, scoped to `/api`), and an unsigned `sb_session` mirror for UX gating.
- The BFF catch-all (`src/app/api/[...path]/route.ts`) is the single upstream caller: forwards `Authorization: Bearer`, **strips token fields from auth response bodies** (`stripTokens`), performs **keyed single-flight refresh** on 401 + one retry, and clears cookies on logout.
- `src/middleware.ts` pre-emptively refreshes an expiring `sb_at` (request-cookie mutation) so RSC fetches carry fresh tokens.
- `/api/socket-token` issues a **short-lived, socket-scoped JWT** for the Socket.IO handshake only (see ADR-0004 companion work, issue #13).
- CSRF: origin + `sec-fetch-site` verification on all mutating methods (mandatory because CHIPS `SameSite=None` removes browser-native friction — ADR-0001).

## Consequences

- One place to audit credential flow (route.ts); upstream base URL never exposed.
- Refresh concurrency must be keyed per refresh token (issue #2) — a global single-flight once produced cross-account session mixing in review; the keyed map is the accepted design.
