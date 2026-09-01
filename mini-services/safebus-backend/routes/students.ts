import { Router } from 'express'
import { count, one, q, run } from '../lib/db'
import { ApiError, code6, h, newId, nowIso, vd, verr } from '../lib/util'
import { requireAuth, requireRole, type Row } from '../lib/auth'
import { pubStudent } from '../lib/serialize'

const r = Router()
r.use(requireAuth)

function schoolIdForCreate(req: any, body: any): string {
  const schoolId = req.user.role === 'superadmin' ? (body.schoolId ? String(body.schoolId) : req.user.schoolId) : req.user.schoolId
  if (!schoolId) throw verr([vd('schoolId', 'schoolId is required')])
  return schoolId
}

function assertRef(schoolId: string, path: string, id: unknown, table: string, extra = '') {
  if (id === undefined || id === null || id === '') return
  const row = one(`SELECT * FROM ${table} WHERE id = ?${extra}`, String(id))
  if (!row) throw verr([vd(path, `${path} not found`)], `${path} not found`)
  if (row.schoolId !== schoolId) throw verr([vd(path, `${path} belongs to another school`)])
  if (table === 'users' && row.role !== 'parent') throw verr([vd(path, `${path} must be a parent user`)])
}

function validateStudentRefs(schoolId: string, b: any) {
  assertRef(schoolId, 'parentId', b.parentId, 'users')
  assertRef(schoolId, 'busId', b.busId, 'buses')
  assertRef(schoolId, 'routeId', b.routeId, 'routes')
  assertRef(schoolId, 'stopId', b.stopId, 'stops')
}

// GET /students?parent=me | admin+ school list with q/page/limit
r.get(
  '/',
  h((req, res) => {
    const me = req.user
    const page = Math.max(1, Number(req.query.page || 1))
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 100)))
    const search = req.query.q ? String(req.query.q) : null
    let rows: Row[] = []
    if (me.role === 'parent') {
      let w = 'parentId = ?'
      const params: unknown[] = [me.id]
      if (search) {
        w += ' AND name LIKE ?'
        params.push(`%${search}%`)
      }
      rows = q(`SELECT * FROM students WHERE ${w} ORDER BY createdAt ASC`, ...params)
    } else if (me.role === 'driver') {
      throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    } else {
      const params: unknown[] = []
      let w = ''
      if (me.role !== 'superadmin') {
        w = 'schoolId = ?'
        params.push(me.schoolId)
      }
      if (search) {
        w = w ? w + ' AND ' : ''
        w += 'name LIKE ?'
        params.push(`%${search}%`)
      }
      const W = w ? ` WHERE ${w}` : ''
      const total = count(`SELECT COUNT(*) AS c FROM students${W}`, ...params)
      rows = q(`SELECT * FROM students${W} ORDER BY createdAt ASC LIMIT ? OFFSET ?`, ...params, limit, (page - 1) * limit)
      return res.json({
        success: true,
        data: { items: rows.map((s) => pubStudent(s)), total, page, pages: Math.ceil(total / limit) },
      })
    }
    res.json({
      success: true,
      data: { items: rows.map((s) => pubStudent(s)), total: rows.length, page: 1, pages: 1 },
    })
  }),
)

// POST /students
r.post(
  '/',
  requireRole('admin'),
  h((req, res) => {
    const b = req.body || {}
    if (!b.name || !String(b.name).trim()) throw verr([vd('name', 'Name is required')])
    const schoolId = schoolIdForCreate(req, b)
    validateStudentRefs(schoolId, b)
    if (b.status && !['active', 'inactive'].includes(b.status)) throw verr([vd('status', 'Invalid status')])
    const id = newId()
    run(
      `INSERT INTO students (id, name, grade, studentCode, parentId, busId, routeId, stopId, status, schoolId, pickupCode, dropoffCode, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      String(b.name).trim(),
      b.grade ? String(b.grade) : null,
      b.studentCode ? String(b.studentCode) : null,
      b.parentId ? String(b.parentId) : null,
      b.busId ? String(b.busId) : null,
      b.routeId ? String(b.routeId) : null,
      b.stopId ? String(b.stopId) : null,
      b.status ? String(b.status) : 'active',
      schoolId,
      code6(),
      code6(),
      nowIso(),
    )
    const student = one('SELECT * FROM students WHERE id = ?', id)!
    res.status(201).json({ success: true, data: pubStudent(student) })
  }),
)

// GET /students/:id — populated parent/bus/route/stop; parent sees own child only
r.get(
  '/:id',
  h((req, res) => {
    const student = one('SELECT * FROM students WHERE id = ?', req.params.id)
    if (!student) throw new ApiError(404, 'Student not found')
    const me = req.user
    if (me.role === 'parent') {
      if (student.parentId !== me.id) throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    } else if (me.role === 'driver') {
      throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    } else if (me.role !== 'superadmin' && student.schoolId !== me.schoolId) {
      throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    }
    res.json({ success: true, data: pubStudent(student, { populate: true }) })
  }),
)

// PATCH /students/:id
r.patch(
  '/:id',
  requireRole('admin'),
  h((req, res) => {
    const student = one('SELECT * FROM students WHERE id = ?', req.params.id)
    if (!student) throw new ApiError(404, 'Student not found')
    if (req.user.role !== 'superadmin' && student.schoolId !== req.user.schoolId) {
      throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    }
    const b = req.body || {}
    const schoolId = student.schoolId
    validateStudentRefs(schoolId, b)
    if (b.status !== undefined && !['active', 'inactive'].includes(b.status)) throw verr([vd('status', 'Invalid status')])
    if (b.name !== undefined) run('UPDATE students SET name = ? WHERE id = ?', String(b.name).trim(), student.id)
    if (b.grade !== undefined) run('UPDATE students SET grade = ? WHERE id = ?', b.grade === null ? null : String(b.grade), student.id)
    if (b.studentCode !== undefined) run('UPDATE students SET studentCode = ? WHERE id = ?', b.studentCode ? String(b.studentCode) : null, student.id)
    if (b.parentId !== undefined) run('UPDATE students SET parentId = ? WHERE id = ?', b.parentId ? String(b.parentId) : null, student.id)
    if (b.busId !== undefined) run('UPDATE students SET busId = ? WHERE id = ?', b.busId ? String(b.busId) : null, student.id)
    if (b.routeId !== undefined) run('UPDATE students SET routeId = ? WHERE id = ?', b.routeId ? String(b.routeId) : null, student.id)
    if (b.stopId !== undefined) run('UPDATE students SET stopId = ? WHERE id = ?', b.stopId ? String(b.stopId) : null, student.id)
    if (b.status !== undefined) run('UPDATE students SET status = ? WHERE id = ?', String(b.status), student.id)
    const fresh = one('SELECT * FROM students WHERE id = ?', student.id)!
    res.json({ success: true, data: pubStudent(fresh) })
  }),
)

// DELETE /students/:id
r.delete(
  '/:id',
  requireRole('admin'),
  h((req, res) => {
    const student = one('SELECT * FROM students WHERE id = ?', req.params.id)
    if (!student) throw new ApiError(404, 'Student not found')
    if (req.user.role !== 'superadmin' && student.schoolId !== req.user.schoolId) {
      throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    }
    run('DELETE FROM students WHERE id = ?', student.id)
    res.json({ success: true, data: { ok: true } })
  }),
)

export default r
