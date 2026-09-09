import { Router } from 'express'
import { count, one, q, run } from '../lib/db'
import {
  ApiError,
  code6,
  h,
  localDateStr,
  newId,
  nowIso,
  parseJson,
  todayStr,
  vd,
  verr,
  weekdayLabel,
} from '../lib/util'
import { requireAuth, requireRole, type Row } from '../lib/auth'
import { pubTrip, pubRoute, pubBus, pubUser, pubAttendance } from '../lib/serialize'
import { notify, notifyMany, toSchool, toTripRoom } from '../lib/sockets'

const r = Router()
r.use(requireAuth)

/* ------------------------------ helpers ------------------------------ */

function tripDates(t: Row): string[] {
  const parts = [t.scheduledStart, t.scheduledEnd, t.startedAt, t.endedAt].filter(Boolean) as string[]
  const ds = parts.map((p) => localDateStr(p))
  return ds.length ? ds : [localDateStr(t.createdAt)]
}

function tripPrimaryDate(t: Row): string {
  const p = [t.scheduledStart, t.scheduledEnd, t.startedAt, t.endedAt, t.createdAt].find(Boolean) as string
  return localDateStr(p)
}

function tripEffStart(t: Row): number {
  const v = t.scheduledStart || t.scheduledEnd || t.startedAt || t.createdAt
  return v ? new Date(v).getTime() : 0
}

function scopedTrip(req: any): Row | undefined {
  const trip = one('SELECT * FROM trips WHERE id = ?', req.params.id)
  if (!trip) return undefined
  const me = req.user
  if (me.role === 'superadmin') return trip
  if (me.role === 'admin' && trip.schoolId === me.schoolId) return trip
  if (me.role === 'driver' && trip.driverId === me.id) return trip
  if (me.role === 'parent') {
    const kids = q('SELECT id, routeId FROM students WHERE parentId = ?', me.id)
    const onRoute = kids.some((k: any) => k.routeId === trip.routeId)
    const onTrip = kids.length
      ? !!one(
          `SELECT 1 FROM attendance a WHERE a.tripId = ? AND a.studentId IN (${kids.map(() => '?').join(',')}) LIMIT 1`,
          trip.id,
          ...kids.map((k: any) => k.id),
        )
      : false
    if (onRoute || onTrip) return trip
  }
  throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
}

function isAdminFor(req: any, trip: Row): boolean {
  const me = req.user
  if (me.role === 'superadmin') return true
  return me.role === 'admin' && trip.schoolId === me.schoolId
}

function canManage(req: any, trip: Row): boolean {
  const me = req.user
  return trip.driverId === me.id || isAdminFor(req, trip)
}

function emitTripStatus(trip: Row, status: string, extra: Row = {}) {
  const payload = { tripId: trip.id, status, ...extra }
  toSchool(trip.schoolId, 'trip:status', payload)
  toTripRoom(trip.id, 'trip:status', payload)
}

function routeStopsOrdered(routeId: string): Row[] {
  const route = one('SELECT * FROM routes WHERE id = ?', routeId)
  if (!route) return []
  const stopIds = parseJson<string[]>(route.stopIds, [])
  return stopIds
    .map((sid) => one('SELECT * FROM stops WHERE id = ?', sid))
    .filter(Boolean)
    .sort((a: any, b: any) => Number(a.sequence) - Number(b.sequence))
}

/** parent user ids of students riding the trip (or, without attendance, on the route). */
function parentIdsOfTrip(trip: Row): string[] {
  const att = q('SELECT DISTINCT studentId FROM attendance WHERE tripId = ?', trip.id)
  if (att.length) {
    const sids = att.map((a: any) => a.studentId)
    return q(`SELECT DISTINCT parentId AS pid FROM students WHERE id IN (${sids.map(() => '?').join(',')}) AND parentId IS NOT NULL`, ...sids).map(
      (x: any) => x.pid,
    )
  }
  return q('SELECT DISTINCT parentId AS pid FROM students WHERE routeId = ? AND parentId IS NOT NULL', trip.routeId).map((x: any) => x.pid)
}

/* ------------------------------- list ------------------------------- */

