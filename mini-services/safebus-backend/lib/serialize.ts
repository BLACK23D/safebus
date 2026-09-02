import { one, q } from './db'
import { parseJson } from './util'
import type { Row } from './auth'

const idOf = (row: Row) => ({ id: row.id, _id: row.id })
const clean = (o: Row) => {
  const out: Row = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v
  return out
}

export function pubUser(row?: Row | null, opts?: { withSchool?: boolean }): Row | null {
  if (!row) return null
  const out = clean({
    ...idOf(row),
    name: row.name,
    email: row.email,
    phone: row.phone ?? undefined,
    role: row.role,
    schoolId: row.schoolId ?? undefined,
    avatar: row.avatar ?? undefined,
    verified: !!row.verified,
    status: row.status,
    createdAt: row.createdAt,
  })
  if (row.status === 'invited' && row.inviteToken) out.inviteToken = row.inviteToken
  if (opts?.withSchool !== false && row.schoolId) {
    const s = one('SELECT id, name FROM schools WHERE id = ?', row.schoolId)
    if (s) out.school = { id: s.id, _id: s.id, name: s.name }
  }
  return out
}

/**
 * Student serializer — pickupCode/dropoffCode are NEVER exposed
 * (only via /attendance/:id/code).
 */
export function pubStudent(row?: Row | null, opts?: { populate?: boolean }): Row | null {
  if (!row) return null
  const out = clean({
    ...idOf(row),
    name: row.name,
    grade: row.grade ?? undefined,
    studentCode: row.studentCode ?? undefined,
    parentId: row.parentId ?? null,
    busId: row.busId ?? null,
    routeId: row.routeId ?? null,
    stopId: row.stopId ?? null,
    status: row.status,
    schoolId: row.schoolId,
    createdAt: row.createdAt,
  })
  if (opts?.populate) {
    if (row.parentId) out.parent = pubUser(one('SELECT * FROM users WHERE id = ?', row.parentId), { withSchool: false })
    if (row.busId) out.bus = pubBus(one('SELECT * FROM buses WHERE id = ?', row.busId))
    if (row.routeId) out.route = pubRoute(one('SELECT * FROM routes WHERE id = ?', row.routeId))
    if (row.stopId) out.stop = pubStop(one('SELECT * FROM stops WHERE id = ?', row.stopId))
  }
  return out
}

export function pubBus(row?: Row | null, opts?: { populate?: boolean }): Row | null {
  if (!row) return null
  const out = clean({
    ...idOf(row),
    number: row.number,
    plate: row.plate,
    driverId: row.driverId ?? null,
    routeId: row.routeId ?? null,
    capacity: row.capacity ?? null,
    status: row.status,
    schoolId: row.schoolId,
    createdAt: row.createdAt,
  })
  if (opts?.populate) {
    if (row.driverId) out.driver = pubUser(one('SELECT * FROM users WHERE id = ?', row.driverId), { withSchool: false })
    if (row.routeId) out.route = pubRoute(one('SELECT * FROM routes WHERE id = ?', row.routeId))
  }
  return out
}

export function pubStop(row?: Row | null): Row | null {
  if (!row) return null
  return clean({
    ...idOf(row),
    name: row.name,
    sequence: row.sequence,
    location: { type: 'Point', coordinates: [row.lng, row.lat] },
    status: row.status,
    schoolId: row.schoolId,
    createdAt: row.createdAt,
  })
}

export function routeStopIds(row: Row): string[] {
  return parseJson<string[]>(row.stopIds, [])
}

export function pubRoute(row?: Row | null, opts?: { withStops?: boolean }): Row | null {
  if (!row) return null
  const stopIds = routeStopIds(row)
  const out = clean({
    ...idOf(row),
    name: row.name,
    schoolId: row.schoolId,
    stopIds,
    status: row.status,
    createdAt: row.createdAt,
  })
  if (opts?.withStops !== false) {
    const stops = stopIds
      .map((sid) => one('SELECT * FROM stops WHERE id = ?', sid))
      .filter(Boolean)
      .sort((a: any, b: any) => Number(a.sequence) - Number(b.sequence))
      .map((s: any) => pubStop(s))
    out.stops = stops
  }
  return out
}

export function pubTrip(row?: Row | null, opts?: { populate?: boolean }): Row | null {
  if (!row) return null
  const out = clean({
    ...idOf(row),
    type: row.type,
    status: row.status,
    routeId: row.routeId,
    busId: row.busId,
    driverId: row.driverId ?? null,
    schoolId: row.schoolId,
    scheduledStart: row.scheduledStart ?? undefined,
    scheduledEnd: row.scheduledEnd ?? undefined,
    startedAt: row.startedAt ?? undefined,
    endedAt: row.endedAt ?? undefined,
    currentLocation: parseJson<Row | null>(row.currentLocation, null) ?? undefined,
    createdAt: row.createdAt,
  })
  if (opts?.populate) {
    if (row.routeId) out.route = pubRoute(one('SELECT * FROM routes WHERE id = ?', row.routeId))
    if (row.busId) out.bus = pubBus(one('SELECT * FROM buses WHERE id = ?', row.busId))
    if (row.driverId) out.driver = pubUser(one('SELECT * FROM users WHERE id = ?', row.driverId), { withSchool: false })
  }
  return out
}

