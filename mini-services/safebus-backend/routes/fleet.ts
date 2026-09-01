import { Router } from 'express'
import { count, one, q, run } from '../lib/db'
import { ApiError, h, newId, nowIso, vd, verr } from '../lib/util'
import { requireAuth, requireRole, type Row } from '../lib/auth'
import { pubBus, pubRoute, pubStop } from '../lib/serialize'

function requireSchoolId(req: any, body?: any): string {
  const schoolId = req.user.role === 'superadmin' ? (body?.schoolId ? String(body.schoolId) : req.user.schoolId) : req.user.schoolId
  if (!schoolId) throw verr([vd('schoolId', 'schoolId is required')])
  return schoolId
}

function inScope(req: any, row: Row | undefined): row is Row {
  if (!row) return false
  if (req.user.role === 'superadmin') return true
  return row.schoolId === req.user.schoolId
}

function assertSchoolRef(schoolId: string, path: string, id: unknown, table: string, mustRole?: string) {
  if (id === undefined || id === null || id === '') return
  const row = one(`SELECT * FROM ${table} WHERE id = ?`, String(id))
  if (!row) throw verr([vd(path, `${path} not found`)], `${path} not found`)
  if (row.schoolId !== schoolId) throw verr([vd(path, `${path} belongs to another school`)])
  if (mustRole && row.role !== mustRole) throw verr([vd(path, `${path} must be a ${mustRole} user`)])
}

/* ------------------------------- Buses ------------------------------- */

const buses = Router()
buses.use(requireAuth)

// GET /buses — admin+ school; driver own; parent buses of children
buses.get(
  '/',
  h((req, res) => {
    const me = req.user
    let rows: Row[] = []
    if (me.role === 'superadmin') rows = q('SELECT * FROM buses ORDER BY createdAt ASC')
    else if (me.role === 'admin') rows = q('SELECT * FROM buses WHERE schoolId = ? ORDER BY createdAt ASC', me.schoolId)
    else if (me.role === 'driver') rows = q('SELECT * FROM buses WHERE driverId = ? ORDER BY createdAt ASC', me.id)
    else if (me.role === 'parent') {
      const busIds = [...new Set(q('SELECT busId FROM students WHERE parentId = ?', me.id).map((s: any) => s.busId).filter(Boolean))]
      rows = busIds.length
        ? q(`SELECT * FROM buses WHERE id IN (${busIds.map(() => '?').join(',')}) ORDER BY createdAt ASC`, ...busIds)
        : []
    }
    const page = Math.max(1, Number(req.query.page || 1))
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 100)))
    const total = rows.length
    const items = rows.slice((page - 1) * limit, page * limit).map((b) => pubBus(b, { populate: true }))
    res.json({ success: true, data: { items, total, page, pages: Math.ceil(total / limit) } })
  }),
)

buses.post(
  '/',
  requireRole('admin'),
  h((req, res) => {
    const b = req.body || {}
    if (!b.number || !String(b.number).trim()) throw verr([vd('number', 'Bus number is required')])
    if (!b.plate || !String(b.plate).trim()) throw verr([vd('plate', 'Plate is required')])
    const schoolId = requireSchoolId(req, b)
    assertSchoolRef(schoolId, 'driverId', b.driverId, 'users', 'driver')
    assertSchoolRef(schoolId, 'routeId', b.routeId, 'routes')
    if (b.status && !['active', 'inactive', 'maintenance'].includes(b.status)) throw verr([vd('status', 'Invalid status')])
    const id = newId()
    run(
      `INSERT INTO buses (id, number, plate, driverId, routeId, capacity, status, schoolId, createdAt) VALUES (?,?,?,?,?,?,?,?,?)`,
      id,
      String(b.number).trim(),
      String(b.plate).trim(),
      b.driverId ? String(b.driverId) : null,
      b.routeId ? String(b.routeId) : null,
      b.capacity !== undefined && b.capacity !== null && b.capacity !== '' ? Number(b.capacity) : null,
      b.status ? String(b.status) : 'active',
      schoolId,
      nowIso(),
    )
    const bus = one('SELECT * FROM buses WHERE id = ?', id)!
    res.status(201).json({ success: true, data: pubBus(bus, { populate: true }) })
  }),
)

