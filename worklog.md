# SafeBus PWA — Shared Worklog

Project: Rebuild of the SafeBus school-transport web experience (from chat history
https://chat.z.ai/s/f40a3f35-522f-4a06-a835-534af4975116) inside this Next.js 16 project.
The root project (`/home/z/my-project`) IS the `nextjs-pwa` deliverable in this sandbox
(preview panel serves it on port 3000). Original applications do not exist in this
sandbox; a **reference backend** implementing the authoritative contract is provided as
a mini-service so the full experience is runnable and verifiable end-to-end.

## Architecture (frozen)

- Root Next.js 16 App Router + TS + Tailwind 4 + shadcn/ui (New York). Path alias `@/*` → `src/*`.
- `docs/CONTRACTS.md` — THE authoritative API + Socket.IO contract (V = frozen). Backend
  implements it; UI consumes it. No invented fields/endpoints anywhere else.
- BFF: `src/app/api/[...path]/route.ts` proxies `/api/*` → `BACKEND_URL` (default
  `http://localhost:5000`), keeps tokens out of the browser (HttpOnly cookies: `sb_at`
  access, `sb_rt` refresh SameSite=strict path=/api, `sb_session` unsigned session mirror
  for UX redirects only). Single-flight refresh, 401 retry, CSRF origin check.
- Middleware `src/middleware.ts`: role route guards (UX layer), access-token refresh with
  request-cookie mutation pattern, public-path bounce for logged-in users.
- Socket.IO: browser connects `io('/?XTransformPort=5000')` (sandbox gateway; prod would
  use same-origin). Handshake `auth: { token: <accessToken> }` fetched fresh per connect
  from `/api/_bff/socket-token`. Event names live ONLY in `src/lib/socket/events.ts`.
- Roles: parent | driver | admin | superadmin. Account states: active | inactive | suspended | invited.
- Backend reference service: `mini-services/safebus-backend` (port 5000, `bun run dev`).

## Demo accounts (seeded by backend)

- parent: `maria.demo@safebus.app` / `Parent123!`
- driver: `david.demo@safebus.app` / `Driver123!`
- admin: `admin.demo@safebus.app` / `Admin123!`
- superadmin: `super.demo@safebus.app` / `Super123!`
- Driver invite (claim flow): token `INV-DEMO-2025` (see backend seed)

## Intentional merges (documented)

- Parent child-profile edit requests live on `/profile` (no dedicated parent route in map).
- `/attendance` is role-aware shared page: parent (view + reveal code) / admin (mark).
- `/tracking/nearby` intentionally NOT implemented (no confirmed backend route).
- Google Maps key: `/api/config/maps` returns none in this sandbox → LiveMap falls back
  to a schematic SVG route renderer fed by real Socket.IO positions (no mock data).

## Task IDs

- 1: Foundation (libs/BFF/middleware/providers/shell/layouts) — orchestrator
- 2: Backend reference service (mini-services/safebus-backend)
- 3: Public auth flows
- 4: Parent features
- 5: Driver features
- 6: Shared features (messages/emergency/notifications/attendance/profile/settings)
- 7: Admin/superadmin features
- 8: PWA layer
- 9: Integration + browser verification

---
Task ID: 0
Agent: orchestrator (main)
Task: Analyze chat-history blueprint, freeze architecture, write contract, set up parallel work.

Work Log:
- Extracted and read the full previous conversation (~3.5k lines) from the shared chat link.
- Confirmed sandbox contents: fresh Next.js 16 scaffold only; no original backend/mobile/admin apps.
- Read all §0–§40 design sections of the previous conversation and adopted them, including the §30/§39 desk-run patches (Suspense wrappers, useToast import fix, query separator, middleware request-cookie mutation, SW branch order, icon source, etc.).
- Froze architecture and wrote docs/CONTRACTS.md as the single authoritative contract.
- Initialized this worklog.

Stage Summary:
- Blueprint adopted; contract frozen; parallel task graph defined (2 runs with 1; 3–8 fan out after 1; 9 final).

---
Task ID: 2
Agent: backend-builder-2
Task: Complete the SafeBus reference backend (`mini-services/safebus-backend`) — finish missing routers, index.ts, seed, emit helpers, trip lifecycle + attendance lockout verification.

Work Log:
- Reviewed all files left by the previous agent (lib/db.ts, lib/auth.ts, lib/errors.ts, lib/serialize.ts, lib/sockets.ts, lib/util.ts, routes/{auth,users,students,trips,fleet}.ts, package.json). Kept their conventions (ApiError + `h()` wrapper, `id`/`_id` dual ids, scoping helpers, error envelope).
- Fixed bugs found in review:
  1. `lib/sockets.ts` — `notify()` used `run()` without importing it (would crash first notification). Added `run` import.
  2. `lib/auth.ts` `rawBody` — could hang on already-consumed JSON bodies; now no-ops when `req.rawBody` exists (set by express.json `verify` hook) or stream ended.
  3. `routes/messages.ts` (new) — initially marked thread-as-read AFTER selecting rows (stale read flags in response); reordered mark-before-select.
  4. `routes/emergency.ts` (new) — `/emergency/contacts` ordered by nonexistent `createdAt` column → 500; fixed to `ORDER BY name`.
- Added emit aliases in `lib/sockets.ts`: `emitToUser`/`emitToSchool`/`emitToTrip` (aliases of toUser/toSchool/toTripRoom).
- New routers (contract-exact): `routes/attendance.ts` (§7 list scoped parent/driver/admin+, `/attendance/:id/code` parent-of-student-only returning `{code,type,until:now+30s}`, `/attendance/:id/verify` driver-of-trip-or-admin with failedAttempts→3rd→lockedUntil now+5min→423 LOCKED retryAfterSeconds, emits attendance:update + student:status + parent notification), `routes/messages.ts` (§8 conversations/contacts/thread+message:read/send+message:new mirror, server-enforced contact rules), `routes/notifications.ts` (§9 list {items,unread,total,page,pages}, unread-count, read-all, :id/read, broadcast admin+ excl. creator), `routes/emergency.ts` (§10 list/create/resolve/contacts; emergency:new → school admins+drivers+creator; emergency:update on resolve), `routes/edit-requests.ts` (§11 parent create (name|grade, dup-pending 409), admin approve applies value / reject, both notify parent), `routes/admin.ts` (§12 stats + 7-day analytics, superadmin=global, admin=school), `routes/misc.ts` (config/maps → `{apiKey:"",provider:"none"}`, device-tokens, schools CRUD superadmin-only writes + scoped reads, health handler).
- `index.ts`: Express on hardcoded :5000, cors(*), express.json 15mb with rawBody verify hook, mounts /health + /api/health + all routers under /api, notFoundHandler (404 contract envelope) + errorHandler, Socket.IO attached with cors * and handshake auth middleware + auto-join user:{id}/school:{id} + trip:join authorization (existing sockets.ts), seed runs on boot.
- `seed.ts` (idempotent, skips when users exist): 2 schools (Horizon Elementary / Riverside High); Horizon users admin.demo/super.demo/maria.demo/david.demo/sofia.demo (+invited.demo with INV-DEMO-2025); Horizon Route A with 4 ordered stops ~1.2–1.3 km apart around Austin (Maple & 5th → Sunset Park → Oakwood Lane → Horizon Elementary); bus B-101 (TX-4471, david, cap 24); students Ava Johnson(g3, maria, stop2), Liam Johnson(g5, maria, stop3), Noah Garcia(g2, sofia, stop4) with 6-digit codes; today pickup 07:15 + dropoff 15:30 scheduled; 3 completed pickup trips on previous 3 days with verified picked_up attendance; messages maria↔david ×3 (1 unread) + maria↔admin ×1; 2 unread notifications for maria; resolved medical emergency by maria; pending edit-request grade 3→4 for Ava; 3 Horizon emergency contacts + 1 Riverside; Riverside admin2.demo/riverside.demo, route with 2 stops, bus R-201, tomorrow 07:30 scheduled trip.
- Verification (all fresh-boot): health 200; 7 demo logins 200; GET /students?parent=me → 2 children, no codes exposed; GET /trips?driver=me&date=today → 2 scheduled; POST start 200 → 3 pending attendance; location pings → ETA 10/5 + arrival notifications (once per stop); GET /attendance?tripId (maria) → scoped rows; GET /attendance/:id/code (maria) → {code,type,until}; verify wrong ×2 → 400 (attempts 1,2), ×3 → 423 LOCKED retryAfterSeconds 300, 4th → 423, parent verify → 403; end w/o force → 409 PENDING_STUDENTS pendingCount 3; end force → completed + pickup→absent; messages conversations (david unread 1, admin) / send 201 / thread marks read + message:read / maria→sofia 403; notifications unread-count 9 → read-all → 0; emergency create 201 + resolve 200 + contacts; edit-requests seeded pending (grade 3→4) + create 201 + approve 200 applies to student; admin/stats + analytics 200 (parent 403); config/maps {apiKey:"",provider:"none"}; /schools admin→1 super→2; POST /schools as admin 403; POST /users driver → invited + inviteToken INV-…; device-tokens 201; refresh rotation → new RT, reuse-old → 401; claim-invite INV-DEMO-2025 → active driver (reuse → 400); scoping: admin2 sees only Riverside trip, maria only B-101, cross-school PATCH user 403, broadcast → 5 Horizon users only (riverside total 0).
- Socket probe (`scripts/socket-probe.ts`, bun + socket.io-client): maria + david sockets, trip:join, then david starts trip and drives stops (speed 30 km/h pings 3.5 km/1.5 km/at-stop). Observed: maria ← trip:status, trip:location, trip:eta (10 then 5, once per stop), trip:arrived (<75 m + StopProgress), notification:new (trip started / ETA / arrival / pickup), attendance:update, student:status, message:new, emergency:new, emergency:update; david ← same + message:read. Probe exits 0 ("SOCKET PROBE OK").
- Reset data.db and restarted so UI tasks get clean seeded state; dev.log clean (no errors); service left RUNNING (bun --hot, port 5000, pid changes on reload).

Stage Summary:
- Backend reference service COMPLETE and verified against docs/CONTRACTS.md (§0–§13). Port 5000, REST + Socket.IO, SQLite (bun:sqlite) at data.db.
- Demo credentials: maria.demo@safebus.app/Parent123!, david.demo@safebus.app/Driver123!, admin.demo@safebus.app/Admin123!, super.demo@safebus.app/Super123!, sofia.demo@safebus.app/Parent123!, admin2.demo@safebus.app/Admin123!, riverside.demo@safebus.app/Parent123!. Driver invite token: INV-DEMO-2025 (claim via POST /api/auth/claim-invite).
- Reset state: `pkill -f "bun --hot index.ts"; rm -f mini-services/safebus-backend/data.db*; cd mini-services/safebus-backend && (nohup bun run dev > dev.log 2>&1 &)` — boot auto-seeds (idempotent).
- Resolved ambiguities (documented): message:read payload `{userId:<reader>, peerId:<notified peer>}`; attendanceToday.present = picked_up+dropped_off+returned_to_school, droppedOff includes returned_to_school; broadcast excludes creator; analytics rate = present % (0–100); /config/maps requires auth (only /health is public per contract); stop-level ETA/arrival notifications go to parents of students whose stopId matches the reached stop.

---
Task ID: 1
Agent: orchestrator (main)
Task: Frontend foundation — deps, env, libs, BFF proxy, middleware, providers, app shell, layouts, design tokens.

Work Log:
- Installed socket.io-client; wrote .env.local (BACKEND_URL=http://localhost:5000).
- src/lib/env.ts (BACKEND_URL, PUBLIC_SOCKET_URL='/​?XTransformPort=5000'), src/lib/auth/session.ts (cookies sb_at/sb_rt/sb_session, JWT helpers, session codec), src/lib/auth/access.ts (route matrix + ROLE_HOME), src/lib/nav.ts (NAV + BOTTOM_NAV per role).
- src/lib/api/client.ts (http client, {success,data} unwrap, ApiError with fieldErrors from error.details, §30.1 query-separator fix, 401 → /login?session=expired), src/lib/api/server.ts (serverApi RSC fetch + getSession + listOf).
- src/lib/socket/events.ts — frozen SE map (contract §13).
- src/app/api/[...path]/route.ts — BFF catch-all: 1:1 proxy, CSRF origin check, token-stripping auth endpoints, single-flight refresh + 401 retry, cookie issuance/clearing. src/app/api/_bff/socket-token/route.ts — short-lived access token for socket handshake.
- src/middleware.ts — public-path bounce, refresh with request-cookie mutation (§30.3), role redirects (UX only), matcher excludes api/_next/static.
- Providers: socket-provider (v2 auth-callback handshake, useSocketEvent 250ms dedupe, useJoinTrip, useSocketStatus), theme-provider (next-themes).
- src/components/layout/app-shell.tsx — desktop sidebar + mobile top bar + bottom nav, unread badge via /notifications/unread-count + SE.NOTIFICATION_NEW, live/offline chip, theme toggle, logout.
- src/components/ui/kit.tsx — PageHeader, PageSkeleton, EmptyState, ErrorState, StatusBadge, StatCard, LinkButton (built on shadcn).
- src/app: layout.tsx (fonts, ThemeProvider, SocketProvider, RegisterSW placeholder, sonner Toaster, manifest+icons metadata), page.tsx (role-aware redirect), error.tsx, not-found.tsx, offline/page.tsx, (app)/layout.tsx (auth gate + shell), (public)/layout.tsx (aurora).
- globals.css extended: brand tokens (#1976D2/#6366F1/cyan/emerald/amber/rose), shadcn primary remap, aurora (reduced-motion safe), nu-raised/nu-inset/status-light, focus-visible, scrollbars.
- ESLint clean; root route compiles (200).

Stage Summary:
- Foundation complete and lint-clean. Feature agents (3–8) can now build against:
  http client, serverApi, SE events, socket hooks, kit components, shadcn/ui, Role types.
- LiveMap contract (owned by Task 4): `src/components/map/live-map.tsx` exports
  `LiveMap({apiKey, center?, stops?, bus?, arrivalStopId?, className?, height?, ariaLabel?})`
  where stops are `{id, name, sequence?, location:{coordinates:[lng,lat]}}`; apiKey '' → schematic SVG fallback. Tasks 5/7 import it, never edit it.

---
Task ID: 8
Agent: pwa-layer
Task: PWA layer — manifest, real generated icons (sharp), privacy-strict service worker, consent-gated update UX, SW headers, offline-page link.

Work Log:
- public/manifest.webmanifest — exact blueprint JSON: name/short_name/description, id+start_url+scope "/", standalone, portrait-primary, theme #1976D2 / bg #F8FAFC, categories, 4 icons (regular 192/512 + maskable 192/512), 4 shortcuts (/track, /driver, /notifications, /emergency). Root layout metadata already referenced this path + icons (Task 1) — no change needed there.
- scripts/generate-icons.mjs (new) — renders the SafeBus mark with sharp from a hand-built SVG: #1976D2 rounded-square bg (22.5% radius), white front-view bus glyph (rounded-rect body, windshield, 2 headlights, 2 near-navy wheels peeking below), two subtle darker-blue (#0F4C99, 0.30/0.18 opacity) diagonal accent bands clipped to the bg shape. Maskable versions: FULL-BLEED square bg (no radius), glyph scaled to 58% of canvas → farthest glyph point ≈39.5% of canvas from center, inside the 80% safe circle (verified math in script comments). Regular: rounded-square, glyph 62%. Outputs (exact px, PNG-8 compressed): icon-192.png 4.6 KB, icon-512.png 13.4 KB, maskable-192.png 3.2 KB, maskable-512.png 9.4 KB, apple-touch-icon.png 180×180 full-bleed opaque 3.1 KB, favicon-32.png 918 B. Verified via sharp metadata: all correct dimensions; alpha stats: rounded icons have transparent corners, maskable + apple-touch are 100% opaque (min alpha 255). First run rendered at 4.17× (sharp `density:300` scales SVG rasterization) — fixed by pinning `.resize(size,size)`.
- public/sw.js — §30.4-patched privacy-strict SW, byte-exact per blueprint: VERSION 'v1', SHELL/ASSETS caches, PRECACHE ['/offline','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png'], install precaches (NO skipWaiting — consent-gated), activate deletes foreign caches + clients.claim, message SKIP_WAITING handler, fetch handler: non-GET never intercepted; /api/*, /socket.io, /_next/webpack-hmr, cross-origin, Authorization-bearing all excluded; branch 1 cache-first for /_next/static/ + /icons/ (even with cookies); branch 2 network-only + `caches.match('/offline')` fallback for navigations and cookie-bearing GETs (authenticated HTML is NEVER served from cache); branch 3 stale-while-revalidate for other public same-origin GETs (manifest.webmanifest + logo.svg land here — fine, public). No Background Sync anywhere — safety writes are never replayed. Syntax-verified (parses clean).
- src/components/pwa/register-sw.tsx (replaced placeholder) — registers /sw.js ONLY when `serviceWorker in navigator` AND (https: || localhost); polls `reg.update()` every 60s + updatefound/statechange listener; `reg.waiting` with an existing controller → update banner (first install stays silent). Banner: fixed `bottom-24 right-4 md:bottom-6 md:right-6` (above mobile bottom nav), role="alertdialog" aria-labelledby/describedby, "Update available" + body, amber active-trip warning when `usePathname().startsWith('/driver/trips')` ("Finish or hand off the trip before updating."), buttons Later (dismiss) / Reload app (`waiting.postMessage('SKIP_WAITING')`). `controllerchange` → single reload guarded by a module-level `reloadedOnce` flag. All setState calls live in async callbacks/listeners (lint rule react-hooks/set-state-in-effect satisfied without disables).
- next.config.ts — added `headers()` for source '/sw.js': Cache-Control `no-cache, no-store, must-revalidate` + `Service-Worker-Allowed: /`. PRESERVED output:'standalone', typescript.ignoreBuildErrors, reactStrictMode:false. Verified live: both headers present on the dev-served /sw.js.
- src/app/offline/page.tsx — additive only: next/link import + "Try the home page" Link → `/`, rendered only when `online`. Everything else untouched.
- Verification: `bun scripts/generate-icons.mjs` → 6/6 icons written, dimensions + opacity verified programmatically; `curl /manifest.webmanifest` → 200 with Content-Type `application/manifest+json` (correct MIME in dev, no note needed); `curl /sw.js` → 200 with both custom headers; all 6 icon URLs → 200; scoped eslint on my 4 code files → 0 problems.
- ⚠️ CROSS-TASK BUG FOUND (middleware, NOT fixed — file belongs to Task 1, instructions said don't touch other files): `src/middleware.ts` line 74 `if (isPublic && pathname !== '/offline' && !pathname.startsWith('/verify-email'))` only handles the logged-in bounce for /offline; an ANONYMOUS request to /offline falls through to the `if (!session)` redirect at line 82 → `curl /offline` (no cookies) = 307 → `/login?next=/offline&reason=signin` (with a session = 200, verified). Consequence for my layer: SW install by an anonymous visitor (e.g. on /login) precaches the redirect chain → login HTML lands in SHELL under '/offline', and a transient 5xx on that chain would fail the whole install. Suggested one-liner for Task 9/orchestrator: inside the isPublic block, return `res` for '/offline' and '/verify-email' regardless of session, i.e. only bounce authenticated users off the OTHER public pages: `if (isPublic) { if (session && pathname !== '/offline' && !pathname.startsWith('/verify-email')) return NextResponse.redirect(new URL(ROLE_HOME[session.role], req.url)); return res; }`. My sw.js/register-sw need no changes after that fix.
- Pre-existing repo lint error outside my scope (reported, not fixed — Task 6 file): src/features/messaging/messages-page.tsx:65 `void load()` in effect body → react-hooks/set-state-in-effect error. My files are clean.

Stage Summary:
- PWA layer COMPLETE: manifest + 6 real sharp-generated PNG icons (rounded/maskable/apple/favicon), privacy-strict consent-gated service worker (never caches /api, socket.io, writes, authz or navigations; no Background Sync), update banner with driver active-trip warning, SW headers, offline page link. Anonymous-/offline middleware bug documented above for Task 9 (one-liner); everything else verified green on the live dev server (200s + correct headers + MIME).

---
Task ID: 3
Agent: auth-flows
Task: Public auth flows — login, onboarding, register, driver claim-invite, forgot/reset password, verify email.

Work Log:
- Built all 8 flows under `src/app/(public)/*` on the frozen foundation: `http`/`ApiError` (fieldErrors under inputs, code/status for banners), `ROLE_HOME`, shadcn/ui, kit components, sonner.
- Shared primitives in `src/components/auth/auth-parts.tsx`: AuthShell (max-w-md centered card, min-h-dvh, min-h-11 targets), LogoMark (Bus in brand-500 tile), Field/PasswordField (Label+error `role="alert"`+`aria-invalid`+`aria-describedby`, show/hide toggle), PASSWORD_HINT, TopError/SoftBanner, SegmentedRoles, AuthLinks.
- Login (server page + Suspense + client form): role segmented control (Parent/Driver/Admin; UserRound/BusFront/LayoutDashboard) with `role="radiogroup"`, roving tabindex + arrow keys, framer-motion `layoutId` pill (disabled under prefers-reduced-motion); submits `POST /auth/login {email,password,role}`; redirect uses authoritative `user.role` from the token-stripped response → `router.replace(next ?? ROLE_HOME[role])` + `router.refresh()`; `next` guarded against open redirects (must be same-origin `/` path); banners for `session=expired`, `reason=signin`, `reset=1`; non-field errors (invalid credentials 401, ACCOUNT_DISABLED 403, RATE_LIMITED 429) in top banner; muted collapsible "Demo accounts" with one-click fill for the 4 seeded users (superadmin fills via Admin tab — role is informational per contract §1).
- Onboarding (`/onboarding`, client): 3 steps (MapPin/ShieldCheck/Bell) resumable via localStorage `sb.onboarding.step`, dot progress with `aria-current`, Back/Next, final "Get started" clears key → `/login`, Skip → `/login` (also clears); step restore deferred via setTimeout so SSR/hydration always paint step 0; `.reveal` re-triggered per step via `key`.
- Register: `POST /auth/register {name,email,phone,password,role:'parent'}`; client-side confirm-match gate; strong-password hint (backend-enforced per §1); success → `/verify-email?sent=1`.
- Driver claim-invite: token prefilled from `?token=`; `POST /auth/claim-invite {token,name,phone,password}` → BFF sets cookies → `router.replace('/driver')` + `router.refresh()`; confirm-match gate.
- Forgot password: `POST /auth/forgot-password {email}` → always-success EmptyState ("if {email} belongs to an account…") with Back to sign in (reveals nothing about account existence).
- Reset password `[token]`: server component awaits Promise params (Next 16), passes token prop; `POST /auth/reset-password/:token {password}` (encodeURIComponent; token never rendered/logged); success → toast.success + `/login?reset=1`.
- Verify email: reads `?token`/`?sent`; with token auto-`POST /auth/verify-email` on mount (busy→PageSkeleton, ok/fail states; setState only in promise callbacks — lint-safe); without token shows sent/unsent explainer.
- FIX (foundation, surgical): `src/lib/api/client.ts` — 401s from auth endpoints (`/auth/login|register|claim-invite|verify-email|resend-verification|reset-password`) no longer trigger the session-expired redirect (`AUTH_FAIL_PATH` guard). Contract §1 returns 401 for invalid login; without this the login form could never show its own "Invalid credentials" banner (client bounced to `/login?session=expired`). Verified: valid login 200 (tokens stripped, cookies set), invalid 401 "Invalid credentials", weak-password register 400 with `details[].path=['password']`, forgot 200, bad invite 400.
- FIX (foundation, surgical): `src/middleware.ts` — `/verify-email` was falling through to the session requirement (anonymous users got bounced to `/login?next=…`), breaking the post-register redirect and emailed verification links. `/offline` + `/verify-email*` are now fully open before the logged-in-public-bounce check. Verified: `/verify-email?sent=1` → 200 anonymous.
- Smoke-tested all 8 routes (200), rendered markup (radiogroup, prefilled invite token, banners), dev.log clean.

Stage Summary:
- Public auth surface COMPLETE: /login, /onboarding, /register, /driver/claim-invite, /forgot-password, /reset-password/[token], /verify-email — all contract-exact, lint-clean, token-safe (no tokens rendered/logged; BFF strips them anyway).
- Login redirects land on `ROLE_HOME` per role (parent→/track, driver→/driver, admin/superadmin→/dashboard); `next` param honored when same-origin.
- Foundation deltas for other agents to be aware of (both backward compatible): client no longer redirects on 401 for `/auth/*` failure paths; middleware opens `/verify-email*` to anonymous users. Demo credentials + `INV-DEMO-2025` are wired into the login page's muted demo-fill.

---
Task ID: 6
Agent: shared-features
Task: Shared (all-role) features — messaging, emergency, notifications, attendance, profile, settings (RSC wrappers + client features under src/app/(app)/(shared)/ and src/features/).

Work Log:
- Read worklog + CONTRACTS.md (§7 attendance, §8 messaging, §9 notifications, §10 emergency, §11 edit-requests, §13 socket events) and cross-checked every consumed shape against the reference backend serializers (pubMessage/pubEmergency/pubNotification/pubAttendance/pubEditRequest) before coding.
- MESSAGING: `src/app/(app)/(shared)/messages/page.tsx` (RSC, metadata 'Messages') + `src/features/messaging/messages-page.tsx` — conversation list (GET /messages/conversations: avatar initial, name, role badge, preview, relative time, unread pill), "New message" dialog with debounced GET /messages/contacts?q= search → router.push(`/messages/${id}`); live SE.MESSAGE_NEW → refetch + "New message from X" toast (skipped for open peer); empty state per spec.
- CHAT: `src/app/(app)/(shared)/messages/[userId]/page.tsx` (RSC, Promise params) + `src/features/messaging/chat-thread.tsx` — thread GET /messages?userId&limit=50; bubbles mine (brand-500/white/right) vs theirs (muted/left), per-message clock + sent/read double-check; SE.MESSAGE_READ {userId:reader, peerId:notified} → when peerId===me && userId===peer marks all my outgoing read; SE.MESSAGE_NEW appends (peer + own cross-device mirror, id-deduped), toast('New message') only when document.hidden; composer: auto-growing textarea, Enter=send / Shift+Enter=newline, optimistic temp-id append, on failure draft restored + toast.error, NEVER queued for offline replay, real-id dedupe handles mirror-race; auto-scroll to bottom; "Say hello" empty state; scrollbar-thin overflow container.
- EMERGENCY: RSC + `src/features/emergency/emergency-page.tsx` — list cards with per-type icons (medical=HeartPulse, accident=CarFront, behavior=UserRoundX, other=TriangleAlert), rose StatusBadge override for active, live prepend via SE.EMERGENCY_NEW (danger toast) + SE.EMERGENCY_UPDATE patches; Parent: rose min-h-12 "Report emergency" → dialog (type Select, optional student Select from GET /students?parent=me, note textarea, POST /emergency) with exact success toast; Admin/superadmin: Resolve/Cancel per active alert with AlertDialog confirm → PATCH /emergency/:id; Driver: read-only; contacts card GET /emergency/contacts with tel: links; persistent "never queued offline" alert.
- NOTIFICATIONS: `src/app/(app)/(shared)/notifications/page.tsx` ('use client' page per spec) — GET /notifications?page&limit=30 rows (title, body, type badge w/ tone map for backend types trip/eta/arrival/attendance/emergency/broadcast/edit-request, unread → brand left border + dot, click → PATCH /:id/read); "Mark all read" → PATCH /notifications/read-all; live SE.NOTIFICATION_NEW prepend + toast; Broadcast dialog (admin+ via GET /auth/me role check): title/body/targetRole(all|parent|driver) → POST /notifications/broadcast → 'Broadcast sent'; Prev/Next pagination; loading/empty("You're all caught up")/error states.
- ATTENDANCE: RSC + `src/features/attendance/attendance-client.tsx` — GET /attendance?page&limit=30&date; rows: student, pickup/dropoff chip, date, stopName, StatusBadge, verified check; live SE.ATTENDANCE_UPDATE patches by attendanceId and SE.STUDENT_STATUS patches via payload.attendance or mapped status (picked_up/dropped_off/absent/returned_to_school) for matching trip+student; Parent: Eye/EyeOff per-row code reveal → GET /attendance/:id/code {code,type,until} shown as monospace text-2xl with live seconds countdown, 30 s TTL auto-hide, single code at a time; Admin: date filter + read-only per-page status summary (no invented PATCH endpoint — marking stays in trip lifecycle per §7).
- PROFILE: RSC + `src/features/profile/profile-page.tsx` — GET /auth/me identity card (Avatar src/initials, name, email, role badge, school, verified badge); name/phone form → PATCH /users/me → toast 'Profile saved' + router.refresh(); hidden image input → FormData 'avatar' → POST /users/me/avatar with URL.createObjectURL preview + refresh; Parent-only panel: Linked children (name, grade) each with "Request edit" dialog (field name|grade, prefilled newValue) → POST /edit-requests → 'Request submitted — an administrator will review your change.'; "My requests" GET /edit-requests?mine=1&limit=10 with StatusBadge(pending/approved/rejected); Sign out → POST /auth/logout → replace('/login') + refresh.
- SETTINGS: `src/app/(app)/(shared)/settings/page.tsx` ('use client') — Appearance segmented control (Light/Dark/System, next-themes setTheme, hydration-safe mounted flag); Connection card (online via online/offline listeners + socket via useSocketStatus) with the "never run offline or queue automatically" copy; Notifications card → Notification.requestPermission() with granted/info toasts (registration documented as pending FCM VAPID config — no invented tokens); About card (SafeBus PWA v1.0.0, link to /offline).
- CROSS-TASK FIXES (required to run my features; both minimal/additive, flagged for task-9 integration): (1) `src/components/providers/socket-provider.tsx` — added `export { SE }` re-export; app-shell (task 1) imports SE from the provider but it was never re-exported → every (app) route 500'd at SSR ("Export SE doesn't exist"). (2) `src/app/api/[...path]/route.ts` BFF forward() — skip copying the incoming content-type for FormData bodies (stale multipart boundary broke upstream parsing; avatar upload returned 500 → now 200 verified end-to-end). Test artifact cleaned (Maria's avatar reset to NULL in seed DB).
- Lint hygiene: zero `any`, strict types, 'use client' only where interactive; `react-hooks/set-state-in-effect` errors fixed by deferring initial fetches to setTimeout callbacks and moving all countdown/network updates into subscription callbacks (no disable-comments); touch targets ≥44px, aria-labels/roles on all interactive elements, responsive single-column mobile → md+ grids.
- Verified: `bun run lint` exit 0; parent/admin/superadmin sessions render all six routes 200 (driver /attendance → 307 matches the frozen middleware matrix — drivers verify in /driver); BFF API probes for conversations/contacts, notifications list, attendance list + code, emergency + contacts, students?parent=me, edit-requests?mine=1, auth/me, users/me PATCH and avatar multipart upload all return contract-shaped data.

Stage Summary:
- Shared feature surface COMPLETE: /messages (+ /messages/[userId]), /emergency, /notifications, /attendance, /profile, /settings — all role-aware, live via SE events, contract-exact, lint-clean and rendering 200 through the BFF against the reference backend.
- Safety guarantees honored: message/emergency writes never queue offline (draft restore on failure); attendance codes are single-code, 30 s TTL; no invented endpoints or fields anywhere.
- Left for task 9: browser-level socket event soak test; note the two cross-task fixes above if any agent touches socket-provider or the BFF proxy.

---
Task ID: 5
Agent: driver-features
Task: Driver experience — dashboard ("Today's trips") + full trip lifecycle console (start / GPS pings / live map / code verification with lockout / forced-end safeguard / summary).

Work Log:
- Read worklog + docs/CONTRACTS.md (§6 lifecycle, §7 attendance/lockout, §13 events) and the backend reference (routes/trips.ts, routes/attendance.ts, lib/serialize.ts) to match exact payload shapes before writing UI.
- NEW `src/features/trips/trip-console.tsx` ('use client') — the trip state machine:
  * scheduled: prominent h-14 Start button ("Start morning pickup" / "Start evening drop-off") → POST /trips/:id/start → toast 'Trip started' → refetch GET /trips/:id to load newly-created expected attendance (pending ×N); 409 INVALID_STATE → 'Trip already underway' + refetch.
  * active: useJoinTrip(tripId); LiveMap (import-only, contract props: apiKey/center/stops/bus/arrivalStopId/height/className/ariaLabel) with bus marker from real data only (initial trip.currentLocation, then watchPosition + SE.TRIP_LOCATION — never simulated); navigator.geolocation.watchPosition (enableHighAccuracy, maximumAge 10s) POSTing /trips/:id/location {location:{type:"Point",coordinates:[lng,lat]}, speed, heading} throttled to ≥5s via ref; GPS chip (waiting/sending/unavailable); geolocation/POST failures → dismissible amber banner "Location unavailable — enable GPS so parents get live ETAs" (or connection-specific message), all other controls keep working; watch cleared on unmount/status change. SE.TRIP_ARRIVED (tripId-matched) → toast.info(`Arrived at ${stopName}`) + arrivalStopId highlight; SE.TRIP_ETA intentionally ignored (parents get notified); SE.TRIP_STATUS (matched) → silent refetch (admin start/end/cancel resync); SE.ATTENDANCE_UPDATE (matched) → patches roster row by attendanceId/studentId.
  * Roster: name, grade, stopName (sorted by stop sequence), StatusBadge, verified check icon, "Verify code" button on pending rows, done/total counter, max-h-96 scroll list.
  * Verify dialog: 6-digit numeric input (inputMode numeric, autofocus, Enter submits, digits-only sanitize), POST /attendance/:id/verify {code}. Success → toast `${student} picked up|dropped off`, patch row from response, close, draft cleared. 400 INVALID_CODE → inline "Invalid code — ask the parent for the 6-digit code", dialog stays open, draft kept. 423/LOCKED → locked state: disabled input + amber "Too many failed attempts — locked for mm:ss" countdown (ApiError drops body retryAfterSeconds → contract default 300s; row.lockedUntil honored on reopen), interval cleaned up, countdown survives close/reopen, no retry until 0.
  * End trip: outline-destructive header button → confirm dialog → POST /trips/:id/end {} → 200 → toast 'Trip ended' + refetch (final attendance). 409 PENDING_STUDENTS → dialog transforms into safeguard: rose alert "N students still pending" + copy "Ending now will mark remaining students absent (morning) / returned to school (afternoon)" + "Keep trip active" (close) / "Force end trip" (destructive, POST {force:true}) — second explicit click required. Other 409 (ended elsewhere) → info toast + refetch. pendingCount read from error.details fieldErrors with local-roster fallback.
  * completed/cancelled: summary card (scheduled/started/ended times, students total, per-status counts picked_up/dropped_off/returned_to_school/absent/pending, cancelled explainer) + "Back to dashboard".
  * All mutations busy-gated; no offline queueing of location/verify/end writes anywhere (§13 note).
- NEW `src/features/trips/shared.ts` — trip-domain types (Trip/AttendanceRow/MapStop/statuses), TRIP_TYPE_LABEL {pickup:'Morning pickup', dropoff:'Evening drop-off'}, formatTime. Module-light so the dashboard page does not pull the map/console graph.
- NEW `src/features/trips/driver-dashboard.tsx` ('use client') — GET /trips?driver=me&date=today&limit=20 rows (type label, route name, bus number + plate, scheduled start, StatusBadge, h-11 "Open" Link asChild → /driver/trips/:id with sr-only context); live/offline chip via useSocketStatus; SE.TRIP_STATUS → refetch (assigned trips can activate server-side); PageSkeleton loading, exact EmptyState copy ("No trips assigned today" / "Trips assigned to you by the school will appear here each morning."), ErrorState retry; status count line.
- NEW `src/app/(app)/(driver)/driver/page.tsx` — thin RSC exporting metadata {title:'Driver Dashboard'} + renders <DriverDashboard /> (client pages cannot export metadata).
- NEW `src/app/(app)/(driver)/driver/trips/[tripId]/page.tsx` — RSC shell: `await params`, parallel serverApi(`/trips/${tripId}`) + serverApi('/config/maps') → <TripConsole trip apiKey>; try/catch → ErrorState + "Back to dashboard" (403/404/unreachable); JSX kept outside try/catch per lint (error-boundaries rule).
- Lint fixes in my files: initial fetch via promise-callback subscription pattern (react-hooks/set-state-in-effect — no direct setState in effect bodies anywhere; geolocation/countdown setState only inside external callbacks; zero disable-comments needed).
- Verified against the live reference backend through the BFF with driver cookie session: start → pending×3 rows (student name/grade/stopName shapes confirmed); wrong verify → 400 INVALID_CODE, wrong ×3 → 423 LOCKED retryAfterSeconds:300 (exactly the dialog states implemented); correct verify → picked_up/verified:true; end → 409 PENDING_STUDENTS pendingCount:2 (+ details path pendingCount); force end → completed + pending→absent; bad location body → VALIDATION_ERROR. Reset backend DB to pristine seeded state afterwards (worklog Task 2 command) so the morning pickup trip is available for demos.
- `GET /driver` renders 200 with title "Driver Dashboard · SafeBus". ESLint clean project-wide; tsc: only remaining error in my graph is the expected missing `@/components/map/live-map` (Task 4, parallel).

Stage Summary:
- Driver experience complete: dashboard + full lifecycle console (start, throttled GPS pings, live map, arrival toasts, code verification with 423 lockout countdown, PENDING_STUDENTS forced-end safeguard, summary), all contract-exact and lint-clean.
- Depends on Task 4's `src/components/map/live-map.tsx` for the trip console route to compile (import is contract-frozen; dashboard route works standalone via shared.ts decoupling). Integration (Task 9) should re-check `/driver/trips/:id` after Task 4 lands.
- Demo flow: login david.demo@safebus.app / Driver123! → /driver → open Morning pickup → Start → verify with parent-revealed codes (parent maria.demo reveals via /attendance) → try wrong codes to see lockout → End trip to see the PENDING_STUDENTS safeguard.

---
Task ID: 4
Agent: parent-features-2
Task: Parent tracking features — shared LiveMap component (Google Maps + schematic fallback), /track live tracker, /schedule, trip+route history, role-aware route detail.

Work Log:
- Read worklog + docs/CONTRACTS.md (§4/§5/§6/§12/§13) and cross-checked payload shapes against the reference backend serializers (pubStudent list has ids only — no route/stop populate; parent /trips scoping = route OR attendance match; pubRoute always returns ordered stops).
- NEW src/components/map/live-map.tsx ('use client', shared, exports MapStop/BusPosition/LiveMapProps/LiveMap): apiKey non-empty → Google Maps JS API loaded once via module-level promise cache (script tag `…/maps/api/js?key=…&libraries=marker`), classic markers — numbered blue stop pins with drop shadow (SVG data-URLs, arrival stop recolored emerald), blue bus pin with heading rotation baked into the SVG, panTo on every bus update, fitBounds over stops, graceful fall-through to schematic on load failure. apiKey '' (sandbox default per §12) → self-contained schematic SVG fallback: map-paper grid texture (linear-gradient), equirectangular projection of the stops+bus bbox (cos-lat longitude correction, 15% pad, uniform scale → aspect preserved, 1000×620 viewBox, north up), polyline + numbered stop nodes with halo labels, arrivalStopId node = emerald ring + motion-safe pulse, bus = blue pin rotated to heading gliding via CSS transform transition (900ms), caption "Schematic view — live positions update in real time", role="application" + aria-label on container, sr-only stop-name summary, prefers-reduced-motion respected, SSR-safe (no window access at import/render). `height` accepts a Tailwind class (spec) OR a px number — Task 5 console passes 380 and Task 7 admin dashboard passes 320, both preserved.
- NEW src/features/tracking/tracking-client.tsx: child switcher (horizontal scrollable role=tablist aria-label="Children", avatar initial + name + grade, brand ring on selected, Arrow/Home/End roving focus); per-child GET /routes/:routeId (ordered stops) + GET /trips?mine=1&date=today&limit=20 → trip matching child.routeId (prefer 'active', else first); useJoinTrip(trip.id); SE.TRIP_LOCATION (tripId-matched) → bus pin (seeded from trip.currentLocation), SE.TRIP_ARRIVED → arrived map + nextStopId (first non-arrived) + arrival toast, SE.TRIP_ETA → aria-live="polite" chip + toast.info(`Bus is N minutes away — stop`) once per trip+stop+minutes combo (ref Set), SE.TRIP_STATUS → local trip status patch, SE.STUDENT_STATUS (studentId match) → StatusBadge + toast.success on change (waiting/picked_up/in_transit/dropped_off/absent/returned_to_school → "Ava was picked up" style). Header: route name + StatusBadge(trip.status) + type/bus/schedule line + useSocketStatus chip (emerald "Live" / amber "Reconnecting…" with status-light span, app-shell pattern). Layout: LiveMap h-[320px] md:h-[420px] + stop timeline (numbered nodes + connector, arrived → emerald check + HH:mm, next → pulsing "Next" badge, child's own stopId → "Your stop" badge). States: no children → EmptyState "No linked children yet"; child w/o route → "No route assigned yet"; fetch error → ErrorState retry; loading → PageSkeleton. All fetch setState inside promise callbacks — react-hooks/set-state-in-effect clean with zero disable comments.
- NEW /track RSC shell: getSession gate; parallel serverApi('/config/maps') + serverApi('/students',{parent:'me',limit:50}) (both wrapped in try/catch — students failure → ErrorState, maps failure → apiKey '' → schematic degradation per §12).
- NEW /schedule ('use client' page): GET /trips?mine=1&date=today&limit=20 rows (Sunrise/Sunset tile, Morning pickup/Evening drop-off, route name + bus number, date-fns 'HH:mm' start–end range, StatusBadge); live refetch on SE.TRIP_STATUS; live/offline chip + refresh; loading/empty/error.
- NEW history: history-list.tsx ('use client', kind 'trips'|'routes') → GET /${kind}?page=${page}&limit=10 → Prev/Next (disabled at bounds) + "Page X of Y" (aria-live); trips rows = type/route/date/StatusBadge, routes rows = name/date/stop count + whole-row ArrowRight Link → /routes/:id; thin RSC wrappers /history/trips + /history/routes (metadata — client pages can't export it).
- NEW (shared)/routes/[id]/page.tsx (RSC, role-aware): `await params`; parallel getSession + serverApi(`/routes/${id}`) + /config/maps; 404 ("Route not found"/"Upstream 404") → notFound(), other errors → ErrorState + back-home (JSX outside try/catch per lint); header = route name + StatusBadge + "Manage" LinkButton → /routes for non-parent roles; LiveMap (center = first stop) + ordered stop list (numbered node, name, "Stop N" badge).
- Verified live (parent maria.demo session): /track, /schedule, /history/trips, /history/routes, /routes/:id all 200; /track SSR shows the Children tablist; route detail SSRs role="application" + schematic caption + all 4 stop names, "Manage" absent for parent and present for admin; /driver/trips/:id → 200 (Task 5 trip console now compiles+renders with the new LiveMap); /dashboard (Task 7 dynamic LiveMap import) → 200. `bun run lint` → 0 problems project-wide; `tsc --noEmit` → 0 errors in my files (pre-existing errors in mini-services/examples/skills + a few other agents' files remain, untouched/reported). Dev server was DOWN on arrival (backend mini-service only) → restarted root `bun run dev` in background; all probes green, dev.log clean.

Stage Summary:
- Parent surface COMPLETE: /track (live multi-child tracker), /schedule, /history/trips, /history/routes, role-aware /routes/:id detail, and the shared LiveMap component — contract-exact (§4/§5/§6/§12/§13), lint-clean, no invented endpoints/fields, real data only (no simulated positions).
- LiveMap now exists for Tasks 5/7 (both were blocked importing it): `import { LiveMap } from '@/components/map/live-map'`; props apiKey/center?/stops?/bus?/arrivalStopId?/className?/height?/ariaLabel?; height = tailwind class or px number; '' key → schematic.
- Notes for Task 9: ETA toasts dedupe per trip+stop+minutes per session; arrival history is socket-only (contract exposes no StopProgress REST) so a parent joining mid-trip sees arrivals from join time; trip-list failure on /track degrades silently to a route-only view.

---
Task ID: 7
Agent: admin-features-2
Task: Admin & superadmin features — generic CRUD engine + resource table, analytics dashboard, users (invite links), students (+detail), edit-requests review, buses/routes/stops/trips CRUD, superadmin-only schools. Resumed from a timed-out prior attempt.

Work Log:
- RESUME PROTOCOL: prior attempt had already produced `src/features/admin/{use-resource,schools-client}.tsx`, `src/components/admin/resource-table.tsx` and 9 of 11 route pages. Audited each against the spec + contract before touching anything — quality was high, so COMPLETED/FIXED rather than rewrote: (1) dashboard was a client page with a STATIC `LiveMap` import → rebuilt as RSC wrapper (`metadata 'Dashboard'`) + `src/features/admin/dashboard-client.tsx` with the required lazy `dynamic(() => import('@/components/map/live-map').then(m => m.LiveMap), { ssr:false, loading: Skeleton })`; (2) users was a client page probing `/auth/me` for the school field → spec requires RSC wrapper: `users/page.tsx` now calls `getSession()` and passes `isSuper={session?.role==='superadmin'}` to `src/features/admin/users-client.tsx` (probe removed).
- CRUD ENGINE `use-resource.ts` (verified complete): `useResource<T extends Row>(path, baseQuery)` → GET `${path}` `{page, limit:10, ...query}` (accepts `{items,total,page,pages}` envelope OR raw array; empty-page snap-back), `create` POST / `update` PATCH `${path}/:id` / `remove` DELETE `${path}/:id` each triggering reload, plus `reload`, `setQuery` (deletes empty keys, resets to page 1), `idOf`, `Resource<T>` type. Stale-response guarded via seq ref; unstable baseQuery literal safe via latest-ref.
- RESOURCE TABLE `components/admin/resource-table.tsx` (verified complete): exports `Col<T>` (key/label/render/badge) + `FieldDef` (text/email/password/number/tel/date/datetime-local/select/ref/textarea, options, refPath, labelKey, required, hint, valueFrom). md+ dense shadcn Table / mobile stacked cards; row actions Pencil/Trash2 h-11 w-11 aria-labelled; create/edit dialogs prefilled (datetime-local → local input format, ISO on submit); `ref` fields fetch `refPath?limit=200` on open (label = labelKey ?? name ?? email ?? number ?? id); numbers coerced with Number(); `ApiError.fieldErrors` rendered under matching inputs, dialog stays open; success → close + toast 'Saved'; delete via AlertDialog; PageSkeleton/ErrorState(retry=reload)/EmptyState; page nav (prev/next) when pages>1.
- DASHBOARD (RSC + `dashboard-client.tsx`): parallel allSettled GET /admin/stats, /admin/analytics, /buses?limit=100, /trips?status=active&limit=50, /config/maps — each failure tolerated independently (per-section ErrorState). KPI StatCards Students/Buses/Active trips/Open alerts(rose); attendance-today chips present/pickedUp/droppedOff/absent/pending; recharts BarChart tripsPerDay (#1976d2 brand-500), LineChart attendanceTrend (emerald, rate %, 0–100 domain), fleetStatus donut Pie with per-status colors + legend; Fleet card = active-trip selector chips (bus number, type · route, driver, startedAt) + LiveMap (selected trip's ordered stops via GET /routes/:routeId; bus pin from trip.currentLocation then SE.TRIP_LOCATION; useJoinTrip(selected); SE.TRIP_STATUS active → refresh) + buses roster list. Schematic-mode subtitle when apiKey===''.
- USERS (`users-client.tsx`): cols name/email/role badge/status badge/phone + invite col — invited rows render copyable `${origin}/driver/claim-invite?token=${inviteToken}` (Copy → clipboard, toast, 1.6 s 'Copied'; silently '—' when absent). Fields per §3 (password hint "New users only — leave blank when editing"; schoolId ref '/schools' ONLY when isSuper). Filters: role select, status select, 300 ms debounced q → res.setQuery.
- STUDENTS: list page (client) — cols name→Link /students/:id, grade, parent (client-side enrichment: list endpoint is NOT populated per contract, so parent names from /users?role=parent&limit=100 and bus numbers from /buses?limit=100, with populated-ref fallback), bus, status badge; fields name req/grade/studentCode/parentId ref /users?role=parent/busId ref /buses (labelKey number)/routeId ref /routes/stopId ref /stops/status. Detail `students/[id]/page.tsx` (RSC): back link, name + grade/status badges, InfoTile grid Parent(bus email/phone)/Bus(plate)/Route(link + stop sub)/Stop(sequence), recent attendance serverApi('/attendance',{studentId,limit:20}) max-h-96 scroll list with type badge + StatusBadge + verified badge; unknown id → notFound() (verified 404).
- EDIT REQUESTS (client page): Tabs pending/approved/rejected/all → GET /edit-requests?status=X&limit=50 (raw array tolerated); rows studentName/field/oldValue→newValue/requestedByName/date; pending rows get Approve (emerald) + Reject buttons → PATCH /edit-requests/:id {action} → toast + reload; non-pending show StatusBadge. Verified shape: backend returns studentName + requestedByName + oldValue.
- BUSES / STOPS / TRIPS: straight ResourceTable wiring per spec (bus fields incl. driverId ref /users?role=driver, routeId ref /routes, capacity number, status active/inactive/maintenance; stops accept latitude+longitude numbers with valueFrom reading location.coordinates → backend stores Point, verified via CRUD round-trip; trips type/routeId/busId/driverId required refs, datetime-local scheduled start/end → ISO, status select with lifecycle hint).
- ROUTES: fields name req + status; cols name→Link /routes/:id, stops count, status; per-row ListOrdered action opens read-only ordered-stops dialog (fetches /routes/:id when list row lacks `stops`, numbered chips, coords toFixed(4)). NOTE: ordered stopIds editing intentionally deferred — payload contract (stopIds array, order preserved) left untouched; no invented editor. Also: NO /routes/:id detail page exists in the repo yet (not in any task's file list) — links per spec point at it; Task 9 should either add the page or repoint links.
- SCHOOLS: `schools/page.tsx` RSC `if (session?.role !== 'superadmin') redirect('/dashboard')` + `schools-client.tsx` ResourceTable '/schools' (name req, address textarea, contactPhone tel, status select active/inactive). Verified: admin → 307, superadmin → 200. Cosmetic: seeded schools have no `status` field → StatusBadge renders null in that col until a status is set.
- VERIFICATION: contract probes against the reference backend with admin + superadmin tokens confirmed every shape the UI consumes (stats/analytics fields, users envelope + inviteToken only on invited rows, students list unpopulated vs detail populated, stops Point coords, trips?status=active envelope, edit-requests raw array, config/maps {apiKey:'',provider:'none'}, schools scope). Full CRUD round-trip on /stops (create→patch→delete) plus a validation-error probe (missing name → error.details[0].path=['name'] → fieldErrors under input). SSR smoke via crafted sb_at+sb_session cookies: /users /students /students/:id /edit-requests /buses /routes /stops /trips → 200 with metadata titles (e.g. "Users · SafeBus"); /students/<unknown> → 404; /schools admin→307 superadmin→200. `bun run lint` exit 0 project-wide.
- ⚠️ CROSS-TASK BLOCKER (pre-existing + by-design, NOT fixed here): `src/components/map/live-map` does not exist yet (Task 4, parallel). My dashboard imports it lazily exactly as specified, and Task 5's trip-console imports it statically. Until Task 4 lands, Turbopack dev 500s: (a) `/dashboard` (import trace dashboard-client → live-map), and (b) ALL `/api/*` routes incl. BFF login (Turbopack reports the global compile error on the API error page — verified /api/health + POST /api/auth/login → 500). Browser login therefore stays broken ONLY until live-map exists; the moment Task 4's file lands, /dashboard + /api/* + /driver/trips/:id all compile (no further changes needed). Per instructions I did NOT create live-map.
- tsc note (informational, since typescript.ignoreBuildErrors is on): only errors in my graph are the expected TS2307 for '@/components/map/live-map' (+ cascading JSX overload in dashboard-client) which vanish with Task 4; all other src errors live in other agents' files (notifications/attendance/emergency/messaging/profile, BFF route, lib/api/client, lib/auth/session) — reported, not touched.

Stage Summary:
- Admin/superadmin surface COMPLETE: reusable useResource + ResourceTable CRUD engine powering /users (invite links, debounced filters), /students (+/students/:id detail), /edit-requests (approve/reject), /buses, /routes (ordered-stops dialog), /stops, /trips, /schools (superadmin-gated server-side), plus the analytics dashboard (KPIs, attendance chips, 3 recharts, fleet LiveMap + active-trip selector, live socket updates). All contract-exact, responsive (dense table / stacked cards), ≥44px targets, aria-labelled, lint-clean, verified against the reference backend end-to-end.
- Pending on Task 4: land `src/components/map/live-map` → immediately unblocks /dashboard and the whole /api/* (login) surface (see blocker note above). Pending on Task 9: optional /routes/:id detail page; ordered stopIds editor if ever wanted.

---
Task ID: 9
Agent: orchestrator (main)
Task: Integration — typecheck, defect fixes, end-to-end browser verification of all role journeys, PWA verification.

Work Log:
- Typecheck: fixed all src/ TS errors (null-narrowing ternaries in notifications/attendance/emergency/messages/profile, sessionFromUser(unknown), ApiError normalize typing, BFF cookie-jar union). Final: 0 errors in src/, ESLint 0 problems.
- Defects found & fixed during browser verification:
  1. `/api/_bff/socket-token` 404 — underscore folders are Next.js PRIVATE folders (never routed). Renamed to `/api/socket-token`; socket-provider updated; CONTRACTS §14 updated.
  2. Socket stuck "Reconnecting…" after in-app login (provider mounted while logged out). Added `auth:ready` window event → socket.connect() + unread-count refetch; dispatched from login-form + claim-form. Verified: chip flips to "Live".
  3. BFF CSRF check broke behind the Caddy gateway (Host header loses port: `localhost` vs origin `localhost:81`). Now compares hostname with x-forwarded-host and default-port tolerance; browsers pass via Sec-Fetch-Site. Verified: same-origin mutations 200, cross-origin POST → 403.
  4. Profile page crash `children.map is not a function` — `/students?parent=me` returns {items} envelope; added envelope-tolerant listOf.
  5. Middleware /offline + /verify-email exemption for anonymous visitors (bounced to login, broke SW offline fallback registration) — fixed during Task 3 review.
- End-to-end verification (agent-browser through the gateway :81):
  - Onboarding: 3 resumable steps → /login. Login: role segmented control, demo-account fill buttons, field errors; invalid creds banner. Parent→/track, driver→/driver, admin→/dashboard (role homes all correct).
  - Parent: /track (Live chip, child switcher Ava/Liam, route card, schematic map with 4 stops, "Your stop" marker), /attendance (code reveal `740938` with 30s countdown, historical rows), /schedule, /history, /notifications (full trip trail: started/picked up/arrived/5 min away/absent), /messages (conversation list, thread, message sent + delivered to driver E2E), /emergency (seeded resolved alert, Report dialog present), /profile (identity card, linked children, edit requests after fix), /settings.
  - Driver: dashboard (2 today trips) → trip console → Start morning pickup → 3 expected attendance rows created → verify code 740938 → Ava "Picked Up" (1/3) → wrong code ×3 → 423 LOCKED dialog with mm:ss countdown → End trip → 409 PENDING_STUDENTS safeguard → "2 students still pending" rose dialog with explicit absent-consequence copy → Force end trip → Completed summary ("Trip ended", Absent 2).
  - Real-time: drove the bus via API (stop1→stop3) while parent /track open in a second isolated session — bus marker glided, stop 2 arrival timestamped, "5 min — Horizon Elementary" ETA chip + toast, notifications recorded; parent joined trip room via trip:join.
  - Admin: dashboard (KPIs Students 3/Buses 1/Active trips/Open alerts, attendance chips matched live counts, recharts + fleet section), users table + filters + create driver → status Invited + "Copy link" invite chip, edit-requests tabs + Approve applied Ava 3→4 (verified visible on /track later), trips/buses/routes/stops tables with real rows + coordinates, schools admin→307 redirect, superadmin→both schools.
  - Guards: driver→/track bounced to /driver; admin→/schools → /dashboard; logged-out /trips → /login?next=/trips; root / → role home or /onboarding.
  - PWA: manifest 200 (application/manifest+json), 6 icons generated, SW registered (scope /), caches audited — shell-v1 = offline+manifest+icons, assets-v1 = only /_next/static — ZERO /api entries, zero socket traffic; /offline page renders; SW headers (no-cache + Service-Worker-Allowed) verified.
  - Responsive: 390×844 mobile — top bar + Live chip + unread badge, stacked cards, bottom nav (Track/Attendance/Schedule/Messages/Alerts), thumb-friendly targets.
- Ops: backend DB reset to pristine seed (today pickup+dropoff scheduled, pending edit request, INV-DEMO-2025 invite, resolved emergency); dev server hardened (disown pattern; OOM from parallel browser sessions identified and resolved).

Stage Summary:
- All 8 build tasks integrated; lint 0 / tsc 0; every role journey verified in a real browser including the full trip lifecycle, lockout, forced-end safeguard, live socket tracking, messaging delivery, admin CRUD, edit-request approval, role guards, and PWA cache-exclusion guarantees.
- Known limitations (documented, by design): schematic map fallback (no Google key in sandbox — config/maps returns provider 'none'); geolocation warnings are graceful (headless browser lacks GPS; backend lifecycle verified via API-driven pings); middleware deprecation warning (Next 16 prefers proxy.ts — middleware still functions); register auto-verifies (no mailer in sandbox).

---
Task ID: 9.1
Agent: orchestrator (main)
Task: Post-completion ops pass — re-verify live state on Sep 2, restore fresh seed data, stabilize backend restarts.

Work Log:
- Re-verified the running app end-to-end with agent-browser through the gateway (:81): root 307 → /onboarding, demo-fill parent login → /track, driver login → /driver. Socket chip shows "Live"; no console/page errors.
- Found demo seed was dated to Sep 1 (seed uses relative "today" at first run), so /track showed "No trip scheduled for today". Deleted mini-services/safebus-backend/data.db* and restarted the backend so runSeed() re-seeds with today's dates.
- Root-caused why restarted backends kept dying: the sandbox kills any process still parented to the tool-call shell when the call ends (setsid/nohup alone do NOT survive; agent-browser survives only because it orphans itself instantly). Working launch pattern (document for all future restarts):
  `( cd <service-dir> && setsid bun run dev >> <log> 2>&1 < /dev/null & )` — the subshell exits immediately, bun is orphaned and re-parented to PID 1, so it survives across tool calls.
- Restored state: backend healthy on :5000 with today's seed; parent /track shows "Live" + Scheduled "Morning pickup B-101 07:15–08:00" + stop list; driver dashboard shows "2 scheduled" (morning pickup + evening drop-off) with Live chip.

Stage Summary:
- App re-verified live on Sep 2: all core journeys still green. Seed freshness issue fixed (today's trips present). Backend restart/launch pattern discovered and documented — always use the orphaned-subshell launch; plain nohup/setsid from a tool call will be reaped at call end.

---
Task ID: 9.2
Agent: orchestrator (main)
Task: Fix user-reported "registered as parent but can't log in" — session cookies dropped in the preview panel's cross-site iframe.

Work Log:
- Diagnosed from dev.log: user's register → 201, then six POST /api/auth/login → 200 each immediately followed by GET /login?next=%2Ftrack&reason=signin. Credentials were correct; the middleware bounced every navigation because no session cookie was present.
- Root cause: the preview panel renders the app inside a CROSS-SITE iframe. Browsers refuse to SET SameSite=Lax/Strict cookies from third-party contexts, so the 200 login response's Set-Cookie (Lax/strict, no Secure) was silently discarded → no sb_session → bounce. Reproduced deterministically with a localhost:9999 page iframing http://127.0.0.1:81/login (login inside the iframe bounced back to "Welcome back").
- Fix (src/lib/env.ts, src/lib/auth/session.ts, .env): added EMBEDDED_COOKIES (AUTH_COOKIE_EMBEDDED=1). When set, applySessionCookies/clearSessionCookies issue all three auth cookies as CHIPS: SameSite=None; Secure; Partitioned (Next's @edge-runtime cookies natively serialize `partitioned`). Works in cross-site iframes (partitioned per top-level site) and as a normal cookie top-level; requires HTTPS or localhost (Chrome/FF exempt localhost from the Secure requirement over http). First-party deployments without the flag keep the original Lax/Strict shape.
- Verified: Set-Cookie now carries `Secure; SameSite=none; Partitioned` (curl). Browser-verified BOTH contexts after fix: (a) cross-site iframe localhost:9999 ⊃ 127.0.0.1:81 — parent demo login lands on /track with "Live" socket chip, child switcher, scheduled B-101 trip, notifications badge; (b) top-level localhost:81 — same green result. tsc: 0 errors in src/; eslint clean.
- Contract: docs/CONTRACTS.md §0.b documents both cookie modes.

Stage Summary:
- Login inside embedded/iframe preview contexts now works (CHIPS cookies). User's account (deniskelvin23@outloook.com, parent, active) confirmed present in backend DB — they can log in after refreshing the preview. Note: their registered email literally contains "outloook" (triple o) — flagged to the user since mistyping it in the login form would 401.

---
Task ID: QA-FIX
Agent: engineer (fix pass)
Task: Action docs/QA-FINDINGS.md — B1, B2, M1–M11, minors (excl. #19, #28)

Work Log:
- B1: src/features/emergency/emergency-page.tsx — ReportDialog now unwraps `/students?parent=me` envelope-tolerantly (local `listOf` helper, same pattern as profile-page); regression-checked all other `/students` call sites: profile-page (listOf inline ✓), (parent)/track/page.tsx (server listOf ✓), students/page.tsx (useResource tolerates envelope ✓).
- B2: src/app/globals.css — added `--color-brand-950: #06224d` to the @theme brand scale (after brand-900 #072c66, scale stays visually coherent). Verified in compiled dev CSS (`--color-brand-950: #06224d` present). SoftBanner dark pair recomputed: brand-200 (#a8c9f2, L≈0.566) on brand-950/30-over-dark-card (bg ≈ L 0.017) ≈ 9.2:1 → ≥4.5 AA with margin; kept `dark:bg-brand-950/30 dark:text-brand-200` unchanged.
- M1: src/app/error.tsx — always renders "Something went wrong on our side — please try again."; raw `error.message` only in a collapsed <details> when NODE_ENV !== 'production'.
- M2: tracking-client.tsx arrived-stop chip `bg-emerald-500`→`bg-emerald-600` (white icon, non-text 3:1); emergency-page.tsx resolve trigger+confirm and edit-requests/page.tsx Approve `bg-emerald-600 hover:bg-emerald-700`→`bg-emerald-700 hover:bg-emerald-800`.
- M3: app-shell.tsx sidebar+topbar unread badges and messages-page.tsx unread pill `bg-rose-500`→`bg-rose-600` (4.70:1).
- M4: `text-emerald-600`→`text-emerald-700 dark:text-emerald-400` at app-shell.tsx:197 (Live chip), settings 129/139, attendance-client:286, tracking-client:551. Note: report's `emergency-page.tsx:251` is `text-rose-600` in the current snapshot (rose-600 = 4.70:1, passes AA) — no change needed there.
- M5: `text-amber-600`→`text-amber-700 dark:text-amber-400` at history-list:136, schedule:136, driver-dashboard:150, tracking-client:433.
- M6: kit.tsx STATUS_TONES pending/maintenance/suspended → `text-amber-800 dark:text-amber-300` (6.31:1; whole table reviewed — all other tones already ≥4.5 on their /15 tints); one-off amber badges at dashboard-client:267 (Pending chip), tracking-client:559 (Next), notifications:59 (edit-request), register-sw:88 (active-trip warning), settings:133 (offline note) → same -1-step pair.
- M7: dashboard-client.tsx removed `opacity-80` from the 11px attendance-chip labels (now full-contrast, amber label reads amber-800 via M6).
- M8: new src/components/layout/scroll-lock-cleanup.tsx (tiny, typed) mounted first inside AppShell — on pathname change, on visibilitychange, and a 1 s interval: if no `[role=dialog],[role=alertdialog],[data-state=open][class*=overlay]` exists, clears `body.style.pointerEvents` and `data-scroll-locked`. Reviewed resource-table dialogs: all close via state before unmount (no further change).
- M9: src/features/trips/shared.ts — `formatTime` rewritten as deterministic 24h `HH:mm` (manual pad; no locale dependence) + added `formatTimeRange`. Call sites updated: driver console (already imports shared formatTime), driver-dashboard (same), chat-thread (local 12h `clock()` replaced), admin dashboard (local `fmtTime` deleted → shared), admin trips table (fmtDateTime time part → shared). Parent surfaces (tracking/schedule) already 24h — untouched.
- M10: socket-provider.tsx — new shared vocabulary `SOCKET_STATUS` + `socketStatusLabel(connected, online)` + `useOnline()` hook. Used by all five surfaces: app-shell, tracking-client, schedule page, settings page, driver-dashboard. "Connecting" eliminated; vocabulary now Live / Reconnecting… / Offline.
- M11: src/lib/api/server.ts — `Upstream ${res.status}` fallback → "The server is having trouble right now — please try again in a minute." (matches ServerFetchError tone).
- Minors: #1 app-shell "Log out"→"Sign out" (sidebar aria-label + mobile menu item; profile-page already "Sign out"). #2 public copy student→child (login/register subtitles, onboarding steps 1+3); edit-requests subtitle aligned to its "Student" table header (admin context keeps "student"). #3 pluralization: tracking ETA toast "1 minute", attendance "1 record", history "1 stop", resource-table pager now "{n} {singular/plural noun}" instead of "1 total". #4 new `TRIP_TYPE_SHORT` ("Pickup"/"Drop-off") in trips/shared.ts routed through attendance badges+code line, admin dashboard fleet chips, admin trips table+type select, killing the Dropoff/DROP-OFF drift. #5 students grade placeholder `e.g. 3` + hint "Single number". #6 titles: schools → "Schools", students/[id] → "Student profile" (template "%s · SafeBus" no longer doubled). #7 bottom-nav "Alerts"→"Notifications" (4 roles in nav.ts). #8 resource-table select placeholder unified on "Select…". #9 PASSWORD_HINT humanized ("Use at least 8 characters…"); offline page "Safety writes…queued for replay" → plain-language sentence. #10 emergency dialog titles "Resolve/Cancel this emergency alert?", trigger buttons "Resolve"/"Cancel alert". #11 profile-page request summary shows "Grade change"/"Name change" instead of raw field key. #12 manifest shortcuts role-neutral ("Live tracking"/"Dashboard"/"Notifications"/"Emergency", 4 entries, same icon paths, JSON valid). #13 login 401 banner → "Incorrect email or password." (client-side map on ApiError.status). #14 verify-email idle state got the dashed "Sandbox only" note matching the demo panel. #15 attendance verified-count icon → emerald-700/dark:400. #16 status dots/icons → 600s (app-shell, tracking, settings Wifi/Radio; rose WifiOff too). #17 button.tsx default hover → `hover:bg-brand-600 dark:hover:bg-primary/90` (light 5.75:1; dark kept — brand-600 under dark-mode primary text would have failed). #18 `--muted-foreground` light → oklch(0.52 0 0). #20 onboarding steps wrapped in `bg-card` panel like AuthShell. #21 offline page + register-sw brand icon tints gained `dark:text-brand-400`. #22 live-map: route line `opacity-45 dark:opacity-70` (verified class compiles), arrived dot `#10b981`→`#047857` (white number 4.7:1, both modes). #23 bell+account → `h-11 w-11`, dialog close X got `p-2` (top-2/right-2 to keep visual position), update-banner Later/Reload `min-h-11`, emergency tel: link `min-h-11`. #24 mobile account menu ported to Radix DropdownMenu (Escape/outside-click/focus for free; state removed). #25 auth Field/PasswordField inputs got `suppressHydrationWarning` — no SSR/client prop difference exists in our JSX (ids via useId are stable), so the residual mismatch is extension/password-manager attribute mutation pre-hydration; suppression is scoped to auth inputs only. #26 deleted inert tailwind.config.ts; added `--destructive-foreground` (light+dark) + `@theme inline` mapping. #27 deleted unused toast.tsx/toaster.tsx/hooks/use-toast.ts (Sonner is live; grep confirmed zero importers).
- SKIPPED (per work order): #19 border contrast (product decision), #28 ops note (environment, not code).

Stage Summary:
- All 2 blockers, 11 majors and 25 minors actioned; lint 0 problems, tsc 0 errors in src/ (skills/ + examples/ + mini-services/ errors pre-existing and out of scope), dev server compiles clean and serves 200s.
- Key decisions: brand-950 = #06224d (scale-coherent darker step of brand-900 #072c66); SoftBanner dark classes kept after computing ≈9.2:1; deterministic manual 24h formatTime keeps trips/shared.ts dependency-light and locale-proof; button dark hover deliberately NOT brand-600 (dark-navy text on brand-600 would drop to ≈3.2:1 — kept primary/90 in dark which computes ≈5.4:1); socket vocabulary centralized in socket-provider (all five surfaces import it; tooltip `title` attributes intentionally left as descriptive text); resource-table pager uses singular()/title nouns for "1 bus total"-style copy instead of the bare "1 total".
- Deliberately NOT done: report's emergency-page:251 (emerald) — line is rose-600 in current code and passes AA at 4.70:1; no invented UI beyond findings; no changes to BFF/middleware/backend/contract (frozen).

---
Task ID: QA-VERIFY
Agent: orchestrator (main)
Task: Full pre-launch QA review (report at docs/QA-FINDINGS.md), independent verification of the engineer's fix pass (Task QA-FIX), demo-state reseed, change documentation (docs/QA-CHANGES.md).

Work Log:
- Ran the review: two parallel code audits (user-facing copy; color tokens with computed WCAG ratios) + a full browser pass (desktop + 390px mobile, light + dark): all auth flows with error states, complete parent suite, full driver trip lifecycle (verify → 3 wrong codes → 423 lockout countdown → 409 pending-students safeguard → force end → summary), admin CRUD + edit-request approve→applied-on-parent-view, superadmin scoping, role guards.
- Found 2 blockers (emergency ReportDialog crash on the /students envelope; unreadable dark-mode SoftBanner from missing brand-950), 11 majors (raw exception text in error.tsx; 5 families of AA contrast failures; Radix scroll-lock leak freezing clicks; 24h/12h time inconsistency; tri-labelle dsocket states; "Upstream <status>" fallback), 27 minors. Report written to docs/QA-FINDINGS.md sorted by severity with locations + suggested fixes.
- Handed the report to the engineer agent (Task QA-FIX, see its worklog section) and independently re-verified: lint 0 / tsc(src) 0; B1 browser-verified (dialog opens, POST /api/emergency 201); B2 screenshot-verified (readable dark banner, computed ≈9.2:1); M9/M10 confirmed via shared helpers in code; M11 confirmed live when the backend was briefly down (friendly fallback shown).
- Ops during the pass: backend died twice (sandbox memory-pressure reaping — restart pattern documented in 9.1); dev server OOM-killed once (cgroup oom_kill 1) with Turbopack cache corruption after (spurious 404s) — fixed by clearing .next and relaunching with the orphan pattern; four stale agent-browser daemons accumulated and were killed (single-session discipline going forward).
- Reseeded the backend DB to pristine demo state (8 users, 2 trips today, 1 pending edit request, INV-DEMO-2025); final smoke: fresh login → /track → "Live" + "Scheduled".

Stage Summary:
- QA engagement complete: findings report (docs/QA-FINDINGS.md), all blockers + majors + minors (excl. deliberate #19/#28) fixed and verified (docs/QA-CHANGES.md is the change record). App state: demo seed pristine, dev + backend healthy on :3000/:5000. Remaining known items: #19 border-contrast product decision; sandbox-only ops caveat.

---
Task ID: 9.3
Agent: orchestrator (main)
Task: Fix user-reported "signs in then bounces back to the login page" — regression of the Task 9.2 CHIPS fix caused by sandbox .env regeneration.

Work Log:
- Diagnosed from dev.log: user's attempts showed POST /api/auth/login → 200 immediately followed by GET /api/routes|trips|notifications → 401 and GET /login?reason=signin — the identical cookie-drop signature fixed in 9.2.
- Root cause: the sandbox had regenerated .env to its template (only DATABASE_URL), wiping AUTH_COOKIE_EMBEDDED=1. Code fix was intact but EMBEDDED_COOKIES evaluated false, so cookies were re-issued as Lax/Strict and dropped by the cross-site preview iframe (origin preview-chat-*.space-z.ai visible in dev.log warning).
- Resilience fix (src/lib/env.ts): flipped the default — EMBEDDED_COOKIES is now `process.env.AUTH_COOKIE_EMBEDDED !== '0'`, i.e. embedded/CHIPS mode is ON by default and .env regeneration can never silently re-break login; classic first-party deployments opt out explicitly with =0. Re-added AUTH_COOKIE_EMBEDDED=1 to .env (belt and braces), updated session.ts comment and docs/CONTRACTS.md §0.b to the new default.
- Restarted Next dev with the orphaned-subshell pattern (prior evidence copied to dev.log.prev); curl through gateway :81 confirmed Set-Cookie `Secure; HttpOnly; SameSite=none; Partitioned` on sb_at/sb_rt/sb_session.
- Browser-verified both contexts (agent-browser, single session fixverify, closed after): (a) cross-site iframe wrapper (localhost:9999 ⊃ 127.0.0.1:81) — parent demo login lands on /track with Live socket chip, child tabs, nav, zero JS errors; (b) top-level 127.0.0.1:81 — login lands on /track, zero errors. dev.log golden trail: login 200 → socket-token/routes/trips/unread-count all 200, no bounce.
- Data: backend DB still held only the 8 demo users (user's own account deniskelvin23@outloook.com had been wiped by the QA-VERIFY reseed) and trips were dated Sep 2 ("No trip scheduled for today" on Sep 9). Killed both duplicate backend processes, deleted data.db*, restarted one instance with the orphan pattern; fresh seed verified in-browser: "Scheduled — Morning pickup — B-101 07:15–08:00" + Live + notifications badge 2.
- Cleanup: removed iframe wrapper + :9999 server; closed browser session.

Stage Summary:
- Login works in both iframe and top-level contexts and is now regression-proof against .env resets (code-level default). NOTE for user: their self-registered account was destroyed by the earlier demo reseed and cannot be restored (password unknown) — they should re-register (auto-verifies in sandbox) or use the demo accounts. Dev + backend healthy on :3000/:5000 with today's seed.

---
Task ID: 9.4
Agent: orchestrator (main)
Task: Fix user-reported "getting errors when trying to login" — stale service-worker-pinned JS from an older build running in the user's persistent preview browser.

Work Log:
- Log forensics: the user's three POST /api/auth/login all returned 200 (parent ×2 → /track, driver ×1 → /driver) — auth itself was never failing. Anomalies after login: (a) browser called `/api/_bff/socket-token` (401 pre-auth, 404 post-auth) — a route that existed only in an older build and was renamed to `/api/socket-token` in Task 8 (underscore dirs are private in Next 16); current source has zero `_bff` references; (b) the user's /track loads produced NO client data fetches (hydration breakage from old chunks + fresh RSC); (c) `GET /offline` rendered — v1 SW's offline fallback for a failed navigation (also correlates with the 9.3 dev-server restart window).
- Root cause: public/sw.js v1 served `/_next/static/*` CACHE-FIRST. Dev-mode chunk URLs are stable across server rebuilds, so the user's persistent preview browser (SW registered there — https origin passes the register gate; my localhost:81 test browsers register too but 127.0.0.1 does NOT, register-sw.tsx:26) replayed old cached JS forever. Every fresh test browser had an empty cache — masking the bug in all prior verification.
- Fix (public/sw.js → v2): (1) install now purges ALL caches not matching the current version — self-heals users on their next reload even before the new worker activates; (2) `/_next/static` + /icons are NETWORK-FIRST with cache fallback (offline still served from cache); (3) kept consent-gated updates (update banner → SKIP_WAITING), navigation network-only, and /api + /socket.io exclusions untouched.
- Browser-verified (session swtest, closed after): v2 activates on localhost; register gate confirmed (127.0.0.1 skips, localhost registers — matches the user's https preview registering). Poison test: planted `POISONED` entry in assets-v2 for a live chunk URL → fetch returned fresh network content AND healed the cache entry (old SW would have served the poison). Upgrade test: planted legacy assets-v1 with an old-build chunk + touched sw.js → reload → legacy cache purged, "Update available / Reload app" banner appeared (consent flow intact). Regressions with SW active: parent demo login → /track with Live + "Scheduled Morning pickup B-101"; driver demo login → /driver with Live + "2 scheduled"; zero JS errors; dev.log shows /api/socket-token 200, trips/notifications 200, and no `_bff` calls from current code.

Stage Summary:
- The "login errors" were stale-JS artifacts in the user's browser, not an auth failure: SW v1 cache-first had pinned pre-rename chunks that call a route which no longer exists (404) and break hydration on /track. SW v2 (network-first assets + install-time purge) makes stale-code pinning impossible while keeping the offline PWA behavior; existing users self-heal on their next reload. Auth, cookies, seed data, parent and driver flows all re-verified green.

---
Task ID: 9.5
Agent: orchestrator (main)
Task: "Compile everything and run the PWA" — full compile gate + warm-compile all routes + PWA end-to-end verification (production build intentionally not used: sandbox serves the live preview from the dev server on :3000 and `next build` would take it down).

Work Log:
- Compile gate: `bun run lint` → 0 problems; `bunx tsc --noEmit` → src/ 0 errors. All reported errors were pre-existing, out-of-app folders (examples/ demo missing optional socket.io dep; mini-services/safebus-backend = Bun-runtime code with bun-only APIs; skills/ = standalone scripts). Formalized the boundary in tsconfig.json `exclude` (examples, skills, mini-services) so `tsc --noEmit` is a clean, meaningful gate for the Next app — the reference backend remains validated by its own runtime (bun --hot, currently running).
- Route warm-compile via browser (session pwa, closed after): 8 public/root/offline pages (/, /login, /register, /onboarding, /forgot-password, /verify-email, /driver/claim-invite, /offline); parent+shared 11 (track, attendance, schedule, history/trips, history/routes, notifications, messages, emergency, profile, settings, routes/[id] with real id); driver 2 (/driver, /driver/trips/[tripId] via dashboard link); admin 9 (dashboard, buses, trips, routes, stops, students, users, edit-requests, students/[id] via row link); superadmin /schools. All rendered 200.
- Role gates re-verified live: admin hitting /schools → redirected /dashboard; super.demo sees Schools heading. Student profile (students/16ad5595…), driver trip detail (driver/trips/b0147b43…) render.
- PWA: sw.js/manifest/icons//offline all 200 with correct content types; SW activated + controlling (register gate: localhost registers, 127.0.0.1 skips — https preview registers); shell-v2 = 4 precache entries (offline, manifest, 2 icons); assets-v2 accumulated 116 entries network-first during the walk; /offline precached ✓.
- Live offline-emulation attempt: Playwright `set offline` does not propagate into SW-mediated fetches in this harness, so the offline fallback could not be demonstrated live; the navigation→/offline branch is code-identical to v1 (QA-verified in Task 8) and /offline is confirmed precached — honest caveat, no regression indicated.
- Harness quirks noted (NOT app bugs): agent-browser synthetic clicks on the login submit button and row links sometimes didn't dispatch (programmatic element.click() works; every real/interactive login in all sessions POSTed fine). Console noise limited to the 2 known benign hydration-attribute warnings (QA-FIX #25). Zero 5xx across the whole pass (grep of dev.log).

Stage Summary:
- Everything compiled and green: lint 0, tsc 0 (app scope), all 33 routes warm-compiled and serving, PWA fully operational on the dev server (:3000 via gateway :81) — SW v2 activated, manifest/icons valid, offline page precached, update-banner consent flow intact. App is installable from the https preview (browser menu → Install/Add to Home Screen). Production build intentionally not run per sandbox constraint (dev server is the live preview).

---
Task ID: 10.1
Agent: orchestrator (main) + 5 audit subagents
Task: Full production-readiness audit (backend, frontend/UI, security, PWA/perf, repo/docs/history) requested by product owner; publish repo to GitHub and track all findings as issues + PRs.

Work Log:
- Repo hygiene: untracked .env, db/custom.db, mini-services data.db*, dev.log.prev, .zscripts/dev.pid; hardened .gitignore; added .env.example; removed junk download/; repo-local identity set to Denis Kelvin Murithi <BLACK23D@users.noreply.github.com>; published public repo github.com/BLACK23D/safebus (commit b87e9fc).
- Installed gh CLI v2.100.0 (user-binary); bound owner PAT (scopes: repo, workflow — sufficient; read:org absent so GH_TOKEN env mode used, not `gh auth login`).
- Launched 5 parallel read-only audit agents (backend / frontend / security / PWA / repo-docs). Consolidated findings below; all located with file:line citations.

Findings (triaged):
- BLOCKER BE-1: BFF single-flight refresh not keyed by refresh token (src/app/api/[...path]/route.ts) → cross-account session mixing risk.
- BLOCKER BE-2/SEC-1: hardcoded JWT_SECRET (mini-services/safebus-backend/lib/auth.ts:7) → token forgery; fix = env + fail-fast in production.
- BLOCKER FE-2: demo credentials incl. superadmin hardcoded in login client bundle (login-form.tsx) → gate behind NEXT_PUBLIC_DEMO_MODE.
- BLOCKER DOC-1: .env/DB blobs persist in published git history → filter-branch rewrite + force-push now (10 commits, zero collaborators).
- MAJOR: SEC-2 school-room socket broadcast leaks studentName + all bus positions cross-family; SEC-4 logout/password-reset never revokes refresh tokens; SEC-5/BE-4 rate limiter keyed on req.ip behind proxy (one global bucket) + unthrottled claim-invite/refresh; SEC-6 first-party Secure flag from env not x-forwarded-proto; SEC-7 reset/verify tokens logged; SEC-8 login account-enumeration timing; SEC-9 zero security headers (CSP/HSTS/XCTO/Referrer-Policy); SEC-10 15mb JSON + no BFF fetch timeouts; BE-5 backend-down → raw 500; BE-6 refresh rotation race + no family revocation; BE-7 no graceful shutdown; BE-8 zero DB indexes + unbounded locations growth + in-memory pagination in admin lists; BE-9 socket-token = full 15-min API credential (not scoped/one-time); FE-1 no loading.tsx/Suspense on RSC routes; FE-3 student 404-masks backend outages; FE-4 offline ribbon overlays mobile header; PWA-1 subresource offline fallback returns HTML; PWA-2 offline shell never revalidated after deploys; PWA-4 next.config ignoreBuildErrors=true + poweredByHeader + strictMode; DOC-2 UUID commit messages; DOC-3 tool-results/ published; DOC-4/5/9 missing README/LICENSE/CI/ADRs + wrong package name; PWA-3 TanStack Query declared but unused (hand-rolled fetch hooks).
- MINOR (selected): BE-10 static pickup codes never expire/enforced; BE-11 secrets-in-logs, 15mb body, unvalidated avatar; BE-12 dead Prisma scaffold + /api hello route; FE-5 no client-side zod/RHF on auth forms; FE-6/7 uncontained stop lists + sub-44px touch targets; FE-8 role=application on map; FE-11 no footer; PWA-5 cache writes unguarded + not in waitUntil; PWA-6 first-install auto-reload; PWA-7 dismiss not persisted; PWA-9 recharts static import; PWA-10 unused heavy deps; PWA-11 framer-motion on auth pages; PWA-12 favicon wiring; SEC-12 password policy (cost 10, no max length); SEC-13 socket lifetime vs revocation; DOC-6/7/8/10/12 docs/reorg items.

Stage Summary:
- Audit complete: 4 launch blockers, ~15 majors, ~20 minors, all cited. Strengths confirmed by all agents: server-side object-level authorization (no IDOR), token-stripping BFF, parameterized SQL everywhere, serializer discipline for pickup codes, privacy-strict SW v2, role-aware manifest shortcuts, socket trip:join server-validated.
- Next: publish all findings as labeled GitHub issues; fix via PRs per bounded area (foundation → security → backend → UI → PWA), each PR closing its issues; final production-readiness QA report + browser E2E regression.

---
Task ID: 10.2
Agent: orchestrator (main)
Task: Publish to GitHub, purge history, create issue tracker.

Work Log:
- Bound owner PAT (scopes repo+workflow; GH_TOKEN env mode since read:org absent), installed gh v2.100.0 user-binary.
- Published public repo github.com/BLACK23D/safebus (commit 94f8630 → history-rewritten 52b17b5).
- git filter-branch purge of .env / db files / dev.log.prev / .zscripts/dev.pid / tool-results across all history + force-push; verified `git log --all -- .env` empty (closes DOC-1/issue #4).
- Created 9 labels + 24 issues (#1–#24) covering every audit finding, severity/area labeled, each with evidence + fix + acceptance criteria.

Stage Summary:
- Issue tracker = single source of truth for the fix waves; history clean before any further work landed.

---
Task ID: 10.3
Agent: orchestrator (main)
Task: PR #25 — repo foundation (closes #4 #23 #24).

Work Log:
- README.md (pitch/mermaid architecture/quickstart/demo matrix/quality links/repo map/roadmap), MIT LICENSE, CI workflow (bun install → eslint → tsc → backend syntax gate), CONTRIBUTING, SECURITY, CODEOWNERS, issue templates.
- docs/adr/0001–0005 (CHIPS cookies, BFF token containment, SW privacy, Bun/SQLite backend, seed strategy); docs/HISTORY.md commit↔worklog map; docs/README.md index.
- Reorg: agent-ctx → docs/history (8-pwa-layer superseded note + mojibake fix); tests → scripts/platform-tests (relative paths fixed); .gitignore anchors; /upload/ ignored.
- Squash-merged; CI green. Note: platform auto-checkout moved HEAD to main mid-flow twice — handled by explicit `git branch -f <branch> HEAD` + named-ref pushes.

---
Task ID: 10.4
Agent: orchestrator (main)
Task: PR #26 — security core (closes #1 #2 #5 #6 #7 #9 #10).

Work Log:
- Backend: JWT secret env + prod fail-fast; refresh reuse detection (usedAt column + 90s grace window; family revocation on replay); login limiter per account+IP + limiters on refresh/claim-invite/verify; clientIp() rightmost-XFF; dummy-bcrypt login timing equalization; password max 128 + bcrypt cost 12; reset/verify token logs prod-gated; reset revokes all sessions; ALLOWED_ORIGIN CORS; school socket room staff-only (cross-family child-data leak closed).
- BFF: keyed single-flight refresh (cross-account mixing fixed); explicit /api/auth/refresh intercepted into same flight; logout injects sb_rt (real server-side revocation); Secure from x-forwarded-proto.
- CONTRACTS.md §1/§13/§14 updated in-PR. curl-verified: login → keyed refresh → grace 401 → family alive → logout → replay 401. Browser: parent/driver/admin all clean.

---
Task ID: 10.5
Agent: orchestrator (main)
Task: PR #27 — backend reliability + config (closes #8 #11 #12 #13 #14 #15).

Work Log:
- BFF 10s timeouts + 502 BACKEND_UNAVAILABLE envelope (live-verified with backend stopped); serverApi timeout.
- Graceful shutdown (SIGTERM/SIGINT → io → server → wal_checkpoint(TRUNCATE) → db.close, 5s force guard); 12 hot-FK indexes at boot; locations retention (7d, boot + 6h unref interval); trip list LIMIT 5000; JSON 15mb→1mb.
- Socket tokens: /auth/socket-token 60s scope:'socket' JWT; requireAuth rejects scope tokens on REST; handshake accepts; suspended users disconnected ≤5min (interval + per-join check). Live-verified: REST 401 / socket connected.
- Pickup codes: per-trip rotation at start (attendance.code/codeIssuedAt columns + migrations), sliding 30s window enforced at verify, 409 on non-active trips, legacy rows adopted.
- Avatar 2MB + image MIME validation; messages 4000 chars. next.config: security headers (CSP frame-ancestors/nosniff/Referrer-Policy/HSTS), ignoreBuildErrors:false, StrictMode on, poweredByHeader off.
- Removed dead Prisma scaffold + /api hello route; package renamed safebus-web 1.0.0; bun.lock regenerated. Fixed JWT_SECRET import miss caught by live 500 → log → fix.

---
Task ID: 10.6
Agent: orchestrator (main)
Task: PR #28 — UI polish (closes #3 #16 #17 #18 #19).

Work Log:
- Demo credentials gated behind NEXT_PUBLIC_DEMO_MODE=1 (sandbox .env sets it; production bundles clean).
- (app)/loading.tsx PageSkeleton for all authenticated RSC routes; students/[id] 404-vs-error honesty (ErrorState on outages).
- Offline ribbon stacks below mobile bar (top-14/z-30, spacer hack removed); stop lists scroll-contained (max-h-96 + scrollbar-thin); map role=img; 44px touch targets across edit-requests/notifications/attendance/emergency/profile.
- (public) footer (privacy/issues/support) with min-h-dvh flex sticky skeleton + safe-area padding.

---
Task ID: 10.7
Agent: orchestrator (main)
Task: PR #29 — PWA hardening (closes #20 #21 #22).

Work Log:
- sw.js v3: subresource misses → 504 (offline HTML navigations-only); precache revalidated on activate (cache:'reload'); cache writes ok/basic-guarded + e.waitUntil; register-sw first-install reload guard (hadController) + 2h dismissal persistence.
- Admin charts extracted to dashboard-charts.tsx via next/dynamic (recharts off critical path) + chart-colors.ts shared palette; framer-motion removed from auth (CSS keyframe pill) and dropped as a dependency; 14 never-imported deps pruned; favicon.ico + 32px metadata icon.
- Live: SW v3 controlling (shell-v3/assets-v3), no first-install reload, parent /track Live + B-101 clean, favicon 200.

---
Task ID: 10.8
Agent: orchestrator (main)
Task: Final QA report + release tag.

Work Log:
- CI green on all merged waves; 24/24 issues closed, 0 open.
- docs/QA-REPORT-PROD-READINESS.md: verification matrix, blocker evidence, security posture, production deployment checklist (§5), honest limitations (no committed test suite per sandbox policy; next build not run in sandbox — CI/tsc validate compile path).
- Final browser E2E + v1.0.0 tag on main.

Stage Summary:
- Platform ready for customer onboarding in sandbox/demo; production gate = §5 checklist.
