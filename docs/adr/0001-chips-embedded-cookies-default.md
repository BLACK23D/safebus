# ADR-0001: CHIPS partitioned cookies are the code-level default for auth sessions

- Status: Accepted (2026-09)
- Deciders: engineering (Task 9.2/9.3)
- Supersedes: original `SameSite=Lax` first-party-only cookie design

## Context

SafeBus is designed to be embeddable — the primary demo surface is a **cross-site iframe** (preview panel on a different registrable domain). Browsers drop `SameSite=Lax/Strict` cookies on cross-site iframe requests, so a login that "succeeded" (200) silently lost its session on the very next request.

## Decision

All three auth cookies (`sb_at`, `sb_rt`, `sb_session`) default to the CHIPS posture:

```
SameSite=None; Secure; Partitioned; HttpOnly
```

controlled by `EMBEDDED_COOKIES = process.env.AUTH_COOKIE_EMBEDDED !== '0'` (`src/lib/env.ts`).

- Embedded (`1`, **default**): works inside cross-site iframes; partitioning keeps each top-level site's cookie jar isolated.
- First-party (`0`): `SameSite=Lax`, refresh cookie scoped to `/api` — for standalone hosting. `Secure` derives from `x-forwarded-proto`.

## Why the default is ON

The sandbox regenerates `.env` between sessions; a Task 9.3 incident showed an env-only switch silently reverting and re-breaking login. Defaulting ON in code makes the embeddable case work with zero configuration; first-party deployers opt out explicitly (documented in SECURITY.md / .env.example).

## Consequences

- CSRF protection rests on the BFF's origin/`sec-fetch-site` check for mutating methods (route.ts) rather than SameSite — that check is mandatory and tested.
- First-party deployments must set `AUTH_COOKIE_EMBEDDED=0` to regain browser-native CSRF friction.