buses.get(
  '/:id',
  h((req, res) => {
    const bus = one('SELECT * FROM buses WHERE id = ?', req.params.id)
    if (!inScope(req, bus)) throw new ApiError(404, 'Bus not found')
    res.json({ success: true, data: pubBus(bus, { populate: true }) })
  }),
)

buses.patch(
  '/:id',
  requireRole('admin'),
  h((req, res) => {
    const bus = one('SELECT * FROM buses WHERE id = ?', req.params.id)
    if (!inScope(req, bus)) throw new ApiError(404, 'Bus not found')
    const b = req.body || {}
    if (b.status && !['active', 'inactive', 'maintenance'].includes(b.status)) throw verr([vd('status', 'Invalid status')])
    if (b.number !== undefined) run('UPDATE buses SET number = ? WHERE id = ?', String(b.number).trim(), bus.id)
    if (b.plate !== undefined) run('UPDATE buses SET plate = ? WHERE id = ?', String(b.plate).trim(), bus.id)
    if (b.driverId !== undefined) {
      assertSchoolRef(bus.schoolId, 'driverId', b.driverId, 'users', 'driver')
      run('UPDATE buses SET driverId = ? WHERE id = ?', b.driverId ? String(b.driverId) : null, bus.id)
    }
    if (b.routeId !== undefined) {
      assertSchoolRef(bus.schoolId, 'routeId', b.routeId, 'routes')
      run('UPDATE buses SET routeId = ? WHERE id = ?', b.routeId ? String(b.routeId) : null, bus.id)
    }
    if (b.capacity !== undefined)
      run('UPDATE buses SET capacity = ? WHERE id = ?', b.capacity === null ? null : Number(b.capacity), bus.id)
    if (b.status) run('UPDATE buses SET status = ? WHERE id = ?', String(b.status), bus.id)
    const fresh = one('SELECT * FROM buses WHERE id = ?', bus.id)!
    res.json({ success: true, data: pubBus(fresh, { populate: true }) })
  }),
)

buses.delete(
  '/:id',
  requireRole('admin'),
  h((req, res) => {
    const bus = one('SELECT * FROM buses WHERE id = ?', req.params.id)
    if (!inScope(req, bus)) throw new ApiError(404, 'Bus not found')
    run('DELETE FROM buses WHERE id = ?', bus.id)
    res.json({ success: true, data: { ok: true } })
  }),
)

/* ------------------------------- Routes ------------------------------- */

const routes = Router()
routes.use(requireAuth)

function orderedStops(row: Row): Row[] {
  const stopIds = JSON.parse(row.stopIds || '[]') as string[]
  return stopIds
    .map((sid) => one('SELECT * FROM stops WHERE id = ?', sid))
    .filter(Boolean)
    .sort((a: any, b: any) => Number(a.sequence) - Number(b.sequence))
}

function driverRouteIds(driverId: string): string[] {
  const busRoutes = q('SELECT routeId FROM buses WHERE driverId = ?', driverId).map((r: any) => r.routeId)
  const tripRoutes = q('SELECT DISTINCT routeId FROM trips WHERE driverId = ?', driverId).map((r: any) => r.routeId)
  return [...new Set([...busRoutes, ...tripRoutes].filter(Boolean))]
}

function parentRouteIds(parentId: string): string[] {
  return [...new Set(q('SELECT routeId FROM students WHERE parentId = ?', parentId).map((s: any) => s.routeId).filter(Boolean))]
}

// GET /routes
routes.get(
  '/',
  h((req, res) => {
    const me = req.user
    let rows: Row[] = []
    if (me.role === 'superadmin') rows = q('SELECT * FROM routes ORDER BY createdAt ASC')
    else if (me.role === 'admin') rows = q('SELECT * FROM routes WHERE schoolId = ? ORDER BY createdAt ASC', me.schoolId)
    else if (me.role === 'driver') {
      const ids = driverRouteIds(me.id)
      rows = ids.length ? q(`SELECT * FROM routes WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY createdAt ASC`, ...ids) : []
    } else if (me.role === 'parent') {
      const ids = parentRouteIds(me.id)
      rows = ids.length ? q(`SELECT * FROM routes WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY createdAt ASC`, ...ids) : []
    }
    const page = Math.max(1, Number(req.query.page || 1))
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 100)))
    const total = rows.length
    const items = rows.slice((page - 1) * limit, page * limit).map((r) => pubRoute(r))
    res.json({ success: true, data: { items, total, page, pages: Math.ceil(total / limit) } })
  }),
)

