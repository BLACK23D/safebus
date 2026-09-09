# ADR-0004: Reference backend is a Bun + Express mini-service on SQLite

- Status: Accepted (2026-09)
- Deciders: engineering (Task 2; revisited at audit)

## Context

The product needs a runnable reference API with realtime, auth, and trip-lifecycle logic that deploys anywhere (including constrained sandboxes) without external infrastructure.

## Decision

- `mini-services/safebus-backend` — Bun runtime, Express-compatible routing, **`bun:sqlite` (WAL)** as the system of record; Socket.IO server attached to the same HTTP server.
- API shape follows [`docs/CONTRACTS.md`](../CONTRACTS.md) (Mongo-like envelope, entities carry dual `id`/`_id` for client compatibility). Code may deviate from the contract only by updating it in the same PR.
- Every router opens with `requireAuth`; object-level authorization is re-derived per request (no trusting client-provided scope).
- Boot-time responsibilities: idempotent demo seed (non-production), `CREATE INDEX IF NOT EXISTS` for hot foreign keys, locations retention job, graceful shutdown (`SIGTERM`/`SIGINT` → close io → close server → WAL checkpoint → close db).

## Why not Postgres/Prisma (yet)

Single-process SQLite/WAL covers the reference deployment with zero ops. The data access layer is centralized in `lib/db.ts` precisely so a Postgres adapter can land behind the same interface at multi-school scale (roadmap). The Next.js side never touches the DB directly — it only speaks the HTTP contract through the BFF.

## Consequences

- Write concurrency is process-serial — acceptable for a school; documented scaling path above.
- Raw SQL must remain parameterized everywhere (audit-verified; CI has no SQL lint — keep the discipline in review).
