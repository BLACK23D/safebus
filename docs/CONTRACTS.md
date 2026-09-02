# SafeBus API Contract — FROZEN (authoritative)

Status legend: **V = verified/frozen** against the reference backend that ships with this
sandbox (`mini-services/safebus-backend`). Executable code wins over docs; this doc is
generated FROM the reference implementation and is the single source of truth for both
sides. UI must not invent fields; backend must not rename without updating this file.

Base URL (server-to-server): `BACKEND_URL` (default `http://localhost:5000`).
Browser → BFF → backend: same-origin `/api/*`.

## 0. Envelopes & pagination — V

- Success: `{ "success": true, "data": <T> }` (HTTP 200/201)
- Error: `{ "success": false, "message": string, "error"?: { "message": string, "code"?: string, "details"?: [{ path: string, message: string }] } }`
- Validation errors → HTTP 400 with `error.details[]` (path[0] = field name).
- List envelope: `{ success, data: { items: T[], total: number, page: number, pages: number } }`
- Query params: `page` (1-based), `limit` (max 100). `q` = text search where noted.
- Dates: ISO 8601 strings. Coordinates: `{ type: "Point", coordinates: [lng, lat] }`.
- Entities additionally expose `id` (alias of `_id`) so both access styles work.
- Auth: `Authorization: Bearer <accessToken>`; 401 when missing/expired/revoked.
- Account state enforcement: `inactive|suspended` → 403 `{ code: "ACCOUNT_DISABLED" }` on login and on authenticated calls.

