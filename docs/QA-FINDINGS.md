# SafeBus PWA — Pre-Launch QA Findings Report

**Date:** 2026-09-02 · **Auditor:** QA (orchestrator) · **Engineer:** to action before go-live
**Scope:** visual design, text/content, functionality (E2E incl. edge cases), color & contrast (WCAG AA).
*(Texture/materials section not applicable — web app.)*

**Method:** two parallel code audits (all user-facing strings; all color tokens with computed WCAG ratios)
plus a full browser pass (desktop 1280×800 + mobile 390×844, light + dark) covering public/auth flows,
parent suite, the complete driver trip lifecycle, admin/superadmin CRUD, role guards, and error states.
Contrast figures were computed from the actual theme tokens (relative-luminance formula), not estimated.

**Verified working (no action):** onboarding (3 resumable steps), login (field validation, invalid-creds
banner, demo fill), register (client + server validation incl. duplicate email 409), forgot-password
(non-enumerating), claim-invite (invalid token error + successful claim → auto-login → driver home),
reset-password, verify-email; parent /track (Live socket, child switcher, schematic map, ETA), /attendance
(code reveal with 30s countdown, history, pagination), /schedule, history (trips + routes), /notifications
(mark-all-read PATCH 200 + UI flip), /messages (thread + send E2E), /profile (edit request POST 201 →
admin approve → grade change visible on parent /track), /settings (theme persists); driver lifecycle —
start trip → roster created → code verify (1/3) → 3 wrong codes → 423 lockout with mm:ss countdown →
end trip → 409 "2 students still pending" safeguard with explicit absence consequence → force end →
completed summary (Started/Ended, 1 picked up, 2 absent); admin dashboard KPIs matching live data,
users table + New User dialog, edit-requests approve/reject, students/buses/routes/stops/trips tables,
schools 307-guard for admin, superadmin sees both schools; mobile bottom nav + layouts; PWA (manifest,
icons, privacy-strict SW, offline page — verified in the prior integration pass).

---

## BLOCKERS (fix before go-live)

### B1 — Parents cannot report emergencies: Report dialog crashes the page
- **Location:** `src/features/emergency/emergency-page.tsx:398` (data load) and `:475` (render).
- **Reproduced:** /emergency → "Report emergency" → whole page replaced by the error boundary
  ("Oops … `(children ?? []).map is not a function`").
- **Description:** `http.get('/students', { parent: 'me' })` is typed as an array, but the backend
  returns the list envelope `{ items: [...], total, page, pages }` (contract §0). `children` is set to
  an object; the `(children ?? []).map(...)` in the Select then throws. The identical bug was fixed on
  the profile page (envelope-tolerant `listOf`) during the integration pass but was **missed here**.
  Safety-critical flow, hard crash, affects every parent.
- **Fix:** unwrap envelope-tolerantly — `const rows = await http.get('/students', { parent: 'me' });`
  `const list = Array.isArray(rows) ? rows : (rows as { items?: T[] })?.items ?? [];` (reuse the same
  helper profile-page uses) — and add a regression check for the other `http.get('/students…')` call sites.

### B2 — Info banners unreadable in dark mode (≈1.29:1)
- **Location:** `src/components/auth/auth-parts.tsx:90` (`SoftBanner`) + `src/app/globals.css`
  (`@theme` brand scale).
- **Reproduced:** dark mode → /login?reason=signin — "Please sign in to continue." renders as
  light-blue text on a near-white pill (screenshot captured). Affects every soft banner on
  /login, /register, /forgot-password, /reset-password, /driver/claim-invite in dark mode.
- **Description:** the classes use `dark:bg-brand-950/30 dark:text-brand-200`, but **`brand-950` is not
  defined** in the `@theme` scale (brand-50…900 only), so Tailwind v4 never generates the dark background;
  the light `brand-50/70` surface stays while the text switches to light `brand-200` → 1.29:1 (AA needs 4.5).
- **Fix:** add `--color-brand-950: #06224d;` (and `--color-brand-100/200` audit) to the `@theme` brand scale,
  then verify the pair `brand-200 on brand-950/30-over-card` ≥ 4.5:1 in dark. Prefer also switching to
  `dark:bg-brand-900/30 dark:text-brand-100` if the computed ratio is still marginal.

