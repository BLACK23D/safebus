import { Router } from 'express'
import { one, q, run } from '../lib/db'
import { ApiError, h, newId, nowIso, vd, verr } from '../lib/util'
import { requireAuth, requireRole, type Row } from '../lib/auth'
import { pubEditRequest } from '../lib/serialize'
import { notify } from '../lib/sockets'

const r = Router()
r.use(requireAuth)

const FIELDS = ['name', 'grade']

/* ------------------------------- list ------------------------------- */

// GET /edit-requests (admin+ ?status=pending; parent ?mine=1) — parent always sees own
r.get(
  '/',
  h((req, res) => {
    const me = req.user
    let rows: Row[] = []
    if (me.role === 'parent') {
      rows = q('SELECT * FROM edit_requests WHERE requestedById = ? ORDER BY createdAt DESC', me.id)
    } else if (me.role === 'superadmin') {
      const status = req.query.status ? String(req.query.status) : null
      rows = status
        ? q('SELECT * FROM edit_requests WHERE status = ? ORDER BY createdAt DESC', status)
        : q('SELECT * FROM edit_requests ORDER BY createdAt DESC')
    } else {
      const status = req.query.status ? String(req.query.status) : null
      rows = status
        ? q('SELECT * FROM edit_requests WHERE schoolId = ? AND status = ? ORDER BY createdAt DESC', me.schoolId, status)
        : q('SELECT * FROM edit_requests WHERE schoolId = ? ORDER BY createdAt DESC', me.schoolId)
    }
    res.json({ success: true, data: rows.map((e) => pubEditRequest(e, { populate: true })) })
  }),
)

/* ------------------------------ create ------------------------------ */

// POST /edit-requests { studentId, field, newValue } — parent of that student; field ∈ name | grade
r.post(
  '/',
  h((req, res) => {
    const me = req.user
    if (me.role !== 'parent') throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    const b = req.body || {}
    const details = []
    if (!b.studentId) details.push(vd('studentId', 'studentId is required'))
    if (!b.field || !FIELDS.includes(String(b.field))) details.push(vd('field', `field must be one of ${FIELDS.join(' | ')}`))
    if (b.newValue === undefined || b.newValue === null || String(b.newValue).trim() === '') {
      details.push(vd('newValue', 'newValue is required'))
    }
    if (details.length) throw verr(details)

    const student = one('SELECT * FROM students WHERE id = ?', String(b.studentId))
    if (!student) throw new ApiError(404, 'Student not found')
    if (student.parentId !== me.id) throw new ApiError(403, 'Forbidden', 'FORBIDDEN')

    const existing = one(
      `SELECT * FROM edit_requests WHERE studentId = ? AND field = ? AND status = 'pending'`,
      student.id,
      String(b.field),
    )
    if (existing) {
      throw new ApiError(409, 'A pending request already exists for this field', 'INVALID_STATE')
    }

    const oldValue = String(b.field) === 'grade' ? student.grade ?? null : student.name
    const id = newId()
    run(
      `INSERT INTO edit_requests (id, studentId, field, oldValue, newValue, status, requestedById, schoolId, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      id,
      student.id,
      String(b.field),
      oldValue,
      String(b.newValue).trim(),
      'pending',
      me.id,
      student.schoolId,
      nowIso(),
    )
    const row = one('SELECT * FROM edit_requests WHERE id = ?', id)!
    res.status(201).json({ success: true, data: pubEditRequest(row, { populate: true }) })
  }),
)

/* ------------------------------ decide ------------------------------ */

// PATCH /edit-requests/:id { action: "approve" | "reject" } — admin+
r.patch(
  '/:id',
  requireRole('admin'),
  h((req, res) => {
    const me = req.user
    const row = one('SELECT * FROM edit_requests WHERE id = ?', req.params.id)
    if (!row) throw new ApiError(404, 'Edit request not found')
    if (me.role !== 'superadmin' && row.schoolId !== me.schoolId) {
      throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    }
    const action = req.body?.action
    if (!['approve', 'reject'].includes(String(action))) {
      throw verr([vd('action', 'action must be "approve" or "reject"')])
    }
    if (row.status !== 'pending') {
      throw new ApiError(409, `Edit request is already ${row.status}`, 'INVALID_STATE')
    }

    const now = nowIso()
    const student = one('SELECT * FROM students WHERE id = ?', row.studentId)
    if (action === 'approve' && student) {
      if (row.field === 'grade') run('UPDATE students SET grade = ? WHERE id = ?', row.newValue, student.id)
      else if (row.field === 'name') run('UPDATE students SET name = ? WHERE id = ?', row.newValue, student.id)
    }
    run('UPDATE edit_requests SET status = ?, decidedAt = ?, decidedBy = ? WHERE id = ?', action === 'approve' ? 'approved' : 'rejected', now, me.id, row.id)
    const fresh = one('SELECT * FROM edit_requests WHERE id = ?', row.id)!

    if (row.requestedById) {
      const verb = action === 'approve' ? 'approved' : 'rejected'
      notify({
        userId: row.requestedById,
        title: `Profile change ${verb}`,
        body: `Your request to change ${student?.name ?? 'your child'}'s ${row.field} to "${row.newValue}" was ${verb}.`,
        type: 'edit-request',
        meta: { editRequestId: fresh.id, studentId: row.studentId },
      })
    }
    res.json({ success: true, data: pubEditRequest(fresh, { populate: true }) })
  }),
)

export default r