## 1. Auth — V

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password, role? }` (role accepted, informational only) | `{ accessToken, refreshToken, user }` |
| POST | `/auth/register` | `{ name, email, phone, password, role: "parent" }` | `{ user }` (auto-verified in sandbox; see note) |
| POST | `/auth/refresh` | `{ refreshToken }` | fresh `{ accessToken, refreshToken }` (rotation; reuse of old token → 401) |
| POST | `/auth/logout` | `{ refreshToken? }` | `{ ok: true }` |
| GET | `/auth/me` | — | `user` |
| POST | `/auth/forgot-password` | `{ email }` | `{ ok: true }` (always) |
| POST | `/auth/reset-password/:token` | `{ password }` | `{ ok: true }` |
| POST | `/auth/verify-email` | `{ token }` | `{ ok: true }` |
| POST | `/auth/resend-verification` | — | `{ ok: true }` |
| POST | `/auth/claim-invite` | `{ token, name, phone, password }` | login-shaped `{ accessToken, refreshToken, user }` |

- `user = { id, _id, name, email, phone?, role, schoolId?, school?, avatar?, verified, status, createdAt }`
- Note: no mailer in sandbox → register auto-verifies; the verify-email endpoints remain fully functional.
- Strong password: ≥8 chars, upper+lower+number+symbol (validation errors via `error.details`).
- Rate limit: auth endpoints 10/min/IP → 429 `{ code: "RATE_LIMITED" }`.
- Invite tokens: creating a driver via `POST /users` yields `status: "invited"` + `inviteToken`; `POST /auth/claim-invite` activates (status→active) and logs in.

## 2. Roles & scoping rules — V

- `parent`: sees only linked children (`childrenOf` link); trips/attendance of those children; messages only with linked drivers + school admins; can create emergencies for own children; reveal own children's codes; create edit-requests.
- `driver`: trips where `driverId = me`; attendance verification for active own trips; messages with parents of children on own trips + school admins; view school-scoped active emergencies.
- `admin`: CRUD over own `schoolId` scope (users, students, buses, routes, stops, trips, attendance, emergencies, notifications, edit-requests, messages).
- `superadmin`: admin capabilities across all schools; only superadmin may create/update/delete schools; `GET /schools` returns all (admins see their own only).
- Cross-scope reads → 403 `{ code: "FORBIDDEN" }`; unknown ids → 404.

## 3. Users & profile — V

| Method | Path | Notes |
|---|---|---|
| GET | `/users?role&status&q&page&limit&schoolId*` | admin+ only (*superadmin filter) |
| POST | `/users` | admin+; `{ name, email, phone?, password, role, schoolId?* }`; driver → invited+inviteToken |
| GET | `/users/:id` | admin+ |
| PATCH | `/users/:id` | admin+; partial `{ name?, email?, phone?, role?, status?, password? }` |
| DELETE | `/users/:id` | admin+ |
| PATCH | `/users/me` | self; `{ name?, phone? }` |
| POST | `/users/me/avatar` | multipart field `avatar` OR JSON `{ imageBase64 }` → `{ avatarUrl }` (data URL in sandbox) |

## 4. Students — V

| Method | Path | Notes |
|---|---|---|
| GET | `/students?parent=me` | parent → linked children; admin+ → school list |
| GET | `/students?q&page&limit` | admin+ |
| POST | `/students` | admin+; `{ name, grade?, studentCode?, parentId?, busId?, routeId?, stopId?, status? }` |
| GET | `/students/:id` | populated `parent`, `bus`, `route`, `stop` |
| PATCH | `/students/:id` | admin+ |
| DELETE | `/students/:id` | admin+ |

- `student = { id, _id, name, grade?, studentCode?, parentId, parent?, busId, bus?, routeId, route?, stopId, stop?, status: active|inactive, schoolId, pickupCode, dropoffCode }`
- Codes are NEVER included in list/detail responses — only via `/attendance/:id/code`.

## 5. Buses / Routes / Stops — V

- CRUD `/buses`, `/routes`, `/stops` (admin+; GET lists also for parent/driver where needed).
- `bus = { id, number, plate, driverId, driver?, routeId, route?, capacity?, status: active|inactive|maintenance, schoolId }`
- `route = { id, name, schoolId, stopIds: string[], stops?: Stop[] (ordered by sequence), status: active|inactive }`
- `GET /routes/:id` — parent allowed if a linked child rides it; driver if assigned; admin+ school-scoped.
- `stop = { id, name, sequence, location: { type:"Point", coordinates:[lng,lat] }, status: active|inactive, schoolId }`
- Create/update payloads: route accepts `stopIds` array (order preserved); stop accepts `latitude`+`longitude` (backend stores Point) or `location`.

## 6. Trips & the trip lifecycle — V

`trip = { id, _id, type: pickup|dropoff, status: scheduled|active|completed|cancelled, routeId, route?, busId, bus?, driverId, driver?, schoolId, scheduledStart?, scheduledEnd?, startedAt?, endedAt?, currentLocation?, pendingCount? }`

| Method | Path | Notes |
|---|---|---|
| GET | `/trips` | filters: `driver=me`, `date=today`, `status`, `mine=1` (parent → trips touching linked children), admin+ school-scoped |
| POST | `/trips` | admin+; `{ type, routeId, busId, driverId, scheduledStart?, scheduledEnd? }` |
| GET | `/trips/:id` | populated `route.stops` (ordered), `bus`, `driver`, plus `attendance` array |
| PATCH | `/trips/:id` | admin+ (schedule changes) |
| DELETE | `/trips/:id` | admin+ (scheduled only) |
| POST | `/trips/:id/start` | **driver assigned** or admin; only while `scheduled`; sets `active`, `startedAt`; **creates expected attendance** (`pending`) for every active student on the route (pickup+dropoff per type); emits `trip:status` + parent notifications |
| POST | `/trips/:id/location` | driver of trip (or admin); `{ location: {type:"Point",coordinates:[lng,lat]}, speed?, heading? }`; updates `currentLocation`; emits `trip:location` (≥1/s throttle server-side); drives stop sequencing + ETA + geofence (below) |
| POST | `/trips/:id/end` | driver of trip (or admin); **safeguard**: if pending attendance exists → 409 `{ code:"PENDING_STUDENTS", pendingCount }` unless body `{ force: true }`; forced end: pickup → remaining `absent`, dropoff → remaining `returned_to_school` + notifications; sets `completed`, `endedAt`; emits `trip:status` |
| POST | `/trips/:id/cancel` | admin only; scheduled/active → `cancelled` + notifications |

**Location-driven lifecycle (server-side, on every location ping):**
1. Next stop = first route stop without a StopProgress for this trip.
2. ETA = distance / speed (fallback 25 km/h). When ETA ≤ 10 min and > 5 and `eta10Sent` false → emit `trip:eta {minutes: 10}` once, parent notifications "10 minutes away".
3. When ETA ≤ 5 min and `eta5Sent` false → emit `trip:eta {minutes: 5}` once, notifications.
4. Geofence arrival: distance < 75 m → create StopProgress `{tripId, stopId, arrivedAt, ping:{lat,lng,speed,heading}}`; emit `trip:arrived` + notifications "arrived at stop".

## 7. Attendance & verification codes — V

`attendance = { id, _id, tripId, studentId, student?, stopId, stopName?, date (yyyy-mm-dd), type: pickup|dropoff, status: pending|picked_up|dropped_off|absent|returned_to_school, verified: boolean, verifiedAt?, failedAttempts: number, lockedUntil?, updatedAt }`

| Method | Path | Notes |
|---|---|---|
| GET | `/attendance?page&limit&date&studentId&tripId` | parent → own children; driver → own trips; admin+ → school |
| GET | `/attendance/:id/code` | **parent of that student only** → `{ code, type, until? }` (child's verification code) |
| POST | `/attendance/:id/verify` | driver of the trip (or admin); `{ code }`; correct (matches trip-type code) → `picked_up` (pickup) / `dropped_off` (dropoff), `verified: true`; wrong → 400 + `failedAttempts++`; **3 failures → 423 `{ code:"LOCKED", retryAfterSeconds }`** (5-minute lock); emit `attendance:update` + `student:status` + parent notification on success |

Child-status transitions emitted via `student:status`: `waiting → picked_up → in_transit → dropped_off` (and `absent` / `returned_to_school` on forced end). Attendance statuses above are the persisted mirror.

## 8. Messaging — V

- `GET /messages/conversations` → `[ { userId, name, role, avatar?, lastMessage?, lastAt?, unread } ]` (contact discovery is **server-enforced**: parent ↔ linked drivers + school admins; driver ↔ linked parents + school admins; admin ↔ school users; superadmin ↔ anyone)
- `GET /messages/contacts?q?` → allowed contacts `[ { userId, name, role } ]` (compose dialog)
- `GET /messages?userId=X&limit=50` → `{ user: {id,name,role}, messages: [ { id, senderId, recipientId, body, read, createdAt } ] }` — marks incoming unread as read; emits `message:read` to peer
- `POST /messages { recipientId, body }` → created message; emits `message:new` to recipient + sender mirror. Forbidden recipient → 403.
- No offline queueing of message writes (client restores draft on failure).

## 9. Notifications — V

- `GET /notifications?page&limit` → `{ items: [ { id, title, body?, type, read, createdAt, meta? } ], unread, total, page, pages }`
- `GET /notifications/unread-count` → `{ unread }`
- `PATCH /notifications/read-all` → `{ ok: true }`
- `PATCH /notifications/:id/read` → `{ ok: true }`
- `POST /notifications/broadcast` (admin+) `{ title, body?, targetRole? }` → creates one per targeted school user + emits `notification:new` to each online user.
- `POST /device-tokens { token, platform: "web" }` — push device registration (stored; no-op push in sandbox).

## 10. Emergency — V

- `GET /emergency` → parent: own alerts; driver: school-scoped; admin+: school-scoped. `[ { id, type: medical|accident|behavior|other, status: active|resolved|cancelled, note?, studentId?, student?, createdById, createdBy?, createdAt, resolvedAt?, resolvedBy? } ]`
- `POST /emergency { type, note?, studentId? }` (parent; driver allowed with studentId of a child on own trip) → emits `emergency:new` to school admins + drivers + creator.
- `PATCH /emergency/:id { status: "resolved" | "cancelled" }` (admin+) → emits `emergency:update`.
- `GET /emergency/contacts` → `{ items: [ { name, role, phone } ] }` (school emergency contacts).

## 11. Edit requests (child profile) — V

- `GET /edit-requests` (admin+ `?status=pending`; parent `?mine=1`) → `[ { id, studentId, studentName, field, oldValue?, newValue, status: pending|approved|rejected, requestedById, requestedByName?, createdAt, decidedAt?, decidedBy? } ]`
- `POST /edit-requests { studentId, field, newValue }` (parent of that student; field ∈ name | grade)
- `PATCH /edit-requests/:id { action: "approve" | "reject" }` (admin+) — approve applies `newValue` to the student; both notify the parent.

## 12. Admin analytics, config, health — V

- `GET /admin/stats` (admin+) → `{ students, drivers, buses, routes, activeTrips, openEmergencies, attendanceToday: { present, pickedUp, droppedOff, absent, pending }, tripsToday: { total, active, completed } }`
- `GET /admin/analytics` (admin+) → `{ tripsPerDay: [{label, trips}], attendanceTrend: [{label, rate}], fleetStatus: [{status, count}] }` (last 7 days)
- `GET /config/maps` → `{ apiKey: string, provider: "google"|"none" }` — sandbox returns `""` + `"none"`; UI must degrade to schematic map. Server-only keys never leave the backend.
- `GET /health` (public) → `{ status: "ok", uptime }`

## 13. Socket.IO — V (authoritative event set)

- Namespace `/`; handshake `auth: { token: <accessToken> }` (JWT access token). Invalid → `connect_error`.
- Auto-rooms: `user:{id}`, `school:{id}`, and `trip:{id}` on `trip:join`.
- Client → server:
  - `trip:join { tripId }` — authorized: driver of trip, parent of a child on trip, admin of school.
- Server → client (exact names + payload shapes):
  - `trip:location { tripId, busId, location: {lat,lng}, speed?, heading?, at }`
  - `trip:eta { tripId, stopId, stopName, minutes }` (10 then 5, once each per stop)
  - `trip:arrived { tripId, stopId, stopName, at, ping? }`
  - `trip:status { tripId, status, startedAt?, endedAt? }`
  - `attendance:update { attendanceId, studentId, studentName?, status, verified, tripId }`
  - `student:status { studentId, status, tripId, at }`
  - `message:new { id, senderId, recipientId, body, read, createdAt, sender: {id,name,role} }`
  - `message:read { userId, peerId, at }`
  - `emergency:new { id, type, status, note?, studentId?, createdBy: {id,name,role}, createdAt }`
  - `emergency:update { id, status, resolvedAt?, resolvedBy? }`
  - `notification:new { id, title, body?, type, read, createdAt }`
- Reconnect: exponential backoff (max 15 s); clients must dedupe events (250 ms payload-hash window).
- NOT implemented (intentionally): `/tracking/nearby`, any AI endpoints (not consumed by web app), background-sync replay of safety writes.

## 14. BFF behavior (transparent to this contract) — V

- Login/register/refresh/claim-invite response bodies are token-stripped before reaching the browser (`accessToken`/`refreshToken` removed; `user` remains).
- 401 from upstream triggers single-flight refresh + one retry; on failure browser is redirected to `/login?session=expired`.
- Mutating methods require same-origin `Origin`/`Sec-Fetch-Site` (CSRF guard).
- `GET /api/socket-token` → `{ token }` (short-lived access token for the socket handshake only).