routes.post(
  '/',
  requireRole('admin'),
  h((req, res) => {
    const b = req.body || {}
    if (!b.name || !String(b.name).trim()) throw verr([vd('name', 'Name is required')])
    const schoolId = requireSchoolId(req, b)
    const stopIds: string[] = Array.isArray(b.stopIds) ? b.stopIds.map(String) : []
    for (const sid of stopIds) assertSchoolRef(schoolId, 'stopIds', sid, 'stops')
    if (b.status && !['active', 'inactive'].includes(b.status)) throw verr([vd('status', 'Invalid status')])
    const id = newId()
    run('INSERT INTO routes (id, name, schoolId, stopIds, status, createdAt) VALUES (?,?,?,?,?,?)', id, String(b.name).trim(), schoolId, JSON.stringify(stopIds), b.status ? String(b.status) : 'active', nowIso())
    stopIds.forEach((sid, i) => run('UPDATE stops SET sequence = ? WHERE id = ?', i + 1, sid))
    const route = one('SELECT * FROM routes WHERE id = ?', id)!
    res.status(201).json({ success: true, data: pubRoute(route) })
  }),
)

// GET /routes/:id — parent allowed if a linked child rides it; driver if assigned; admin+ school-scoped
routes.get(
  '/:id',
  h((req, res) => {
    const route = one('SELECT * FROM routes WHERE id = ?', req.params.id)
    if (!route) throw new ApiError(404, 'Route not found')
    const me = req.user
    let allowed = false
    if (me.role === 'superadmin') allowed = true
    else if (me.role === 'admin') allowed = route.schoolId === me.schoolId
    else if (me.role === 'driver') allowed = driverRouteIds(me.id).includes(route.id)
    else if (me.role === 'parent') allowed = parentRouteIds(me.id).includes(route.id)
    if (!allowed) throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    res.json({ success: true, data: pubRoute(route) })
  }),
)

routes.patch(
  '/:id',
  requireRole('admin'),
  h((req, res) => {
    const route = one('SELECT * FROM routes WHERE id = ?', req.params.id)
    if (!inScope(req, route)) throw new ApiError(404, 'Route not found')
    const b = req.body || {}
    if (b.status && !['active', 'inactive'].includes(b.status)) throw verr([vd('status', 'Invalid status')])
    if (b.name !== undefined) run('UPDATE routes SET name = ? WHERE id = ?', String(b.name).trim(), route.id)
    if (b.stopIds !== undefined) {
      const stopIds: string[] = Array.isArray(b.stopIds) ? b.stopIds.map(String) : []
      for (const sid of stopIds) assertSchoolRef(route.schoolId, 'stopIds', sid, 'stops')
      run('UPDATE routes SET stopIds = ? WHERE id = ?', JSON.stringify(stopIds), route.id)
      stopIds.forEach((sid, i) => run('UPDATE stops SET sequence = ? WHERE id = ?', i + 1, sid))
    }
    if (b.status) run('UPDATE routes SET status = ? WHERE id = ?', String(b.status), route.id)
    const fresh = one('SELECT * FROM routes WHERE id = ?', route.id)!
    res.json({ success: true, data: pubRoute(fresh) })
  }),
)

routes.delete(
  '/:id',
  requireRole('admin'),
  h((req, res) => {
    const route = one('SELECT * FROM routes WHERE id = ?', req.params.id)
    if (!inScope(req, route)) throw new ApiError(404, 'Route not found')
    run('DELETE FROM routes WHERE id = ?', route.id)
    res.json({ success: true, data: { ok: true } })
  }),
)

/* ------------------------------- Stops ------------------------------- */