// GET /trips?driver=me&date=today&status&mine=1
r.get(
  '/',
  h((req, res) => {
    const me = req.user
    let rows: Row[] = []
    // Row cap bounds memory for large histories; date filtering stays in-memory
    // because trip dates are local-timezone derived (SQL date() would be UTC).
    const ROW_CAP = 5000
    if (me.role === 'parent') {
      // trips touching linked children: route match OR attendance match
      const kids = q('SELECT id, routeId FROM students WHERE parentId = ?', me.id)
      const routeIds = [...new Set(kids.map((k: any) => k.routeId).filter(Boolean))]
      const kidIds = kids.map((k: any) => k.id)
      const attTripIds = kidIds.length
        ? q(`SELECT DISTINCT tripId AS tid FROM attendance WHERE studentId IN (${kidIds.map(() => '?').join(',')})`, ...kidIds).map((x: any) => x.tid)
        : []
      const ors: string[] = []
      const params: unknown[] = []
      if (routeIds.length) {
        ors.push(`routeId IN (${routeIds.map(() => '?').join(',')})`)
        params.push(...routeIds)
      }
      if (attTripIds.length) {
        ors.push(`id IN (${attTripIds.map(() => '?').join(',')})`)
        params.push(...attTripIds)
      }
      if (!ors.length) {
        return res.json({ success: true, data: { items: [], total: 0, page: 1, pages: 0 } })
      }
      rows = q(`SELECT * FROM trips WHERE (${ors.join(' OR ')}) LIMIT ${ROW_CAP}`, ...params)
    } else if (me.role === 'driver') {
      rows = q('SELECT * FROM trips WHERE driverId = ? LIMIT ?', me.id, ROW_CAP)
    } else if (me.role === 'admin') {
      rows = q('SELECT * FROM trips WHERE schoolId = ? LIMIT ?', me.schoolId, ROW_CAP)
    } else {
      rows = q('SELECT * FROM trips LIMIT ?', ROW_CAP)
    }

    let filtered = rows
    if (req.query.date) {
      const target = String(req.query.date) === 'today' ? todayStr() : String(req.query.date)
      filtered = filtered.filter((t) => tripDates(t).includes(target))
    }
    if (req.query.status) {
      filtered = filtered.filter((t) => t.status === String(req.query.status))
    }
    filtered.sort((a, b) => tripEffStart(a) - tripEffStart(b))

    const page = Math.max(1, Number(req.query.page || 1))
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 100)))
    const total = filtered.length
    const items = filtered.slice((page - 1) * limit, page * limit).map((t) => pubTrip(t, { populate: true }))
    res.json({ success: true, data: { items, total, page, pages: Math.ceil(total / limit) } })
  }),
)