---

## MAJOR (fix before go-live)

### M1 — Raw exception text is rendered to users by the global error boundary
- **Location:** `src/app/error.tsx:21-23`.
- **Reproduced:** the B1 crash displayed "(children ?? []).map is not a function" as the page copy.
- **Fix:** always render the friendly copy ("Something went wrong on our side — please try again.");
  show `error.message` only in development (`process.env.NODE_ENV !== 'production'`), optionally inside a
  collapsed `<details>` for support.

### M2 — White on emerald-500/600 below AA (multiple)
- `src/features/tracking/tracking-client.tsx:530` arrived-stop chip: white icon on `bg-emerald-500` = **2.54:1**
  (3:1 non-text minimum). → use `bg-emerald-600` (3.77:1) or invert the icon (`text-emerald-950`).
- `src/features/emergency/emergency-page.tsx:342,360` and `src/app/(app)/(admin)/edit-requests/page.tsx:114`:
  white `text-sm` on `bg-emerald-600` = **3.77:1** (< 4.5). → `bg-emerald-700 hover:bg-emerald-800` (5.48:1).

### M3 — White on rose-500 unread badges below AA
- **Location:** `src/components/layout/app-shell.tsx:139,206`, `src/features/messaging/messages-page.tsx:128`.
- 9–10px bold white on `bg-rose-500` = **3.67:1** (< 4.5 at that size). → `bg-rose-600` (4.70:1) or `bg-rose-700` (6.29:1).

### M4 — emerald-600 status text on white below AA
- **Location:** `app-shell.tsx:192` ("Live" chip), `settings/page.tsx:129,139`, `attendance-client.tsx:285`,
  `emergency-page.tsx:251`, `tracking-client.tsx:544` — 3.77:1.
- **Fix:** `text-emerald-700 dark:text-emerald-400`.

### M5 — amber-600 status text below AA (incl. icon-only usages)
- **Location:** `history-list.tsx:136`, `schedule/page.tsx:135`, `driver-dashboard.tsx:149`,
  `tracking-client.tsx:426` — 3.19:1 on white, 2.95:1 on amber tint; also the pickup icons.
- **Fix:** `text-amber-700 dark:text-amber-400` (5.02:1 / 4.65:1 on tint).

### M6 — amber-700 on `bg-amber-500/15` badge tint marginally below AA
- **Location:** `components/ui/kit.tsx:114-116` (STATUS_TONES used by every StatusBadge), plus
  `dashboard-client.tsx:274`, `tracking-client.tsx:552`, `notifications/page.tsx:59`,
  `register-sw.tsx:88`, `settings/page.tsx:145` — **4.48:1**.
- **Fix:** `text-amber-800 dark:text-amber-300` (6.31:1) or drop the tint to `/10` (4.65:1). Apply the
  same -1-step-darkening review to the STATUS_TONES table as a whole.

### M7 — `opacity-80` on 11px dashboard chip labels
- **Location:** `src/features/admin/dashboard-client.tsx:322` — drops emerald label to ≈3.35:1, amber ≈3.5:1.
- **Fix:** remove `opacity-80`; pair with M6 (amber-800 label).

### M8 — Radix nested-modal scroll-lock leak can freeze the whole app
- **Reproduced:** mid-session `document.body` was left with `pointer-events: none` and
  `data-scroll-locked="1"` (observed again as counter "2" with Dialog+Select nesting) **with no dialog
  open** → every real click/tap silently dead until a full reload. Trigger is closing out of order
  (e.g. Escape pressed into nested Radix layers — Dialog wrapping a Select — or unmount during the close
  animation). Clean single flows release correctly; the leak is intermittent but was observed twice in
  one QA session and explains "app randomly stops responding to clicks".
- **Fix (defensive):** add a small client component mounted in the app shell that, on `pathname` change
  and on a `visibilitychange`/interval check, clears stuck state when no
  `[role=dialog],[role=alertdialog],[data-state=open]` exists:
  `document.body.style.pointerEvents = ''; document.body.removeAttribute('data-scroll-locked');`.
  Additionally review dialogs that unmount while `open` (resource-table confirm rows) to close via state
  before unmounting.

