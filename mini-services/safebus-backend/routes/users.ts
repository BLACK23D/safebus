import { Router } from 'express'
import { count, one, q, run } from '../lib/db'
import {
  ApiError,
  checkPassword,
  h,
  newId,
  nowIso,
  newInviteToken,
  vd,
  verr,
} from '../lib/util'
import {
  hashPassword,
  rawBody,
  requireAuth,
  requireRole,
  type Row,
} from '../lib/auth'
import { pubUser } from '../lib/serialize'

const r = Router()
r.use(requireAuth)

const ROLES = ['parent', 'driver', 'admin', 'superadmin']
const STATUSES = ['active', 'inactive', 'suspended', 'invited']

function scopedUser(req: any): Row | undefined {
  const u = one('SELECT * FROM users WHERE id = ?', req.params.id)
  if (!u) return undefined
  if (req.user.role !== 'superadmin' && u.schoolId !== req.user.schoolId) {
    throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
  }
  return u
}

// GET /users?role&status&q&page&limit&schoolId
r.get(
  '/',
  requireRole('admin'),
  h((req, res) => {
    const me = req.user
    const { role, status, q: search, schoolId } = req.query
    const page = Math.max(1, Number(req.query.page || 1))
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 100)))
    let where: string[] = []
    const params: unknown[] = []
    if (me.role === 'superadmin') {
      if (schoolId) {
        where.push('schoolId = ?')
        params.push(schoolId)
      }
    } else {
      where.push('schoolId = ?')
      params.push(me.schoolId)
    }
    if (role) {
      where.push('role = ?')
      params.push(role)
    }
    if (status) {
      where.push('status = ?')
      params.push(status)
    }
    if (search) {
      where.push('(name LIKE ? OR email LIKE ?)')
      params.push(`%${search}%`, `%${search}%`)
    }
    const W = where.length ? ` WHERE ${where.join(' AND ')}` : ''
    const total = count(`SELECT COUNT(*) AS c FROM users${W}`, ...params)
    const rows = q(
      `SELECT * FROM users${W} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      ...params,
      limit,
      (page - 1) * limit,
    )
    res.json({
      success: true,
      data: {
        items: rows.map((u: Row) => pubUser(u, { withSchool: false })),
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    })
  }),
)

// POST /users — admin+; driver → invited + inviteToken
r.post(
  '/',
  requireRole('admin'),
  h((req, res) => {
    const b = req.body || {}
    const me = req.user
    const details = []
    if (!b.name || !String(b.name).trim()) details.push(vd('name', 'Name is required'))
    if (!b.email || !/^\S+@\S+\.\S+$/.test(String(b.email))) details.push(vd('email', 'A valid email is required'))
    if (!b.role) details.push(vd('role', 'Role is required'))
    if (details.length) throw verr(details)
    if (!ROLES.includes(b.role)) throw verr([vd('role', 'Invalid role')])
    if (b.role === 'superadmin' && me.role !== 'superadmin') {
      throw new ApiError(403, 'Only a superadmin can create superadmins', 'FORBIDDEN')
    }
    checkPassword(b.password)
    const email = String(b.email).trim().toLowerCase()
    if (one('SELECT id FROM users WHERE email = ?', email)) {
      throw verr([vd('email', 'Email already registered')], 'Email already registered')
    }
    const schoolId =
      me.role === 'superadmin' ? (b.schoolId ? String(b.schoolId) : me.schoolId) : me.schoolId
    if (!schoolId) throw verr([vd('schoolId', 'schoolId is required')])
    if (!one('SELECT id FROM schools WHERE id = ?', schoolId)) {
      throw verr([vd('schoolId', 'School not found')], 'School not found')
    }
    const isDriver = b.role === 'driver'
    const id = newId()
    const status = isDriver ? 'invited' : 'active'
    const inviteToken = isDriver ? newInviteToken() : null
    run(
      `INSERT INTO users (id, name, email, phone, passwordHash, role, schoolId, avatar, verified, status, inviteToken, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      String(b.name).trim(),
      email,
      b.phone ? String(b.phone) : null,
      hashPassword(String(b.password)),
      b.role,
      schoolId,
      null,
      isDriver ? 0 : 1,
      status,
      inviteToken,
      nowIso(),
    )
    const user = one('SELECT * FROM users WHERE id = ?', id)!
    res.status(201).json({ success: true, data: pubUser(user) })
  }),
)

// PATCH /users/me
r.patch(
  '/me',
  h((req, res) => {
    const b = req.body || {}
    if (b.name !== undefined) {
      if (!String(b.name).trim()) throw verr([vd('name', 'Name cannot be empty')])
      run('UPDATE users SET name = ? WHERE id = ?', String(b.name).trim(), req.user.id)
    }
    if (b.phone !== undefined) run('UPDATE users SET phone = ? WHERE id = ?', b.phone ? String(b.phone) : null, req.user.id)
    const user = one('SELECT * FROM users WHERE id = ?', req.user.id)!
    res.json({ success: true, data: pubUser(user) })
  }),
)