export function pubAttendance(row?: Row | null, opts?: { populate?: boolean }): Row | null {
  if (!row) return null
  const out = clean({
    ...idOf(row),
    tripId: row.tripId,
    studentId: row.studentId,
    stopId: row.stopId ?? null,
    date: row.date,
    type: row.type,
    status: row.status,
    verified: !!row.verified,
    verifiedAt: row.verifiedAt ?? undefined,
    failedAttempts: Number(row.failedAttempts ?? 0),
    lockedUntil: row.lockedUntil ?? undefined,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  })
  if (opts?.populate) {
    const student = one('SELECT * FROM students WHERE id = ?', row.studentId)
    if (student) {
      out.student = {
        id: student.id,
        _id: student.id,
        name: student.name,
        grade: student.grade ?? undefined,
      }
      out.student = clean(out.student)
    }
    if (row.stopId) {
      const stop = one('SELECT * FROM stops WHERE id = ?', row.stopId)
      if (stop) out.stopName = stop.name
    }
  }
  return out
}

export function pubMessage(row?: Row | null): Row | null {
  if (!row) return null
  return clean({
    ...idOf(row),
    senderId: row.senderId,
    recipientId: row.recipientId,
    body: row.body,
    read: !!row.read,
    createdAt: row.createdAt,
  })
}

export function pubNotification(row?: Row | null): Row | null {
  if (!row) return null
  const meta = parseJson<Row | null>(row.meta, null)
  return clean({
    ...idOf(row),
    title: row.title,
    body: row.body ?? undefined,
    type: row.type,
    read: !!row.read,
    createdAt: row.createdAt,
    meta: meta ?? undefined,
  })
}

export function pubEmergency(row?: Row | null, opts?: { populate?: boolean }): Row | null {
  if (!row) return null
  const out = clean({
    ...idOf(row),
    type: row.type,
    status: row.status,
    note: row.note ?? undefined,
    studentId: row.studentId ?? null,
    createdById: row.createdById,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt ?? undefined,
    resolvedBy: row.resolvedBy ?? undefined,
    schoolId: row.schoolId ?? undefined,
  })
  if (opts?.populate) {
    if (row.studentId) {
      const s = one('SELECT * FROM students WHERE id = ?', row.studentId)
      if (s) out.student = { id: s.id, _id: s.id, name: s.name, grade: s.grade ?? undefined }
    }
    const creator = one('SELECT * FROM users WHERE id = ?', row.createdById)
    if (creator) out.createdBy = { id: creator.id, _id: creator.id, name: creator.name, role: creator.role }
  }
  return out
}

export function pubEditRequest(row?: Row | null, opts?: { populate?: boolean }): Row | null {
  if (!row) return null
  const out = clean({
    ...idOf(row),
    studentId: row.studentId,
    field: row.field,
    oldValue: row.oldValue ?? undefined,
    newValue: row.newValue,
    status: row.status,
    requestedById: row.requestedById,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt ?? undefined,
    decidedBy: row.decidedBy ?? undefined,
  })
  if (opts?.populate) {
    const s = one('SELECT * FROM students WHERE id = ?', row.studentId)
    if (s) out.studentName = s.name
    const reqUser = one('SELECT * FROM users WHERE id = ?', row.requestedById)
    if (reqUser) out.requestedByName = reqUser.name
  }
  return out
}

export function pubSchool(row?: Row | null): Row | null {
  if (!row) return null
  return clean({
    ...idOf(row),
    name: row.name,
    address: row.address ?? undefined,
    createdAt: row.createdAt,
  })
}

/** users the given user may message / see in contacts, per contract §8. */
export function allowedContacts(user: Row): Row[] {
  const dedupe = (rows: Row[]) => {
    const seen = new Set<string>()
    return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true) && r.id !== user.id))
  }
  if (user.role === 'superadmin') {
    return q('SELECT * FROM users WHERE id != ?', user.id)
  }
  if (user.role === 'admin') {
    if (!user.schoolId) return []
    return q('SELECT * FROM users WHERE schoolId = ? AND id != ?', user.schoolId, user.id)
  }
  if (user.role === 'parent') {
    const kids = q('SELECT busId FROM students WHERE parentId = ?', user.id)
    const busIds = [...new Set(kids.map((k: any) => k.busId).filter(Boolean))]
    const drivers = busIds.length
      ? q(
          `SELECT DISTINCT u.* FROM users u JOIN buses b ON b.driverId = u.id WHERE b.id IN (${busIds
            .map(() => '?')
            .join(',')})`,
          ...busIds,
        )
      : []
    const admins = user.schoolId
      ? q(`SELECT * FROM users WHERE role = 'admin' AND schoolId = ? AND id != ?`, user.schoolId, user.id)
      : []
    return dedupe([...drivers, ...admins])
  }
  if (user.role === 'driver') {
    const tripIds = q('SELECT id FROM trips WHERE driverId = ?', user.id).map((t: any) => t.id)
    const parentIds = tripIds.length
      ? q(
          `SELECT DISTINCT s.parentId AS pid FROM attendance a JOIN students s ON s.id = a.studentId
           WHERE a.tripId IN (${tripIds.map(() => '?').join(',')}) AND s.parentId IS NOT NULL`,
          ...tripIds,
        ).map((r: any) => r.pid)
      : []
    const parents = parentIds.length
      ? q(`SELECT * FROM users WHERE id IN (${parentIds.map(() => '?').join(',')})`, ...parentIds)
      : []
    const admins = user.schoolId
      ? q(`SELECT * FROM users WHERE role = 'admin' AND schoolId = ? AND id != ?`, user.schoolId, user.id)
      : []
    return dedupe([...parents, ...admins])
  }
  return []
}
