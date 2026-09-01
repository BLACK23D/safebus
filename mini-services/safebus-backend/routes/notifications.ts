import { Router } from 'express'
import { count, one, q, run } from '../lib/db'
import { h, verr, vd } from '../lib/util'
import { requireAuth, requireRole, type Row } from '../lib/auth'
import { pubNotification } from '../lib/serialize'
import { notify } from '../lib/sockets'

const r = Router()
r.use(requireAuth)

/* ------------------------------ list ------------------------------ */

// GET /notifications?page&limit → { items, unread, total, page, pages }
r.get(
  '/',
  h((req, res) => {
    const me = req.user
    const page = Math.max(1, Number(req.query.page || 1))
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)))
    const total = count('SELECT COUNT(*) AS c FROM notifications WHERE userId = ?', me.id)
    const unread = count('SELECT COUNT(*) AS c FROM notifications WHERE userId = ? AND read = 0', me.id)
    const rows = q(
      'SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?',
      me.id,
      limit,
      (page - 1) * limit,
    )
    res.json({
      success: true,
      data: {
        items: rows.map((n: Row) => pubNotification(n)),
        unread,
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    })
  }),
)

// GET /notifications/unread-count
r.get(
  '/unread-count',
  h((req, res) => {
    const unread = count('SELECT COUNT(*) AS c FROM notifications WHERE userId = ? AND read = 0', req.user.id)
    res.json({ success: true, data: { unread } })
  }),
)

/* ---------------------------- read ops ---------------------------- */

// PATCH /notifications/read-all
r.patch(
  '/read-all',
  h((req, res) => {
    run('UPDATE notifications SET read = 1 WHERE userId = ? AND read = 0', req.user.id)
    res.json({ success: true, data: { ok: true } })
  }),
)

// PATCH /notifications/:id/read
r.patch(
  '/:id/read',
  h((req, res) => {
    const n = one('SELECT * FROM notifications WHERE id = ?', req.params.id)
    if (!n || n.userId !== req.user.id) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
        error: { message: 'Notification not found', code: 'NOT_FOUND' },
      })
    }
    run('UPDATE notifications SET read = 1 WHERE id = ?', n.id)
    res.json({ success: true, data: { ok: true } })
  }),
)

/* --------------------------- broadcast ---------------------------- */

// POST /notifications/broadcast (admin+) { title, body?, targetRole? }
r.post(
  '/broadcast',
  requireRole('admin'),
  h((req, res) => {
    const me = req.user
    const { title, body, targetRole } = req.body || {}
    const details = []
    if (!title || !String(title).trim()) details.push(vd('title', 'title is required'))
    if (targetRole !== undefined && !['parent', 'driver', 'admin', 'superadmin'].includes(targetRole)) {
      details.push(vd('targetRole', 'targetRole must be one of parent | driver | admin | superadmin'))
    }
    if (details.length) throw verr(details)

    let where = 'status = ?'
    const params: unknown[] = ['active']
    if (me.role === 'superadmin') {
      // superadmin capability spans all schools
    } else {
      where += ' AND schoolId = ?'
      params.push(me.schoolId)
    }
    if (targetRole) {
      where += ' AND role = ?'
      params.push(String(targetRole))
    }
    const targets = q(`SELECT * FROM users WHERE ${where} AND id != ?`, ...params, me.id)

    let created = 0
    for (const u of targets) {
      notify({
        userId: u.id,
        title: String(title).trim(),
        body: body ? String(body) : undefined,
        type: 'broadcast',
        meta: { broadcastById: me.id },
      })
      created++
    }
    res.status(201).json({ success: true, data: { ok: true, created } })
  }),
)

export default r
