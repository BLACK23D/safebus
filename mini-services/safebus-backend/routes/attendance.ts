import { Router } from 'express'
import { count, one, q, run } from '../lib/db'
import { ApiError, h, nowIso, todayStr, verr, vd } from '../lib/util'
import { requireAuth, type Row } from '../lib/auth'
import { pubAttendance } from '../lib/serialize'
import { notify, toSchool, toTripRoom } from '../lib/sockets'

const r = Router()
r.use(requireAuth)

const LOCK_MINUTES = 5
const MAX_ATTEMPTS = 3
const CODE_TTL_SECONDS = 30

/* ------------------------------ helpers ------------------------------ */

function studentOf(attendance: Row): Row | undefined {
  return one('SELECT * FROM students WHERE id = ?', attendance.studentId)
}

function tripOf(attendance: Row): Row | undefined {
  return one('SELECT * FROM trips WHERE id = ?', attendance.tripId)
}

/** school-scoped attendance select snippet (admin+). */
const SCHOOL_JOIN = 'JOIN students st ON st.id = a.studentId'

function isAdminFor(req: any, trip: Row): boolean {
  const me = req.user
  if (me.role === 'superadmin') return true
  return me.role === 'admin' && trip.schoolId === me.schoolId
}

function assertVerifyAllowed(req: any, trip: Row) {
  const me = req.user
  if (me.role === 'driver') {
    if (trip.driverId !== me.id) throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    return
  }
  if (!isAdminFor(req, trip)) throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
}

function lockedRow(a: Row): boolean {
  return !!a.lockedUntil && new Date(a.lockedUntil).getTime() > Date.now()
}

function retryAfter(a: Row): number {
  return Math.max(1, Math.ceil((new Date(a.lockedUntil as string).getTime() - Date.now()) / 1000))
}

/* ------------------------------- list ------------------------------- */

// GET /attendance?page&limit&date&studentId&tripId
r.get(
  '/',
  h((req, res) => {
    const me = req.user
    const page = Math.max(1, Number(req.query.page || 1))
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 100)))
    const where: string[] = []
    const params: unknown[] = []

    if (me.role === 'parent') {
      where.push(`a.studentId IN (SELECT id FROM students WHERE parentId = ?)`)
      params.push(me.id)
    } else if (me.role === 'driver') {
      where.push('a.tripId IN (SELECT id FROM trips WHERE driverId = ?)')
      params.push(me.id)
    } else if (me.role !== 'superadmin') {
      where.push(`a.studentId IN (SELECT id FROM students WHERE schoolId = ?)`)
      params.push(me.schoolId)
    }

    const studentId = req.query.studentId ? String(req.query.studentId) : null
    const tripId = req.query.tripId ? String(req.query.tripId) : null
    const date = req.query.date ? String(req.query.date) : null
    if (studentId) {
      where.push('a.studentId = ?')
      params.push(studentId)
    }
    if (tripId) {
      where.push('a.tripId = ?')
      params.push(tripId)
    }
    if (date) {
      where.push('a.date = ?')
      params.push(date === 'today' ? todayStr() : date)
    }

    // silent scope enforcement for explicit filters
    if (me.role === 'parent' && studentId) {
      const own = one('SELECT id FROM students WHERE id = ? AND parentId = ?', studentId, me.id)
      if (!own) where.push('1 = 0')
    }
    if (me.role === 'driver' && tripId) {
      const own = one('SELECT id FROM trips WHERE id = ? AND driverId = ?', tripId, me.id)
      if (!own) where.push('1 = 0')
    }

    const W = where.length ? ` WHERE ${where.join(' AND ')}` : ''
    const total = count(`SELECT COUNT(*) AS c FROM attendance a ${SCHOOL_JOIN}${W}`, ...params)
    const rows = q(
      `SELECT a.* FROM attendance a ${SCHOOL_JOIN}${W} ORDER BY a.createdAt ASC LIMIT ? OFFSET ?`,
      ...params,
      limit,
      (page - 1) * limit,
    )
    res.json({
      success: true,
      data: {
        items: rows.map((a) => pubAttendance(a, { populate: true })),
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    })
  }),
)

/* --------------------------- code reveal --------------------------- */