// POST /users/me/avatar — multipart field `avatar` OR JSON { imageBase64 }.
// Caps: 2 MB raw upload; stored data URL ≤ ~2.8 MB base64; image/* MIME only.
const AVATAR_MAX_BYTES = 2 * 1024 * 1024
r.post(
  '/me/avatar',
  rawBody,
  h(async (req, res) => {
    const ct = String(req.headers['content-type'] || '')
    let dataUrl: string | null = null
    if (ct.includes('multipart/form-data')) {
      const buf: Buffer = (req as any).rawBody
      if (!buf || !buf.length) throw new ApiError(400, 'Empty multipart body')
      if (buf.length > AVATAR_MAX_BYTES + 64 * 1024) {
        throw new ApiError(413, 'Avatar too large — maximum is 2 MB', 'PAYLOAD_TOO_LARGE')
      }
      const form = await new Response(buf, { headers: { 'content-type': ct } }).formData()
      const file = form.get('avatar')
      if (!file || typeof file === 'string') {
        throw verr([vd('avatar', 'avatar file field is required')])
      }
      const mime = (file as File).type || 'image/jpeg'
      if (!mime.startsWith('image/')) {
        throw verr([vd('avatar', 'avatar must be an image')])
      }
      const ab = await (file as File).arrayBuffer()
      if (ab.byteLength > AVATAR_MAX_BYTES) {
        throw new ApiError(413, 'Avatar too large — maximum is 2 MB', 'PAYLOAD_TOO_LARGE')
      }
      const b64 = Buffer.from(ab).toString('base64')
      dataUrl = `data:${mime};base64,${b64}`
    } else {
      const img = req.body?.imageBase64
      if (!img || typeof img !== 'string') {
        throw verr([vd('imageBase64', 'imageBase64 (JSON) or multipart avatar field is required')])
      }
      if (img.length > Math.ceil(AVATAR_MAX_BYTES * 4 / 3) + 128) {
        throw new ApiError(413, 'Avatar too large — maximum is 2 MB', 'PAYLOAD_TOO_LARGE')
      }
      const raw = (img as string).startsWith('data:') ? (img as string) : `data:image/jpeg;base64,${img}`
      if (!/^data:image\//.test(raw)) {
        throw verr([vd('imageBase64', 'avatar must be an image data URL')])
      }
      dataUrl = raw
    }
    run('UPDATE users SET avatar = ? WHERE id = ?', dataUrl, req.user.id)
    res.json({ success: true, data: { avatarUrl: dataUrl } })
  }),
)

// GET /users/:id
r.get(
  '/:id',
  requireRole('admin'),
  h((req, res) => {
    const user = scopedUser(req)
    if (!user) throw new ApiError(404, 'User not found')
    res.json({ success: true, data: pubUser(user) })
  }),
)

// PATCH /users/:id
r.patch(
  '/:id',
  requireRole('admin'),
  h((req, res) => {
    const user = scopedUser(req)
    if (!user) throw new ApiError(404, 'User not found')
    if (user.role === 'superadmin' && req.user.role !== 'superadmin') {
      throw new ApiError(403, 'Cannot modify a superadmin account', 'FORBIDDEN')
    }
    const b = req.body || {}
    if (b.role !== undefined && !ROLES.includes(b.role)) throw verr([vd('role', 'Invalid role')])
    if (b.role === 'superadmin' && req.user.role !== 'superadmin') {
      throw new ApiError(403, 'Only a superadmin can grant the superadmin role', 'FORBIDDEN')
    }
    if (b.status !== undefined && !STATUSES.includes(b.status)) throw verr([vd('status', 'Invalid status')])
    if (b.email !== undefined) {
      const email = String(b.email).trim().toLowerCase()
      const clash = one('SELECT id FROM users WHERE email = ? AND id != ?', email, user.id)
      if (clash) throw verr([vd('email', 'Email already registered')], 'Email already registered')
      run('UPDATE users SET email = ? WHERE id = ?', email, user.id)
    }
    if (b.name !== undefined) run('UPDATE users SET name = ? WHERE id = ?', String(b.name).trim(), user.id)
    if (b.phone !== undefined)
      run('UPDATE users SET phone = ? WHERE id = ?', b.phone ? String(b.phone) : null, user.id)
    if (b.role !== undefined) run('UPDATE users SET role = ? WHERE id = ?', b.role, user.id)
    if (b.status !== undefined) run('UPDATE users SET status = ? WHERE id = ?', b.status, user.id)
    if (b.password !== undefined) {
      checkPassword(b.password)
      run('UPDATE users SET passwordHash = ? WHERE id = ?', hashPassword(String(b.password)), user.id)
    }
    const fresh = one('SELECT * FROM users WHERE id = ?', user.id)!
    res.json({ success: true, data: pubUser(fresh) })
  }),
)

// DELETE /users/:id
r.delete(
  '/:id',
  requireRole('admin'),
  h((req, res) => {
    const user = scopedUser(req)
    if (!user) throw new ApiError(404, 'User not found')
    if (user.role === 'superadmin' && req.user.role !== 'superadmin') {
      throw new ApiError(403, 'Cannot delete a superadmin account', 'FORBIDDEN')
    }
    run('DELETE FROM refresh_tokens WHERE userId = ?', user.id)
    run('DELETE FROM device_tokens WHERE userId = ?', user.id)
    run('DELETE FROM notifications WHERE userId = ?', user.id)
    run('DELETE FROM users WHERE id = ?', user.id)
    res.json({ success: true, data: { ok: true } })
  }),
)

export default r
