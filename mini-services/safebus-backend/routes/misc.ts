import { Router } from 'express'
import { count, one, q, run } from '../lib/db'
import { ApiError, h, newId, nowIso, vd, verr } from '../lib/util'
import { requireAuth, requireRole, type Row } from '../lib/auth'
import { pubSchool } from '../lib/serialize'

const r = Router()
r.use(requireAuth)

/* ------------------------------ config ------------------------------- */

// GET /config/maps — sandbox has no Google key; UI degrades to schematic map
r.get(
  '/config/maps',
  h((_req, res) => {
    res.json({ success: true, data: { apiKey: '', provider: 'none' } })
  }),
)

/* --------------------------- device tokens --------------------------- */

// POST /device-tokens { token, platform: "web" } — stored; no-op push in sandbox
r.post(
  '/device-tokens',
  h((req, res) => {
    const { token, platform } = req.body || {}
    if (!token || typeof token !== 'string') throw verr([vd('token', 'token is required')])
    const plat = ['web', 'ios', 'android'].includes(String(platform)) ? String(platform) : 'web'
    const existing = one('SELECT id FROM device_tokens WHERE token = ? AND userId = ?', String(token), req.user.id)
    if (!existing) {
      run(
        'INSERT INTO device_tokens (id, token, platform, userId, createdAt) VALUES (?,?,?,?,?)',
        newId(),
        String(token),
        plat,
        req.user.id,
        nowIso(),
      )
    }
    res.status(201).json({ success: true, data: { ok: true } })
  }),
)

/* ------------------------------ schools ------------------------------ */

// GET /schools — superadmin: all; others: own school
r.get(
  '/schools',
  h((req, res) => {
    const me = req.user
    const rows =
      me.role === 'superadmin'
        ? q('SELECT * FROM schools ORDER BY createdAt ASC')
        : me.schoolId
          ? q('SELECT * FROM schools WHERE id = ?', me.schoolId)
          : []
    res.json({ success: true, data: { items: rows.map((s) => pubSchool(s)), total: rows.length, page: 1, pages: 1 } })
  }),
)

// POST /schools — superadmin only
r.post(
  '/schools',
  requireRole('superadmin'),
  h((req, res) => {
    const b = req.body || {}
    if (!b.name || !String(b.name).trim()) throw verr([vd('name', 'Name is required')])
    const id = newId()
    run('INSERT INTO schools (id, name, address, createdAt) VALUES (?,?,?,?)', id, String(b.name).trim(), b.address ? String(b.address) : null, nowIso())
    const school = one('SELECT * FROM schools WHERE id = ?', id)!
    res.status(201).json({ success: true, data: pubSchool(school) })
  }),
)

// GET /schools/:id
r.get(
  '/schools/:id',
  h((req, res) => {
    const school = one('SELECT * FROM schools WHERE id = ?', req.params.id)
    if (!school) throw new ApiError(404, 'School not found')
    if (req.user.role !== 'superadmin' && school.id !== req.user.schoolId) {
      throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    }
    res.json({ success: true, data: pubSchool(school) })
  }),
)

// PATCH /schools/:id — superadmin only
r.patch(
  '/schools/:id',
  requireRole('superadmin'),
  h((req, res) => {
    const school = one('SELECT * FROM schools WHERE id = ?', req.params.id)
    if (!school) throw new ApiError(404, 'School not found')
    const b = req.body || {}
    if (b.name !== undefined) {
      if (!String(b.name).trim()) throw verr([vd('name', 'Name cannot be empty')])
      run('UPDATE schools SET name = ? WHERE id = ?', String(b.name).trim(), school.id)
    }
    if (b.address !== undefined) run('UPDATE schools SET address = ? WHERE id = ?', b.address ? String(b.address) : null, school.id)
    const fresh = one('SELECT * FROM schools WHERE id = ?', school.id)!
    res.json({ success: true, data: pubSchool(fresh) })
  }),
)

// DELETE /schools/:id — superadmin only; blocked while users/students reference it
r.delete(
  '/schools/:id',
  requireRole('superadmin'),
  h((req, res) => {
    const school = one('SELECT * FROM schools WHERE id = ?', req.params.id)
    if (!school) throw new ApiError(404, 'School not found')
    const users = count('SELECT COUNT(*) AS c FROM users WHERE schoolId = ?', school.id)
    const students = count('SELECT COUNT(*) AS c FROM students WHERE schoolId = ?', school.id)
    if (users > 0 || students > 0) {
      throw new ApiError(409, 'School still has users or students and cannot be deleted', 'INVALID_STATE')
    }
    run('DELETE FROM schools WHERE id = ?', school.id)
    res.json({ success: true, data: { ok: true } })
  }),
)

/* ------------------------------- health ------------------------------- */

export function healthHandler(_req: any, res: any) {
  res.json({ status: 'ok', uptime: process.uptime() })
}

export default r
