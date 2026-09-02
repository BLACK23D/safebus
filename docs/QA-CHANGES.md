# SafeBus PWA — QA Fix Changelog

**Companion to:** `docs/QA-FINDINGS.md` (the full pre-launch review).
**Passes:** QA review (browser + two code audits) → engineer fix pass (Task `QA-FIX`) → independent
re-verification (Task `QA-VERIFY`). All changes are UI-side; the API contract, BFF auth/cookie system,
middleware role guards, and the backend mini-service are untouched.

---

## Blockers resolved

| ID | Issue | Change made | Verified |
|---|---|---|---|
| B1 | Emergency report dialog crashed (`(children ?? []).map is not a function`) — `/students?parent=me` returns the `{items}` envelope, code expected an array. Parents could not report emergencies. | `src/features/emergency/emergency-page.tsx` now unwraps with the envelope-tolerant `listOf` helper (same fix pattern as the profile page); other `/students` call sites regression-checked. | Browser: dialog opens, report submitted → `POST /api/emergency 201`. |
| B2 | Info banners unreadable in dark mode (≈1.29:1) — `brand-950` token missing from the Tailwind v4 `@theme` scale, so `dark:bg-brand-950/30` never generated. | Added `--color-brand-950: #06224d` to `src/app/globals.css`. | Browser screenshot (dark `/login?reason=signin`): banner clearly readable; computed pair ≈9.2:1. |

## Majors resolved

| ID | Issue | Change made |
|---|---|---|
| M1 | Global error boundary rendered raw exception text to users | `src/app/error.tsx`: friendly copy always; raw message only in a collapsed `<details>` in dev. |
| M2 | White on emerald-500/600 below AA | Arrived-stop chip → `bg-emerald-600`; confirm buttons (emergency resolve/cancel, edit-request approve) → `bg-emerald-700 hover:bg-emerald-800`. |
| M3 | White on rose-500 unread badges (3.67:1 at 9–10px) | All unread badges → `bg-rose-600` (4.70:1). |
| M4 | `text-emerald-600` on white below AA | → `text-emerald-700 dark:text-emerald-400` across shell/settings/attendance/tracking. (One reported site was already rose-600 and passing — left as-is, documented.) |
| M5 | `text-amber-600` below AA incl. icons | → `text-amber-700 dark:text-amber-400` in history, schedule, driver dashboard, tracking. |
| M6 | Amber badge tint pair 4.48:1 (marginal) | STATUS_TONES amber → `text-amber-800 dark:text-amber-300`; one-off usages aligned. |
| M7 | `opacity-80` on 11px KPI chip labels | Removed; labels run at full tone. |
| M8 | Radix nested-modal scroll-lock leak could freeze all clicks (body stuck `pointer-events:none` + `data-scroll-locked`) | New `src/components/layout/scroll-lock-cleanup.tsx` mounted in the app shell: on pathname change / visibility change / 1s interval, releases stuck body lock only when no dialog exists. Resource-table dialogs reviewed to close via state before unmount. |
| M9 | 24h vs 12h time formats across roles | Deterministic `formatTime`/`formatTimeRange` (24h `HH:mm`) in `src/features/trips/shared.ts`; adopted by driver dashboard, trip console, chat timestamps, admin dashboard, admin trips table. |
| M10 | Same socket state labelled three ways | `SOCKET_STATUS` + `socketStatusLabel()` + `useOnline()` in the socket provider; "Live / Reconnecting… / Offline" vocabulary used by shell, tracking, schedule, settings, driver dashboard. |
| M11 | "Upstream 502"-style fallbacks in page error states | `src/lib/api/server.ts`: human fallback ("The server is having trouble right now…"). Confirmed live during verification when the backend was briefly down. |

## Minors resolved (batch)

- **Copy:** unified "Sign out" (was Log out/Sign out mix); parent-facing copy now says "child/children" (login subtitle "…your child's ride", onboarding, register); pluralization guards ("1 minute away", "1 record", "1 stop"); one "Pickup"/"Drop-off" label map; grade placeholder `e.g. 3`; tab titles no longer double the brand ("Schools", "Student profile"); bottom-nav "Alerts" → "Notifications"; single "Select…" placeholder; dev jargon removed ("(backend-validated)" hints, offline "safety writes" copy); emergency resolve/cancel dialog wording ("Resolve/Cancel this emergency alert?"); edit-request summaries show "Grade change"/"Name change"; role-neutral PWA shortcuts (Live tracking / Dashboard / Notifications / Emergency); login banner "Incorrect email or password."; sandbox note on verify-email.
- **Contrast & a11y:** `text-emerald-700/400` for small emerald text; status dots/icons → `-600`; primary button hover → `bg-brand-600` (light) keeping AA in both modes; light `--muted-foreground` darkened to `oklch(0.52 0 0)`; onboarding steps wrapped in a `bg-card` panel off the aurora; brand icon tints got `dark:text-brand-400`; schematic map — route line opacity ≥0.7 in dark + arrived dot `#047857`; touch targets raised to 44px (top-bar bell/account, dialog close, banner buttons, tel: link); mobile account menu ported to Radix `DropdownMenu` (Escape/outside-click); `suppressHydrationWarning` on auth password inputs (hydration warnings were caused by extension attribute mutation, not app state).
- **Housekeeping:** inert `tailwind.config.ts` deleted (Tailwind v4 uses the `@theme` tokens in globals.css); missing `--destructive-foreground` token added; unused toast shims (`toast.tsx`, `toaster.tsx`, `hooks/use-toast.ts`) removed.

## Deliberately not changed

- **Input/border boundary contrast (finding #19):** 1.26–1.47:1 borders are the default shadcn look; inputs have labels, ring focus and placeholder contrast. Hardening borders would visibly change the design language — deferred as a product decision.
- **Ops note (#28):** sandbox-only (OOM reaping of long-lived processes, Turbopack cache 404s after an OOM kill). Recovery documented in `worklog.md`; single-browser-session discipline advised on the 4 GB sandbox.

## Verification evidence

- `bun run lint` → 0 problems; `tsc --noEmit` → 0 errors in `src/`; manifest JSON valid; `brand-950` present in compiled dev CSS.
- Browser re-verification after the fix pass (fresh sessions, gateway :81):
  - Login → parent `/track`: **Live** socket chip, children, scheduled trip; dark mode screenshot-clean.
  - `/emergency` → Report dialog opens → Medical report submitted → **201**.
  - Dark `/login?reason=signin` banner readable (screenshot); subtitle shows the new "child's ride" copy.
  - Logout (now "Sign out") works; role bounce still guards `/login` for authenticated users.
  - Backend reseeded to pristine demo state after QA (2 trips today, 1 pending edit request, INV-DEMO-2025 invite); final smoke: demo login → `/track` → Live + Scheduled.
- Trip lifecycle, lockout (423 + countdown), force-end safeguard (409), admin CRUD, edit-request approve→apply,
  and role guards were all verified working during the review itself (see `docs/QA-FINDINGS.md` "Verified working").