// POST /trips — admin+
r.post(
  '/',
  requireRole('admin'),
  h((req, res) => {
    const b = req.body || {}
    const me = req.user
    if (!['pickup', 'dropoff'].includes(b.type)) throw verr([vd('type', 'type must be pickup or dropoff')])
    if (!b.routeId) throw verr([vd('routeId', 'routeId is required')])
    if (!b.busId) throw verr([vd('busId', 'busId is required')])
    if (!b.driverId) throw verr([vd('driverId', 'driverId is required')])
    const schoolId = me.role === 'superadmin' ? (b.schoolId ? String(b.schoolId) : me.schoolId) : me.schoolId
    if (!schoolId) throw verr([vd('schoolId', 'schoolId is required')])
    const route = one('SELECT * FROM routes WHERE id = ?', String(b.routeId))
    const bus = one('SELECT * FROM buses WHERE id = ?', String(b.busId))
    const driver = one('SELECT * FROM users WHERE id = ?', String(b.driverId))
    if (!route || route.schoolId !== schoolId) throw verr([vd('routeId', 'Route not found in school')])
    if (!bus || bus.schoolId !== schoolId) throw verr([vd('busId', 'Bus not found in school')])
    if (!driver || driver.role !== 'driver' || driver.schoolId !== schoolId) throw verr([vd('driverId', 'Driver not found in school')])
    const id = newId()
    run(
      `INSERT INTO trips (id, type, status, routeId, busId, driverId, schoolId, scheduledStart, scheduledEnd, etaFlags, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      b.type,
      'scheduled',
      String(b.routeId),
      String(b.busId),
      String(b.driverId),
      schoolId,
      b.scheduledStart ? String(b.scheduledStart) : null,
      b.scheduledEnd ? String(b.scheduledEnd) : null,
      '{}',
      nowIso(),
    )
    const trip = one('SELECT * FROM trips WHERE id = ?', id)!
    res.status(201).json({ success: true, data: pubTrip(trip, { populate: true }) })
  }),
)

// GET /trips/:id — populated route.stops, bus, driver, attendance
r.get(
  '/:id',
  h((req, res) => {
    const trip = scopedTrip(req)
    if (!trip) throw new ApiError(404, 'Trip not found')
    const data = pubTrip(trip, { populate: true })!
    const attRows = q('SELECT * FROM attendance WHERE tripId = ? ORDER BY createdAt ASC', trip.id)
    data.attendance = attRows.map((a) => pubAttendance(a, { populate: true }))
    data.pendingCount = attRows.filter((a) => a.status === 'pending').length
    res.json({ success: true, data })
  }),
)

// PATCH /trips/:id — admin+ schedule changes
r.patch(
  '/:id',
  requireRole('admin'),
  h((req, res) => {
    const trip = one('SELECT * FROM trips WHERE id = ?', req.params.id)
    if (!trip) throw new ApiError(404, 'Trip not found')
    if (!isAdminFor(req, trip)) throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    const b = req.body || {}
    if (b.type !== undefined && !['pickup', 'dropoff'].includes(b.type)) throw verr([vd('type', 'type must be pickup or dropoff')])
    if (b.routeId !== undefined) {
      const route = one('SELECT * FROM routes WHERE id = ?', String(b.routeId))
      if (!route || route.schoolId !== trip.schoolId) throw verr([vd('routeId', 'Route not found in school')])
      run('UPDATE trips SET routeId = ? WHERE id = ?', String(b.routeId), trip.id)
    }
    if (b.busId !== undefined) {
      const bus = one('SELECT * FROM buses WHERE id = ?', String(b.busId))
      if (!bus || bus.schoolId !== trip.schoolId) throw verr([vd('busId', 'Bus not found in school')])
      run('UPDATE trips SET busId = ? WHERE id = ?', String(b.busId), trip.id)
    }
    if (b.driverId !== undefined) {
      const driver = one('SELECT * FROM users WHERE id = ?', String(b.driverId))
      if (!driver || driver.role !== 'driver' || driver.schoolId !== trip.schoolId)
        throw verr([vd('driverId', 'Driver not found in school')])
      run('UPDATE trips SET driverId = ? WHERE id = ?', String(b.driverId), trip.id)
    }
    if (b.type !== undefined) run('UPDATE trips SET type = ? WHERE id = ?', String(b.type), trip.id)
    if (b.scheduledStart !== undefined) run('UPDATE trips SET scheduledStart = ? WHERE id = ?', b.scheduledStart ? String(b.scheduledStart) : null, trip.id)
    if (b.scheduledEnd !== undefined) run('UPDATE trips SET scheduledEnd = ? WHERE id = ?', b.scheduledEnd ? String(b.scheduledEnd) : null, trip.id)
    const fresh = one('SELECT * FROM trips WHERE id = ?', trip.id)!
    res.json({ success: true, data: pubTrip(fresh, { populate: true }) })
  }),
)

// DELETE /trips/:id — scheduled only
r.delete(
  '/:id',
  requireRole('admin'),
  h((req, res) => {
    const trip = one('SELECT * FROM trips WHERE id = ?', req.params.id)
    if (!trip) throw new ApiError(404, 'Trip not found')
    if (!isAdminFor(req, trip)) throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    if (trip.status !== 'scheduled') {
      throw new ApiError(409, `Trip is ${trip.status} and cannot be deleted`, 'INVALID_STATE')
    }
    run('DELETE FROM trips WHERE id = ?', trip.id)
    res.json({ success: true, data: { ok: true } })
  }),
)

/* --------------------------- lifecycle --------------------------- */

// POST /trips/:id/start
r.post(
  '/:id/start',
  h((req, res) => {
    const trip = one('SELECT * FROM trips WHERE id = ?', req.params.id)
    if (!trip) throw new ApiError(404, 'Trip not found')
    if (!canManage(req, trip)) throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    if (trip.status !== 'scheduled') {
      throw new ApiError(409, `Trip is ${trip.status}, only scheduled trips can start`, 'INVALID_STATE')
    }
    const now = nowIso()
    run('UPDATE trips SET status = ?, startedAt = ? WHERE id = ?', 'active', now, trip.id)
    const bus = one('SELECT * FROM buses WHERE id = ?', trip.busId)
    const students = q(
      "SELECT * FROM students WHERE routeId = ? AND status = 'active' AND schoolId = ?",
      trip.routeId,
      trip.schoolId,
    )
    for (const s of students) {
      const exists = one('SELECT id FROM attendance WHERE tripId = ? AND studentId = ?', trip.id, s.id)
      if (exists) continue
      run(
        `INSERT INTO attendance (id, tripId, studentId, stopId, date, type, status, verified, verifiedAt, failedAttempts, lockedUntil, createdAt, updatedAt, code, codeIssuedAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        newId(),
        trip.id,
        s.id,
        s.stopId ?? null,
        todayStr(),
        trip.type,
        'pending',
        0,
        null,
        0,
        null,
        now,
        now,
        code6(),
        null,
      )
    }
    emitTripStatus(trip, 'active', { startedAt: now })
    const typeWord = trip.type === 'pickup' ? 'pickup' : 'drop-off'
    notifyMany(parentIdsOfTrip(trip), {
      title: 'Trip started',
      body: `${bus?.number ?? 'The bus'} started its ${typeWord} route.`,
      type: 'trip',
      meta: { tripId: trip.id },
    })
    const fresh = one('SELECT * FROM trips WHERE id = ?', trip.id)!
    res.json({ success: true, data: pubTrip(fresh, { populate: true }) })
  }),
)

