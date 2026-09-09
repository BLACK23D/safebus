# Security Policy

SafeBus handles children's location and attendance data. We treat that as safety-critical infrastructure.

## Reporting a vulnerability

**Do not open a public issue for security problems.**
Email **deniskelvinmurithi@gmail.com** (or GitHub Security Advisories on this repo) with reproduction steps. You will get an acknowledgement within 48 hours and a fix timeline within 7 days.

## Secret policy

| Rule | Detail |
|---|---|
| No secrets in git, ever | `.env` is gitignored; the template lives in `.env.example`. The published history was rewritten once (2026-09) to purge runtime artifacts — keep it clean so it never needs it again. |
| Server-only config | Server secrets are read via `src/lib/env.ts` and backend `process.env`. **Never** prefix a secret with `NEXT_PUBLIC_` — that ships it to browsers. |
| JWT signing | `JWT_SECRET` must come from the environment (≥32 chars). The backend refuses to boot in production without it. Rotate by redeploying; sessions re-login transparently. |
| Demo mode | Demo credentials/quick-fill exist **only** when `NEXT_PUBLIC_DEMO_MODE=1` (sandbox/preview). Production builds must leave it unset. |

## Cookie & embedding modes

Auth cookies (`sb_at`, `sb_rt`, `sb_session`) support two postures, selected by `AUTH_COOKIE_EMBEDDED`:

- `1` *(code default)* — **embedded mode**: `SameSite=None; Secure; Partitioned` (CHIPS). Required when the app is rendered inside a cross-site iframe (e.g. preview panels). Partitioned cookies keep each top-level site's jar separate.
- `0` — **first-party mode**: `SameSite=Lax`, refresh cookie scoped to `/api`. Use for normal standalone hosting. Derive `Secure` from `x-forwarded-proto`.

See [ADR-0001](docs/adr/0001-chips-embedded-cookies-default.md) for the rationale and incident history.

## Data handling expectations

- All SQL is parameterized; all object access is re-authorized server-side per request.
- The service worker never caches API responses, authenticated HTML, or non-GET traffic; there is no Background Sync — safety writes can never be silently replayed.
- Child PII (names, codes, positions) is minimized in socket payloads; see issue tracker for the current data-minimization workstream.

## Scope notes for deployers

The reference backend (`mini-services/safebus-backend`) ships with permissive CORS and a boot-time demo seed for sandbox use. Before any real deployment: set `ALLOWED_ORIGIN`, disable the seed (`NODE_ENV=production`), and put the backend behind the BFF only.