const stops = Router()
stops.use(requireAuth)

function stopCoords(b: any): { lat: number; lng: number } | null {
  if (b.latitude !== undefined && b.longitude !== undefined) return { lat: Number(b.latitude), lng: Number(b.longitude) }
  if (b.location && Array.isArray(b.location.coordinates) && b.location.coordinates.length >= 2) {
    return { lat: Number(b.location.coordinates[1]), lng: Number(b.location.coordinates[0]) }
  }
  return null
}

stops.get(
  '/',
  h((req, res) => {
    const me = req.user
    let rows: Row[] = []
    if (me.role === 'superadmin') rows = q('SELECT * FROM stops ORDER BY sequence ASC')
    else if (me.schoolId) rows = q('SELECT * FROM stops WHERE schoolId = ? ORDER BY sequence ASC', me.schoolId)
    const page = Math.max(1, Number(req.query.page || 1))
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 100)))
    const total = rows.length
    const items = rows.slice((page - 1) * limit, page * limit).map((s) => pubStop(s))
    res.json({ success: true, data: { items, total, page, pages: Math.ceil(total / limit) } })
  }),
)

stops.post(
  '/',
  requireRole('admin'),
  h((req, res) => {
    const b = req.body || {}
    if (!b.name || !String(b.name).trim()) throw verr([vd('name', 'Name is required')])
    const coords = stopCoords(b)
    if (!coords || isNaN(coords.lat) || isNaN(coords.lng)) {
      throw verr([vd('latitude', 'latitude + longitude (or location Point) are required')])
    }
    const schoolId = requireSchoolId(req, b)
    if (b.status && !['active', 'inactive'].includes(b.status)) throw verr([vd('status', 'Invalid status')])
    const id = newId()
    run(
      'INSERT INTO stops (id, name, sequence, lat, lng, status, schoolId, createdAt) VALUES (?,?,?,?,?,?,?,?)',
      id,
      String(b.name).trim(),
      b.sequence !== undefined && b.sequence !== null ? Number(b.sequence) : 1,
      coords.lat,
      coords.lng,
      b.status ? String(b.status) : 'active',
      schoolId,
      nowIso(),
    )
    const stop = one('SELECT * FROM stops WHERE id = ?', id)!
    res.status(201).json({ success: true, data: pubStop(stop) })
  }),
)

stops.get(
  '/:id',
  h((req, res) => {
    const stop = one('SELECT * FROM stops WHERE id = ?', req.params.id)
    if (!inScope(req, stop)) throw new ApiError(404, 'Stop not found')
    res.json({ success: true, data: pubStop(stop) })
  }),
)

stops.patch(
  '/:id',
  requireRole('admin'),
  h((req, res) => {
    const stop = one('SELECT * FROM stops WHERE id = ?', req.params.id)
    if (!inScope(req, stop)) throw new ApiError(404, 'Stop not found')
    const b = req.body || {}
    if (b.status && !['active', 'inactive'].includes(b.status)) throw verr([vd('status', 'Invalid status')])
    const coords = stopCoords(b)
    if (b.name !== undefined) run('UPDATE stops SET name = ? WHERE id = ?', String(b.name).trim(), stop.id)
    if (coords) run('UPDATE stops SET lat = ?, lng = ? WHERE id = ?', coords.lat, coords.lng, stop.id)
    if (b.sequence !== undefined && b.sequence !== null) run('UPDATE stops SET sequence = ? WHERE id = ?', Number(b.sequence), stop.id)
    if (b.status) run('UPDATE stops SET status = ? WHERE id = ?', String(b.status), stop.id)
    const fresh = one('SELECT * FROM stops WHERE id = ?', stop.id)!
    res.json({ success: true, data: pubStop(fresh) })
  }),
)

stops.delete(
  '/:id',
  requireRole('admin'),
  h((req, res) => {
    const stop = one('SELECT * FROM stops WHERE id = ?', req.params.id)
    if (!inScope(req, stop)) throw new ApiError(404, 'Stop not found')
    run('DELETE FROM stops WHERE id = ?', stop.id)
    res.json({ success: true, data: { ok: true } })
  }),
)

export { buses, routes, stops }