// POST /trips/:id/location — emit-throttled (1/s) but always persisted
const lastLocationEmit = new Map<string, number>()

r.post(
  '/:id/location',
  h((req, res) => {
    const trip = one('SELECT * FROM trips WHERE id = ?', req.params.id)
    if (!trip) throw new ApiError(404, 'Trip not found')
    if (!canManage(req, trip)) throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    const loc = req.body?.location
    if (!loc || !Array.isArray(loc.coordinates) || loc.coordinates.length < 2) {
      throw verr([vd('location', 'location {type:"Point", coordinates:[lng,lat]} is required')])
    }
    const lng = Number(loc.coordinates[0])
    const lat = Number(loc.coordinates[1])
    if (isNaN(lng) || isNaN(lat)) throw verr([vd('location', 'coordinates must be numbers [lng, lat]')])
    const speed = req.body?.speed !== undefined && req.body?.speed !== null ? Number(req.body.speed) : null
    const heading = req.body?.heading !== undefined && req.body?.heading !== null ? Number(req.body.heading) : null
    const at = nowIso()

    run('UPDATE trips SET currentLocation = ? WHERE id = ?', JSON.stringify({ type: 'Point', coordinates: [lng, lat] }), trip.id)
    run(
      'INSERT INTO locations (id, tripId, busId, lat, lng, speed, heading, at, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
      newId(),
      trip.id,
      trip.busId,
      lat,
      lng,
      speed,
      heading,
      at,
      at,
    )

    const last = lastLocationEmit.get(trip.id) ?? 0
    if (Date.now() - last >= 1000) {
      lastLocationEmit.set(trip.id, Date.now())
      const payload = { tripId: trip.id, busId: trip.busId, location: { lat, lng }, speed: speed ?? undefined, heading: heading ?? undefined, at }
      toTripRoom(trip.id, 'trip:location', payload)
      toSchool(trip.schoolId, 'trip:location', payload)
    }

    if (trip.status === 'active') runLifecycle(trip, lat, lng, speed, heading)

    const fresh = one('SELECT * FROM trips WHERE id = ?', trip.id)!
    res.json({ success: true, data: pubTrip(fresh) })
  }),
)

