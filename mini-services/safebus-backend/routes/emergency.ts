import { Router } from 'express'
import { one, q, run } from '../lib/db'
import { ApiError, h, newId, nowIso, vd, verr } from '../lib/util'
import { requireAuth, requireRole, type Row } from '../lib/auth'
import { pubEmergency } from '../lib/serialize'
import { toUser } from '../lib/sockets'

const r = Router()
r.use(requireAuth)

const TYPES = ['medical', 'accident', 'behavior', 'other']

/* ------------------------------ helpers ------------------------------ */

function schoolAudience(schoolId: string | null | undefined): string[] {
  if (!schoolId) return []
  return q(
    `SELECT id FROM users WHERE schoolId = ? AND role IN ('admin','driver') AND status = 'active'`,
    schoolId,
  ).map((u: any) => u.id)
}

/* ------------------------------- list ------------------------------- */

// GET /emergency — parent: own alerts; driver/admin+: school-scoped
r.get(
  '/',
  h((req, res) => {
    const me = req.user
    let rows: Row[] = []
    if (me.role === 'parent') {
      rows = q('SELECT * FROM emergencies WHERE createdById = ? ORDER BY createdAt DESC', me.id)
    } else if (me.role === 'superadmin') {
      rows = q('SELECT * FROM emergencies ORDER BY createdAt DESC')
    } else {
      rows = q('SELECT * FROM emergencies WHERE schoolId = ? ORDER BY createdAt DESC', me.schoolId)
    }
    res.json({ success: true, data: rows.map((e) => pubEmergency(e, { populate: true })) })
  }),
)

/* ------------------------------ create ------------------------------ */

// POST /emergency { type, note?, studentId? } — parent; driver with studentId of a child on own trip
r.post(
  '/',
  h((req, res) => {
    const me = req.user
    const b = req.body || {}
    const details = []
    if (!b.type || !TYPES.includes(String(b.type))) details.push(vd('type', `type must be one of ${TYPES.join(' | ')}`))
    if (details.length) throw verr(details)

    let studentId: string | null = null
    if (b.studentId) {
      const student = one('SELECT * FROM students WHERE id = ?', String(b.studentId))
      if (!student) throw verr([vd('studentId', 'studentId not found')], 'studentId not found')
      if (me.role === 'parent' && student.parentId !== me.id) {
        throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
      }
      if (me.role === 'driver') {
        const onOwnTrip = one(
          `SELECT 1 FROM attendance a JOIN trips t ON t.id = a.tripId
           WHERE a.studentId = ? AND t.driverId = ? LIMIT 1`,
          student.id,
          me.id,
        )
        if (!onOwnTrip) throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
      }
      studentId = student.id
    } else if (me.role === 'driver') {
      throw verr([vd('studentId', 'studentId of a child on your trip is required')])
    }

    const id = newId()
    run(
      `INSERT INTO emergencies (id, type, status, note, studentId, schoolId, createdById, createdAt)
       VALUES (?,?,?,?,?,?,?,?)`,
      id,
      String(b.type),
      'active',
      b.note ? String(b.note) : null,
      studentId,
      me.schoolId,
      me.id,
      nowIso(),
    )
    const row = one('SELECT * FROM emergencies WHERE id = ?', id)!
    const payload = {
      id: row.id,
      _id: row.id,
      type: row.type,
      status: row.status,
      note: row.note ?? undefined,
      studentId: row.studentId ?? undefined,
      createdBy: { id: me.id, _id: me.id, name: me.name, role: me.role },
      createdAt: row.createdAt,
    }
    // school admins + drivers + creator
    for (const uid of schoolAudience(me.schoolId)) {
      toUser(uid, 'emergency:new', payload)
    }
    toUser(me.id, 'emergency:new', payload)
    res.status(201).json({ success: true, data: pubEmergency(row, { populate: true }) })
  }),
)

/* ------------------------------ resolve ----------------------------- */

// PATCH /emergency/:id { status: "resolved" | "cancelled" } — admin+
r.patch(
  '/:id',
  requireRole('admin'),
  h((req, res) => {
    const me = req.user
    const row = one('SELECT * FROM emergencies WHERE id = ?', req.params.id)
    if (!row) throw new ApiError(404, 'Emergency not found')
    if (me.role !== 'superadmin' && row.schoolId !== me.schoolId) {
      throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    }
    const status = req.body?.status
    if (!['resolved', 'cancelled'].includes(String(status))) {
      throw verr([vd('status', 'status must be "resolved" or "cancelled"')])
    }
    if (row.status !== 'active') {
      throw new ApiError(409, `Emergency is already ${row.status}`, 'INVALID_STATE')
    }
    const now = nowIso()
    run('UPDATE emergencies SET status = ?, resolvedAt = ?, resolvedBy = ? WHERE id = ?', status, now, me.id, row.id)
    const fresh = one('SELECT * FROM emergencies WHERE id = ?', row.id)!
    const payload = { id: fresh.id, status: fresh.status, resolvedAt: fresh.resolvedAt, resolvedBy: fresh.resolvedBy }
    for (const uid of schoolAudience(fresh.schoolId)) {
      toUser(uid, 'emergency:update', payload)
    }
    toUser(fresh.createdById, 'emergency:update', payload)
    res.json({ success: true, data: pubEmergency(fresh, { populate: true }) })
  }),
)

/* ----------------------------- contacts ----------------------------- */

// GET /emergency/contacts — school emergency contacts
r.get(
  '/contacts',
  h((req, res) => {
    const me = req.user
    const rows = me.schoolId
      ? q('SELECT name, role, phone FROM emergency_contacts WHERE schoolId = ? ORDER BY name ASC', me.schoolId)
      : []
    res.json({ success: true, data: { items: rows } })
  }),
)

export default r
