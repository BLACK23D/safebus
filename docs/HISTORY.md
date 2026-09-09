# Engineering history — commit ↔ worklog map

The repository's first nine commits were created by sandbox automation with UUID message bodies. Nothing was lost: every change is mapped to a task in the append-only [`worklog.md`](../worklog.md). This file preserves that mapping after the 2026-09 history rewrite (which purged runtime artifacts — `.env`, SQLite DBs, logs — from history; see issue #4).

| Rewritten commit (current) | Original message | Worklog task | Content |
|---|---|---|---|
| `43580bd` | `Initial commit` | (bootstrap) | Sandbox scaffold: `.gitignore`, platform scripts |
| `78aaaac` | `88e53244…` | Task 0–1 | Scaffold → Next 16 shell, design tokens, login/register/onboarding pages |
| `09bc5a6` | `727d336d…` | Task 2 | Reference backend (Bun+Express+SQLite), auth, seeds, demo accounts |
| `88c3ef2` | `489731b9…` | Task 3 | Session hardening, middleware guards, auth flows, verify-email/reset |
| `b6e69d8` | `1b83a95c…` | Task 4 | Parent tracking surface: live map, child switcher, notifications |
| `bbea1ae` | `ed04009b…` | Task 5 | Driver console: trip lifecycle, roster verification, GPS broadcast |
| `977507a` | `b2e171ae…` | Task 6–7 | Admin/fleet CRUD, superadmin schools, messaging, emergency, PWA layer |
| (rewritten) | — | Task 8 | Service worker + manifest + offline (see `docs/history/8-pwa-layer.md` — superseded by ADR-0003) |
| `919010f` | `b2e171ae…` (later UUIDs) | Tasks 9–9.5, QA | Contract freeze, embedded cookies, SW v2, compile gate — see worklog |
| `94f8630` | `chore(repo): untrack runtime artifacts…` | Task 10.1 prep | Hygiene: untrack .env/db/logs, .gitignore hardening, .env.example |
| `52b17b5` | `docs(worklog): record Task 10.1 audit…` | Task 10.1 | Full-stack production-readiness audit record |
| → main | Conventional Commits | Task 10.2+ | Foundation, security, backend, UI, PWA fix waves (PRs close issues) |

Early build-stage records live in [`docs/history/`](.):
- [`2-backend-builder-2.md`](2-backend-builder-2.md) — backend construction record (Task 2)
- [`5-driver-features.md`](5-driver-features.md) — driver console record (Task 5)
- [`8-pwa-layer.md`](8-pwa-layer.md) — PWA v1 record (**superseded** by ADR-0003 / SW v2+)

From this point on, commit messages follow [Conventional Commits](../CONTRIBUTING.md) and every fix PR closes its tracking issue.