function runLifecycle(trip: Row, lat: number, lng: number, speed: number | null, heading: number | null) {
  const bus = one('SELECT * FROM buses WHERE id = ?', trip.busId)
  const busLabel = bus?.number ?? 'The bus'
  const stops = routeStopsOrdered(trip.routeId)
  const progress = q('SELECT stopId FROM stop_progress WHERE tripId = ?', trip.id).map((p: any) => p.stopId)
  const next = stops.find((s) => !progress.includes(s.id))
  if (!next) return

  const dist = haversine(lat, lng, Number(next.lat), Number(next.lng))
  const v = Math.max(speed ?? 0, 25) // km/h
  const etaMin = (dist / 1000) / v * 60

  const flags = parseJson<Record<string, { eta10?: boolean; eta5?: boolean }>>(trip.etaFlags, {})
  const f = flags[next.id] ?? {}

  if (etaMin <= 10 && etaMin > 5 && !f.eta10) {
    f.eta10 = true
    flags[next.id] = f
    run('UPDATE trips SET etaFlags = ? WHERE id = ?', JSON.stringify(flags), trip.id)
    const payload = { tripId: trip.id, stopId: next.id, stopName: next.name, minutes: 10 }
    toTripRoom(trip.id, 'trip:eta', payload)
    toSchool(trip.schoolId, 'trip:eta', payload)
    const riders = q("SELECT parentId FROM students WHERE stopId = ? AND routeId = ? AND parentId IS NOT NULL AND status = 'active'", next.id, trip.routeId)
    notifyMany(riders.map((x: any) => x.parentId), {
      title: 'Bus approaching',
      body: `${busLabel} is 10 minutes away from ${next.name}.`,
      type: 'eta',
      meta: { tripId: trip.id, stopId: next.id },
    })
  }
  if (etaMin <= 5 && !f.eta5) {
    f.eta5 = true
    flags[next.id] = f
    run('UPDATE trips SET etaFlags = ? WHERE id = ?', JSON.stringify(flags), trip.id)
    const payload = { tripId: trip.id, stopId: next.id, stopName: next.name, minutes: 5 }
    toTripRoom(trip.id, 'trip:eta', payload)
    toSchool(trip.schoolId, 'trip:eta', payload)
    const riders = q("SELECT parentId FROM students WHERE stopId = ? AND routeId = ? AND parentId IS NOT NULL AND status = 'active'", next.id, trip.routeId)
    notifyMany(riders.map((x: any) => x.parentId), {
      title: 'Bus approaching',
      body: `${busLabel} is 5 minutes away from ${next.name}.`,
      type: 'eta',
      meta: { tripId: trip.id, stopId: next.id },
    })
  }
  if (dist < 75) {
    const ping = { lat, lng, speed: speed ?? undefined, heading: heading ?? undefined }
    run('INSERT INTO stop_progress (id, tripId, stopId, arrivedAt, ping) VALUES (?,?,?,?,?)', newId(), trip.id, next.id, nowIso(), JSON.stringify(ping))
    const payload = { tripId: trip.id, stopId: next.id, stopName: next.name, at: nowIso(), ping }
    toTripRoom(trip.id, 'trip:arrived', payload)
    toSchool(trip.schoolId, 'trip:arrived', payload)
    const riders = q("SELECT parentId FROM students WHERE stopId = ? AND routeId = ? AND parentId IS NOT NULL AND status = 'active'", next.id, trip.routeId)
    notifyMany(riders.map((x: any) => x.parentId), {
      title: 'Bus arrived',
      body: `${busLabel} arrived at ${next.name}.`,
      type: 'arrival',
      meta: { tripId: trip.id, stopId: next.id },
    })
  }
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLng = (lng2 - lng1) * toRad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// POST /trips/:id/end
r.post(
  '/:id/end',
  h((req, res) => {
    const trip = one('SELECT * FROM trips WHERE id = ?', req.params.id)
    if (!trip) throw new ApiError(404, 'Trip not found')
    if (!canManage(req, trip)) throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    if (trip.status !== 'active') {
      throw new ApiError(409, `Trip is ${trip.status}, only active trips can end`, 'INVALID_STATE')
    }
    const pending = q("SELECT * FROM attendance WHERE tripId = ? AND status = 'pending'", trip.id)
    if (pending.length > 0 && !req.body?.force) {
      return res.status(409).json({
        success: false,
        message: 'Students still pending',
        error: {
          message: 'Students still pending',
          code: 'PENDING_STUDENTS',
          pendingCount: pending.length,
          details: [{ path: ['pendingCount'], message: String(pending.length) }],
        },
      })
    }
    const now = nowIso()
    if (req.body?.force && pending.length > 0) {
      const finalStatus = trip.type === 'pickup' ? 'absent' : 'returned_to_school'
      for (const a of pending) {
        run('UPDATE attendance SET status = ?, updatedAt = ? WHERE id = ?', finalStatus, now, a.id)
        const student = one('SELECT * FROM students WHERE id = ?', a.studentId)
        const payload = {
          attendanceId: a.id,
          studentId: a.studentId,
          studentName: student?.name,
          status: finalStatus,
          verified: false,
          tripId: trip.id,
        }
        toTripRoom(trip.id, 'attendance:update', payload)
        toSchool(trip.schoolId, 'attendance:update', payload)
        const sst = { studentId: a.studentId, status: finalStatus, tripId: trip.id, at: now }
        toTripRoom(trip.id, 'student:status', sst)
        toSchool(trip.schoolId, 'student:status', sst)
        if (student?.parentId) {
          notify({
            userId: student.parentId,
            title: student.name + (trip.type === 'pickup' ? ' marked absent' : ' returned to school'),
            body: trip.type === 'pickup' ? `${student.name} was marked absent when the route ended.` : `${student.name} was returned to school — they missed the drop-off.`,
            type: 'attendance',
            meta: { tripId: trip.id, studentId: student.id },
          })
        }
      }
    }
    run('UPDATE trips SET status = ?, endedAt = ? WHERE id = ?', 'completed', now, trip.id)
    emitTripStatus(trip, 'completed', { endedAt: now })
    const bus = one('SELECT * FROM buses WHERE id = ?', trip.busId)
    const typeWord = trip.type === 'pickup' ? 'pickup' : 'drop-off'
    notifyMany(parentIdsOfTrip(trip), {
      title: 'Trip completed',
      body: `${bus?.number ?? 'The bus'} completed its ${typeWord} route.`,
      type: 'trip',
      meta: { tripId: trip.id },
    })
    const fresh = one('SELECT * FROM trips WHERE id = ?', trip.id)!
    res.json({ success: true, data: pubTrip(fresh, { populate: true }) })
  }),
)

// POST /trips/:id/cancel — admin only
r.post(
  '/:id/cancel',
  requireRole('admin'),
  h((req, res) => {
    const trip = one('SELECT * FROM trips WHERE id = ?', req.params.id)
    if (!trip) throw new ApiError(404, 'Trip not found')
    if (!isAdminFor(req, trip)) throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    if (!['scheduled', 'active'].includes(trip.status)) {
      throw new ApiError(409, `Trip is ${trip.status} and cannot be cancelled`, 'INVALID_STATE')
    }
    run('UPDATE trips SET status = ? WHERE id = ?', 'cancelled', trip.id)
    emitTripStatus(trip, 'cancelled')
    const bus = one('SELECT * FROM buses WHERE id = ?', trip.busId)
    const typeWord = trip.type === 'pickup' ? 'pickup' : 'drop-off'
    notifyMany(parentIdsOfTrip(trip), {
      title: 'Trip cancelled',
      body: `${bus?.number ?? 'The bus'} ${typeWord} trip has been cancelled.`,
      type: 'trip',
      meta: { tripId: trip.id },
    })
    const fresh = one('SELECT * FROM trips WHERE id = ?', trip.id)!
    res.json({ success: true, data: pubTrip(fresh, { populate: true }) })
  }),
)

export default r
