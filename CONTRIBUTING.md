# Contributing to SafeBus

Thanks for your interest in making the school run safer. This document keeps contributions predictable.

## Ground rules

1. **Conventional Commits.** Every commit message: `type(scope): summary` — types: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `ci`. Bad history is bugs waiting to happen.
2. **One bounded context per PR.** Declare the files/directories you intend to touch in the PR description. Do not reach across the BFF ↔ backend ↔ UI boundaries in one change unless the change *is* the contract change.
3. **Contract changes are explicit.** [`docs/CONTRACTS.md`](docs/CONTRACTS.md) is the frozen API/socket surface. If code must deviate, update the contract **in the same PR** and call it out in the description. Code wins over docs only when docs are updated with it.
4. **Track everything.** Open an issue before a non-trivial change; link it from the PR (`Closes #N`). PRs are squash-merged after CI is green.
5. **The worklog is append-only.** If you are an automated agent or pairing session, append your record to [`worklog.md`](worklog.md) (never overwrite). Human contributors may use normal commits instead.

## Local development

```bash
bun install
cp .env.example .env
bun run dev                              # frontend, :3000
cd mini-services/safebus-backend && bun run dev   # backend, :5000
bun run lint                             # eslint
bunx tsc --noEmit                        # typecheck (app scope)
```

## Before you open a PR

- [ ] `bun run lint` → 0 problems
- [ ] `bunx tsc --noEmit` → 0 errors
- [ ] Golden path hand-checked in the browser: parent `/track` shows **Live** socket + today's trip; driver `/driver` lists scheduled trips
- [ ] No secrets, tokens, or DB files committed (see [`SECURITY.md`](SECURITY.md))
- [ ] Docs/contract updated if behavior changed

## Code style

- TypeScript strict; no `any` unless quarantined with a comment
- shadcn/ui components over bespoke UI; Tailwind tokens over hardcoded hex
- Server-side authorization is mandatory for every new route — UI checks are UX only