// GET /attendance/:id/code — parent of that student only
r.get(
  '/:id/code',
  h((req, res) => {
    const a = one('SELECT * FROM attendance WHERE id = ?', req.params.id)
    if (!a) throw new ApiError(404, 'Attendance not found')
    const me = req.user
    const student = studentOf(a)
    if (me.role !== 'parent' || !student || student.parentId !== me.id) {
      throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    }
    const code = a.type === 'pickup' ? student.pickupCode : student.dropoffCode
    res.json({
      success: true,
      data: { code, type: a.type, until: new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString() },
    })
  }),
)

/* ----------------------------- verify ------------------------------ */

// POST /attendance/:id/verify { code } — driver of the trip (or admin)
r.post(
  '/:id/verify',
  h((req, res) => {
    const a = one('SELECT * FROM attendance WHERE id = ?', req.params.id)
    if (!a) throw new ApiError(404, 'Attendance not found')
    const trip = tripOf(a)
    if (!trip) throw new ApiError(404, 'Attendance not found')
    assertVerifyAllowed(req, trip)

    const code = req.body?.code
    if (!code || typeof code !== 'string') throw verr([vd('code', 'code is required')])

    const now = nowIso()

    // active lock → 423 regardless of code correctness
    if (lockedRow(a)) {
      throw new ApiError(423, 'Verification locked — too many failed attempts', 'LOCKED', undefined, {
        retryAfterSeconds: retryAfter(a),
      })
    }

    const student = studentOf(a)
    const expected = student ? (a.type === 'pickup' ? student.pickupCode : student.dropoffCode) : null
    const alreadyDone = a.status === 'picked_up' || a.status === 'dropped_off'

    if (String(code).trim() !== expected) {
      const attempts = Number(a.failedAttempts || 0) + 1
      if (attempts >= MAX_ATTEMPTS) {
        run(
          'UPDATE attendance SET failedAttempts = ?, lockedUntil = ?, updatedAt = ? WHERE id = ?',
          attempts,
          new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString(),
          now,
          a.id,
        )
        throw new ApiError(423, 'Verification locked — too many failed attempts', 'LOCKED', undefined, {
          retryAfterSeconds: LOCK_MINUTES * 60,
        })
      }
      run('UPDATE attendance SET failedAttempts = ?, updatedAt = ? WHERE id = ?', attempts, now, a.id)
      throw new ApiError(400, 'Invalid verification code', 'INVALID_CODE', undefined, {
        failedAttempts: attempts,
      })
    }

    // correct code → idempotent success if already verified
    if (alreadyDone && a.verified) {
      return res.json({ success: true, data: pubAttendance(a, { populate: true }) })
    }

    const finalStatus = a.type === 'pickup' ? 'picked_up' : 'dropped_off'
    run(
      'UPDATE attendance SET status = ?, verified = 1, verifiedAt = ?, failedAttempts = 0, lockedUntil = NULL, updatedAt = ? WHERE id = ?',
      finalStatus,
      now,
      now,
      a.id,
    )
    const fresh = one('SELECT * FROM attendance WHERE id = ?', a.id)!

    const payload = {
      attendanceId: fresh.id,
      studentId: fresh.studentId,
      studentName: student?.name,
      status: finalStatus,
      verified: true,
      tripId: fresh.tripId,
    }
    toTripRoom(fresh.tripId, 'attendance:update', payload)
    toSchool(trip.schoolId, 'attendance:update', payload)
    const sst = { studentId: fresh.studentId, status: finalStatus, tripId: fresh.tripId, at: now }
    toTripRoom(fresh.tripId, 'student:status', sst)
    toSchool(trip.schoolId, 'student:status', sst)
    if (student?.parentId) {
      notify({
        userId: student.parentId,
        title: trip.type === 'pickup' ? `${student.name} picked up` : `${student.name} dropped off`,
        body:
          trip.type === 'pickup'
            ? `${student.name} was verified onto the bus — pickup confirmed.`
            : `${student.name} was dropped off safely. Drop-off confirmed.`,
        type: 'attendance',
        meta: { tripId: fresh.tripId, studentId: student.id, attendanceId: fresh.id },
      })
    }

    res.json({ success: true, data: pubAttendance(fresh, { populate: true }) })
  }),
)

export default r