### M9 — Time format inconsistent across the same data (24h vs 12h)
- Parent surfaces show `07:15` (date-fns `HH:mm` in `tracking-client.tsx:89,451`, `schedule/page.tsx:25`),
  driver/admin/chat show `07:15 AM` (`toLocaleTimeString` in `trips/shared.ts:57`, `chat-thread.tsx:27`,
  `admin/dashboard-client.tsx:105`, `(admin)/trips/page.tsx:21`).
- **Fix:** standardize on one format — export a single `formatTime`/`formatTimeRange` from
  `src/features/trips/shared.ts` (24h `HH:mm` matches the rest of the parent UX and the seed data) and use
  it in driver console, driver dashboard, chat timestamps, admin dashboard, and admin trips table.

### M10 — The same connection state gets three different labels
- "Reconnecting…" (`tracking-client.tsx:346`, `schedule/page.tsx:106`, `settings/page.tsx:140`) vs
  "Connecting"/"Offline" (`app-shell.tsx:197`, `driver-dashboard.tsx:115`).
- **Fix:** one vocabulary — "Live" (connected), "Reconnecting…" (socket down, browser online), "Offline"
  (`navigator.onLine === false`) — extracted to a shared helper used by all five surfaces.

### M11 — Server error fallback shows raw status text in page ErrorStates
- **Location:** `src/lib/api/server.ts:50` — fallback `Upstream ${res.status}` surfaces strings like
  "Upstream 502" inside parent/driver/admin page error cards.
