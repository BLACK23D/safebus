# Task 5 — driver-features work record

## Result
Driver experience COMPLETE and lint-clean: driver dashboard ("Today's trips") + the full
trip lifecycle console. Verified end-to-end against the reference backend through the BFF
(cookie session as david.demo). Backend DB reset to pristine seeded state after testing.

## Files created/modified by this agent
- NEW `src/features/trips/shared.ts` — trip-domain types (`Trip`, `AttendanceRow`, `MapStop`,
  statuses), `TRIP_TYPE_LABEL` {pickup: 'Morning pickup', dropoff: 'Evening drop-off'},
  `formatTime`. Kept module-light (no map/socket imports) so `/driver` does not depend on the
  LiveMap graph.
- NEW `src/features/trips/trip-console.tsx` ('use client') — THE lifecycle console:
  scheduled → active (GPS pings + live map + roster verification) → completed/cancelled summary.
- NEW `src/features/trips/driver-dashboard.tsx` ('use client') — today's trips list with live
  refresh on `trip:status`, Live/Offline chip, skeleton/empty/error states.
- NEW `src/app/(app)/(driver)/driver/page.tsx` — thin RSC, `metadata = { title: 'Driver Dashboard' }`.
- NEW `src/app/(app)/(driver)/driver/trips/[tripId]/page.tsx` — RSC shell: parallel
  `serverApi('/trips/:id')` + `serverApi('/config/maps')` → `<TripConsole trip apiKey />`;
  try/catch → ErrorState + back link (403/404/unreachable).
- APPENDED `worklog.md` (Task ID: 5 section).

## Lifecycle behaviors implemented (checklist)
- [x] Scheduled: "Start morning pickup"/"Start evening drop-off" → POST `/trips/:id/start`
      → toast 'Trip started' → refetch detail to load newly-created expected attendance rows.
      409 INVALID_STATE → 'Trip already underway' + refetch.
- [x] Active: `useJoinTrip(tripId)`; LiveMap bus marker + stops + arrivalStopId highlight.
- [x] Continuous GPS: `navigator.geolocation.watchPosition` (enableHighAccuracy, maximumAge 10s);
      POST `/trips/:id/location` `{location:{type:"Point",coordinates:[lng,lat]}, speed, heading}`
      throttled ≥5s (ref). GPS chip: waiting / "GPS: sending updates" / unavailable.
      Geolocation error/unsupported/POST failure → dismissible amber banner
      "Location unavailable — enable GPS so parents get live ETAs"; other controls keep working.
      Watch cleared on unmount + status change. Location NEVER simulated.
- [x] SE.TRIP_LOCATION (tripId-matched) → bus marker update (covers other-device pings).
- [x] SE.TRIP_ARRIVED → toast.info(`Arrived at ${stopName}`) + stop highlight.
- [x] SE.TRIP_ETA → intentionally ignored (parents get notified).
- [x] SE.TRIP_STATUS (matched) → silent refetch (admin start/end/cancel resync).
- [x] SE.ATTENDANCE_UPDATE (matched) → roster row patch by attendanceId/studentId.
- [x] Verify dialog: 6-digit input (numeric, autofocus, Enter submits); POST
      `/attendance/:id/verify {code}`. 200 → toast `${student} picked up|dropped off`,
      row patched from response, dialog closed, draft cleared. 400 → inline
      "Invalid code — ask the parent for the 6-digit code", dialog open, draft kept.
      423/LOCKED → locked state: disabled input, amber "Too many failed attempts — locked
      for mm:ss" countdown (default 300s — ApiError drops body retryAfterSeconds;
      row.lockedUntil honored on reopen), countdown survives close/reopen, no retry until 0.
- [x] End trip: confirm dialog → POST `/trips/:id/end {}`; 409 PENDING_STUDENTS → dialog
      transforms into safeguard (rose alert "N students still pending" + "Ending now will mark
      remaining students absent (morning) / returned to school (afternoon)" + "Keep trip active"
      / destructive "Force end trip" → `{force:true}` — second explicit click required).
      200 → toast 'Trip ended' + refetch. Other 409 → info + refetch.
- [x] Completed/cancelled summary: scheduled/started/ended times, students total, per-status
      attendance counts, cancelled explainer, "Back to dashboard".
- [x] Dashboard live refresh on SE.TRIP_STATUS; exact EmptyState copy; ErrorState retry.
- [x] No offline queueing of location/verify/end writes; all mutations busy-gated; touch
      targets ≥44px (h-11 buttons, h-14 start CTA); no `any`; all listeners/watchers/intervals
      cleaned up; zero eslint-disable comments.

## Backend verification evidence (through BFF, driver session)
- start → status active + attendance pending ×3 (Ava g3/Sunset Park, Liam g5/Oakwood Lane, Noah g2/Horizon Elementary).
- wrong verify → 400 INVALID_CODE (failedAttempts++) ; wrong ×3 → 423 LOCKED retryAfterSeconds:300.
- correct verify (Liam 303781) → picked_up, verified:true, stopName included.
- location ping near stop → 200; end → 409 PENDING_STUDENTS pendingCount:2 (details[0].path=['pendingCount'] → client fieldErrors).
- end {force:true} → completed + pending→absent. Bad location body → VALIDATION_ERROR envelope.
- `GET /driver` → 200, title "Driver Dashboard · SafeBus".
- Reset afterwards: `pkill -f "bun --hot index.ts"; rm -f mini-services/safebus-backend/data.db*; cd mini-services/safebus-backend && (nohup bun run dev > dev.log 2>&1 &)` — health OK, driver login 200.

## Dependencies / notes for downstream agents
- `src/components/map/live-map.tsx` (Task 4) does NOT exist yet — `/driver/trips/:id` returns 500
  (module not found) until it lands. The import is contract-frozen (named export `LiveMap`, props
  `{apiKey, center?, stops?, bus?, arrivalStopId?, className?, height?, ariaLabel?}`); do not
  change trip-console's usage, land the map file instead. `/driver` works standalone today.
- `.then()` subscription pattern used for initial page fetches (react-hooks/set-state-in-effect
  forbids `void load()` in effect bodies even when setState happens after await).
- Backend DB was reset to pristine seed — morning pickup (07:15) + dropoff (15:30) scheduled.
