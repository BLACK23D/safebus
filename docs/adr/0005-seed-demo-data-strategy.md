# ADR-0005: Demo data strategy — idempotent boot seed with delete-and-reseed discipline

- Status: Accepted (2026-09)
- Deciders: engineering (Tasks 2, 9.1, QA-VERIFY, 9.3)

## Context

Every stakeholder review needs a believable, *time-relevant* dataset: today's trips, correct ETAs, live-looking positions. A QA pass also once destroyed a real self-registered user account during a reset — an acceptable sandbox loss, but it must be an explicit, disciplined action.

## Decision

1. `seed.ts` runs at backend boot **only in non-production** and is **idempotent** (skips if already seeded).
2. Seed dates are computed **relative to first-run day** (`atTime` helpers) so "today's Morning pickup 07:15–08:00 on B-101" is always demoable.
3. Reset discipline: stop backend → `rm data.db*` → restart (re-seeds with fresh relative dates). Treat as destructive — it deletes self-registered accounts — and record it in the worklog when done.
4. Demo credentials are seeded bcrypt-hashed; the login page exposes one-click fill **only** when `NEXT_PUBLIC_DEMO_MODE=1` (issue #3) — production builds ship no credential material.

## Consequences

- Anyone can reproduce a full demo in <60 seconds.
- Self-registration in the sandbox is disposable by design; real deployments disable the seed (`NODE_ENV=production`).