- **Fix:** human fallback: "The server is having trouble right now — please try again in a minute."
  (match `ServerFetchError`'s existing friendly copy).

---

## MINOR (fast-follow; grouped for batch fixing)

### Copy & content
1. **"Log out" vs "Sign out"** — `app-shell.tsx:171,245` vs `profile-page.tsx:259`. Unify on "Sign out".
2. **"student" vs "child"** mixed between public copy ("Sign in to follow your student's ride") and parent
   pages ("your children's bus"). Pick "child(ren)" for parent/public-facing copy; keep "student" in
   admin/driver contexts. At minimum align `edit-requests` subtitle with its own table header.
3. **Pluralization edge cases** — `tracking-client.tsx:227` ("1 minutes away"), `attendance-client.tsx:355`
   ("1 records"), `history-list.tsx:170` ("1 stops"), `resource-table.tsx:507` ("1 total"). Reuse the
   existing `${n === 1 ? '' : 's'}` pattern.
4. **"Dropoff"/"DROP-OFF"** labels drift — `attendance-client.tsx:271,333`, `dashboard-client.tsx:492`,
   `(admin)/trips/page.tsx:55`, `resource-table.tsx:105` vs canonical "Evening drop-off"
   (`trips/shared.ts:52`). Route through one label map ("Pickup" / "Drop-off").
5. **Grade placeholder** `students/page.tsx:27` says `e.g. g3` while data/profile hint use plain numbers —
   change to `e.g. 3` + hint "Single number".
6. **Browser-tab titles double the brand** — `schools/page.tsx:6` ("Schools — SafeBus · SafeBus"),
   `students/[id]/page.tsx:10`. Drop the manual "— SafeBus" suffix; title the detail page "Student profile".
7. **Bottom-nav "Alerts"** collides with emergency "alerts" elsewhere — rename the nav item
   "Notifications" (or rename the admin KPI to "Open emergencies").
8. **Select placeholder drift** — `resource-table.tsx:566` "Select…" vs "Choose…". Unify.
9. **Dev jargon in user copy** — `(backend-validated)` in `reset-password` + `claim-invite` password hints;
   "Safety writes … queued for replay" on `offline/page.tsx:29`. Humanize both.
10. **Emergency resolve/cancel dialog copy** — `emergency-page.tsx:344-371`: noun drift + "Cancel" is
    ambiguous next to the dialog-dismiss convention. "Resolve/Cancel this emergency alert?", buttons
    "Resolve" / "Cancel alert".
11. **Edit-request summary shows raw field key** — `profile-page.tsx:379` ("Ava — grade") →
    "Grade change" / "Name change".
12. **PWA shortcuts are role-wrong** — `public/manifest.webmanifest:20-21` exposes driver-only and
    parent-only shortcuts to everyone. Use role-neutral entries ("Live tracking", "Dashboard",
    "Notifications", "Emergency").
13. **"Invalid credentials"** (login 401 banner) is terse — "Incorrect email or password." reads better
    and matches the field-focused tone used elsewhere.
14. **Sandbox-only:** verify-email page claims an email was sent while the sandbox auto-verifies — add the
    same "Sandbox only" note style used by the demo-credentials panel.

### Visual / contrast / a11y
15. **`text-emerald-500` small text** `attendance-client.tsx:236` (2.54:1) → `-700`/`dark:-400`.
16. **Status dots/icons below 3:1** (`emerald-500`/`amber-500` dots in `app-shell.tsx:196`,
    `tracking-client.tsx:345`, `settings/page.tsx:124,135`) → `-600` variants.
17. **Primary-button hover drops below AA** — `button.tsx:13` `hover:bg-primary/90` = 3.90:1 →
    `hover:bg-brand-600` (5.75:1, on-brand darker-on-hover).
18. **muted-foreground on muted surfaces (light)** 4.34:1 (segmented role labels, demo rows, theme group) →
    darken light token `--muted-foreground: oklch(0.52 0 0)`.
19. **Input/border boundaries 1.26–1.47:1** (WCAG 1.4.11, non-text) — optional hardening
    `--border/--input: oklch(0.6 0 0)` light, `white/35%` dark; note this visibly changes the shadcn look
    (product decision — default: leave, since inputs also have ring focus + labels).
20. **Onboarding body sits directly on the aurora** (`onboarding/page.tsx:96`) — worst-case ≈2.93:1 → wrap
    steps in `bg-card` panel like `AuthShell`.
21. **Brand icon tints without dark variant** (`offline/page.tsx:20`, `register-sw.tsx:77`) → add
    `dark:text-brand-400`.
22. **Schematic map dark-mode graphics** (`live-map.tsx:399-431`) — route line 1.76:1 at dark (bump opacity
    ≥0.7 in dark), white on arrived `#10b981` dot 2.54:1 → `#047857`.
23. **Touch targets < 44px** — mobile top-bar bell + account (40px→`h-11 w-11`), shadcn dialog close X
    (~16px → add `p-2`), `size="sm"` buttons on mobile-visible surfaces (update banner Later/Reload),
    tel: link `min-h-9` → `min-h-11`.
24. **Mobile account menu lacks Escape/outside-click close** (`app-shell.tsx:221-248`) — port to Radix
    `DropdownMenu` or add Escape + backdrop handling.
25. **Hydration attribute mismatch warning on auth pages** (console: `FieldBits` email field) — trace the
    SSR/client prop difference (likely id or default value) and eliminate.

### Housekeeping
26. **Dead config:** `tailwind.config.ts` is inert (Tailwind v4, no `@config`) and its `hsl(var(--…))`
    format would break if ever loaded — delete it or align it with the oklch tokens; add the missing
    `--destructive-foreground` token to globals.css for completeness.
27. **Unused toast shims:** `components/ui/toast.tsx`, `toaster.tsx`, `hooks/use-toast.ts` are unmounted
    (Sonner is the live toaster) — remove to avoid someone styling the wrong system.

### Ops (environment, not app code — documented for the record)
28. Dev server was OOM-killed once during QA (cgroup `oom_kill 1`) — triggered by running several
    headless-browser sessions concurrently; Turbopack's `.next` cache then served spurious 404s until
    cleared. Recovery procedure (works, documented in worklog): clear `.next`, relaunch
    `( cd /home/z/my-project && setsid bun run dev >> dev.log 2>&1 < /dev/null & )`. Keep QA/browser
    sessions to one at a time on this 4 GB sandbox.

---

## Severity totals
| Severity | Count |
|---|---|
| Blocker | 2 |
| Major | 11 |
| Minor | 27 (+2 housekeeping, +1 ops note) |

**Recommended go-live gate:** all Blockers + M1–M8 fixed and re-verified in the browser; M9–M11 strongly
recommended (small, contained); minors batch into the first fast-follow.
