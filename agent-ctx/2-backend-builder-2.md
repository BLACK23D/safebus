# Task 2 — backend-builder-2 work record

## Result
SafeBus reference backend (`mini-services/safebus-backend`) is COMPLETE, verified, and
RUNNING on port 5000 (REST + Socket.IO, SQLite at `data.db`). Consumed by BFF
(`src/app/api/[...path]/route.ts`) and Socket.IO (`io('/?XTransformPort=5000')`).

## Files created/modified by this agent
- NEW `index.ts` — Express :5000 + Socket.IO (cors *), JSON/rawBody, all routers under /api,
  `/health` + `/api/health`, 404 + error handlers in contract envelope, seed on boot.
- NEW `seed.ts` — idempotent full demo seed (2 schools, 7 accounts + INV-DEMO-2025 invite,
  route A + 4 stops, B-101, 3 students, today 07:15/15:30 trips + 3-day verified history,
  messages, notifications, resolved emergency, pending edit-request, Riverside data).
- NEW `routes/attendance.ts` — §7 list / code reveal (parent-only, until=+30s) / verify
  (driver-of-trip or admin; wrong×3 → 423 LOCKED + retryAfterSeconds; emits
  attendance:update + student:status + parent notification).
- NEW `routes/messages.ts` — §8 conversations/contacts/thread(+message:read)/send(+message:new mirror).
- NEW `routes/notifications.ts` — §9 list/unread-count/read-all/:id/read/broadcast.
- NEW `routes/emergency.ts` — §10 list/create/resolve/contacts (+emergency:new|update).
- NEW `routes/edit-requests.ts` — §11 create/approve/reject (approve applies to student).
- NEW `routes/admin.ts` — §12 stats + 7-day analytics (admin=school scope, superadmin=global).
- NEW `routes/misc.ts` — config/maps {apiKey:"",provider:"none"}, device-tokens, schools CRUD, health.
- NEW `scripts/socket-probe.ts` — end-to-end Socket.IO probe (exit 0 = all contract events seen).
- FIX `lib/sockets.ts` — missing `run` import in notify(); added emitToUser/emitToSchool/emitToTrip aliases.
- FIX `lib/auth.ts` — rawBody no-ops when body already captured/ended (prevents hangs).
- APPENDED `worklog.md` (Task ID: 2 section).

## Demo credentials
| role | email | password |
|---|---|---|
| parent | maria.demo@safebus.app | Parent123! |
| parent | sofia.demo@safebus.app | Parent123! |
| driver | david.demo@safebus.app | Driver123! |
| admin | admin.demo@safebus.app | Admin123! |
| superadmin | super.demo@safebus.app | Super123! |
| admin (Riverside) | admin2.demo@safebus.app | Admin123! |
| parent (Riverside) | riverside.demo@safebus.app | Parent123! |
- Driver invite: `INV-DEMO-2025` → POST /api/auth/claim-invite {token,name,phone,password}.

## Reset / restart backend
```bash
pkill -f "bun --hot index.ts"
rm -f mini-services/safebus-backend/data.db*
cd mini-services/safebus-backend && (nohup bun run dev > dev.log 2>&1 &)
```
Boot auto-seeds when DB is empty (skips when users exist).

## Key verification evidence
- /api/health 200 {status:"ok"}; 7 logins 200.
- /students?parent=me → 2 children, no codes in responses.
- /trips?driver=me&date=today → pickup 07:15 + dropoff 15:30 scheduled.
- start → attendance pending ×3; location pings → trip:eta 10→5→trip:arrived (once per stop).
- verify wrong ×1/×2 → 400, ×3 → 423 LOCKED (retryAfterSeconds 300); parent verify → 403.
- end → 409 PENDING_STUDENTS (pendingCount 3); force → completed, pickup→absent.
- refresh rotation reuse → 401; claim-invite INV-DEMO-2025 → active driver, reuse → 400.
- /schools: admin → 1, superadmin → 2; cross-school writes → 403.
- Socket probe OK: trip:status/location/eta/arrived, notification:new, attendance:update,
  student:status, message:new, message:read, emergency:new, emergency:update.

## Ambiguity resolutions (for downstream agents)
- `message:read` = `{ userId: <reader>, peerId: <notified peer>, at }`.
- stats.attendanceToday: present = picked_up+dropped_off+returned_to_school; droppedOff includes returned_to_school.
- Broadcast excludes the sending admin; admin → own school, superadmin → all users.
- analytics attendanceTrend.rate is 0–100 (int).
- Only `/health` (+`/api/health`) is public; `/config/maps` requires Bearer auth.
- ETA/arrival notifications target parents of students whose stopId == reached stop.
- Duplicated socket deliveries (trip room + school room) are possible by design; clients dedupe (250 ms window) per §13.
