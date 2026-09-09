# SafeBus — Production-Readiness QA Report

**Date:** 2026-09-09 · **Scope:** full platform (Next.js 16 web/BFF, Bun reference backend, PWA layer, repo/docs) · **Verdict: ✅ READY FOR CUSTOMER USE (sandbox/demo), with a documented production-deployment checklist**

---

## 1. Executive summary

A five-agent audit (backend, frontend/UI, security, PWA/perf, repo/docs) surfaced **4 blockers, ~15 majors, ~20 minors**. Every finding was filed as a GitHub issue and fixed through review-gated PRs:

| Wave | PR | Issues closed |
|---|---|---|
| Repo foundation (README/LICENSE/CI/ADRs/history purge) | [#25](https://github.com/BLACK23D/safebus/pull/25) | #4, #23, #24 |
| Security core | [#26](https://github.com/BLACK23D/safebus/pull/26) | #1, #2, #5, #6, #7, #9, #10 |
| Backend reliability + config | [#27](https://github.com/BLACK23D/safebus/pull/27) | #8, #11, #12, #13, #14, #15 |
| UI polish | [#28](https://github.com/BLACK23D/safebus/pull/28) | #3, #16, #17, #18, #19 |
| PWA hardening | [#29](https://github.com/BLACK23D/safebus/pull/29) | #20, #21, #22 |

**24/24 issues closed · CI green on every merged wave · 0 open issues.**

## 2. Blockers — all resolved with live verification

| ID | Risk | Fix | Evidence |
|---|---|---|---|
| #1 | Hardcoded JWT secret → token forgery | Env-based secret, fail-fast in production | Boot log + backend `.env.example` |
| #2 | Cross-account session mixing via unkeyed refresh single-flight | Per-refresh-token keyed map; explicit refresh POSTs intercepted into the same flight | curl: two-account isolation + contract §14 |
| #3 | Demo superadmin credentials in client bundle | `NEXT_PUBLIC_DEMO_MODE` gate — production bundles carry no credentials | Browser: demo block only renders with flag |
| #4 | `.env`/DB blobs in published history | `filter-branch` rewrite + force-push (11 commits, zero collaborators) | `git log --all -- .env` → empty |

## 3. Verification matrix

| Check | Result |
|---|---|
| `bun run lint` (every wave) | 0 problems |
| `bunx tsc --noEmit` (every wave) | 0 errors |
| GitHub Actions CI (lint + tsc + backend syntax) | ✅ green on all merged PRs |
| Parent golden path (`/track`) | Live socket + today's trip (Morning pickup B-101) + live map, 0 console errors |
| Driver golden path (`/driver`) | Live + 2 scheduled trips, 0 console errors |
| Admin golden path (`/dashboard`) | Fleet roster + live status counts, 0 console errors |
| Auth flows | login / refresh rotation (grace window) / logout revocation / replay-revocation — curl-verified |
| Socket security | scoped 60s token: REST → 401, handshake → connected (live-verified) |
| Backend-down resilience | BFF returns clean 502 envelope (live-verified, no raw 500) |
| PWA | SW v3 controlling (shell-v3/assets-v3), manifest/icons 200, `/offline` precached, no first-install reload, consent-gated updates intact |
| Graceful shutdown | SIGTERM → io.close → server → WAL checkpoint → db.close (log-verified) |
| History hygiene | No `.env`/DB/log blobs reachable; secret scan clean; `.env.example` accurate |

## 4. Security posture (post-fix)

- Tokens never touch browser JS; refresh rotation with theft detection (family revocation + 90s benign-race grace).
- Server-side object-level authorization on every route (audit found no IDOR); UI guards are UX only.
- CHIPS embedded cookies by default (ADR-0001) with first-party opt-out and `x-forwarded-proto` Secure derivation.
- Rate limiting per account+IP on auth; spoof-resistant client IP; endpoint limiters on refresh/invite/verify.
- Socket rooms minimized: school room staff-only — parents receive only their children's trip events.
- Security headers (CSP frame-ancestors, nosniff, Referrer-Policy, HSTS); `X-Powered-By` disabled.
- Per-trip rotating pickup codes with server-enforced 30s reveal window; verification closed on finished trips.

## 5. Production deployment checklist (before real users)

1. `JWT_SECRET` (≥32 chars) set for the backend — boot refuses otherwise.
2. `ALLOWED_ORIGIN` pinned to the deployment origin (REST + Socket.IO).
3. `NEXT_PUBLIC_DEMO_MODE` **unset** (no demo credentials in the bundle); `runSeed()` disabled via `NODE_ENV=production`.
4. `AUTH_COOKIE_EMBEDDED=0` for first-party hosting (CHIPS default is for iframe embeds — ADR-0001).
5. Tighten CSP `frame-ancestors` to the deployment origin.
6. Real email delivery for reset/verification (sandbox auto-verifies, tokens are not emailed).
7. Consider a managed Postgres adapter (roadmap) and at-rest encryption for location history per child-privacy counsel (COPPA/GDPR-K).

## 6. Known limitations & recommended backlog (tracked as future issues)

- **Automated test suite:** the platform sandbox policy prohibited committing test code; quality gates are CI lint+tsc, a curl API verification matrix, and scripted browser E2E passes (evidence above). Recommendation: add Playwright E2E + vitest unit coverage post-sandbox.
- Client-side zod/react-hook-form on auth forms (server-side validation exists) — audit FE-5.
- Chart tooltip dark-mode theming via shadcn ChartContainer — FE-9; theme radiogroup arrow-key support — FE-10; `onRowClick` keyboard pattern — FE-12.
- Breached-password denylist + argon2id upgrade (bcrypt cost already 12) — SEC-12.
- Production build was not executed inside this sandbox (platform constraint: the dev server serves the live preview; `next build` would take it down). CI + tsc validate the compile path; run `bun run build` on the deployment host.

## 7. Verdict

The application is **functionally complete, hardened, documented, and reproducibly verifiable**: three-role golden paths pass with zero console errors, the security model is enforced server-side and live-tested, the PWA installs and self-heals across deploys, and every engineering decision is traceable through ADRs, the worklog, commit history, and the issue/PR record. **Recommended for onboarding in the sandbox/demo environment now, and for production after executing the §5 checklist.**
