import { Router } from 'express'
import { count, one, q, run } from '../lib/db'
import { ApiError, h, nowIso, verr, vd } from '../lib/util'
import { requireAuth, type Row } from '../lib/auth'
import { allowedContacts, pubMessage } from '../lib/serialize'
import { toUser } from '../lib/sockets'

const r = Router()
r.use(requireAuth)

function contactIds(user: Row): Set<string> {
  return new Set(allowedContacts(user).map((u) => u.id))
}

/* ------------------------- conversations ------------------------- */

// GET /messages/conversations — server-enforced contact discovery, enriched
r.get(
  '/conversations',
  h((req, res) => {
    const me = req.user
    const items = allowedContacts(me).map((u) => {
      const last = one(
        `SELECT * FROM messages WHERE (senderId = ? AND recipientId = ?) OR (senderId = ? AND recipientId = ?)
         ORDER BY createdAt DESC LIMIT 1`,
        me.id,
        u.id,
        u.id,
        me.id,
      )
      const unread = count(
        'SELECT COUNT(*) AS c FROM messages WHERE senderId = ? AND recipientId = ? AND read = 0',
        u.id,
        me.id,
      )
      return {
        userId: u.id,
        name: u.name,
        role: u.role,
        avatar: u.avatar ?? undefined,
        lastMessage: last?.body ?? undefined,
        lastAt: last?.createdAt ?? undefined,
        unread,
      }
    })
    items.sort((a: any, b: any) => {
      if (a.lastAt && b.lastAt) return a.lastAt < b.lastAt ? 1 : -1
      if (a.lastAt) return -1
      if (b.lastAt) return 1
      return String(a.name).localeCompare(String(b.name))
    })
    res.json({ success: true, data: items })
  }),
)

/* ---------------------------- contacts ---------------------------- */

// GET /messages/contacts?q? — compose dialog
r.get(
  '/contacts',
  h((req, res) => {
    const me = req.user
    const search = req.query.q ? String(req.query.q).toLowerCase() : null
    const items = allowedContacts(me)
      .filter((u) => !search || String(u.name).toLowerCase().includes(search) || String(u.email).toLowerCase().includes(search))
      .map((u) => ({ userId: u.id, name: u.name, role: u.role }))
      .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))
    res.json({ success: true, data: items })
  }),
)

/* ----------------------------- thread ----------------------------- */

// GET /messages?userId=X&limit=50 — thread + marks incoming read (emits message:read)
r.get(
  '/',
  h((req, res) => {
    const me = req.user
    const peerId = req.query.userId ? String(req.query.userId) : null
    if (!peerId) throw verr([vd('userId', 'userId query parameter is required')])
    if (!contactIds(me).has(peerId)) throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
    const peer = one('SELECT * FROM users WHERE id = ?', peerId)
    if (!peer) throw new ApiError(404, 'User not found')

    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)))

    // mark incoming unread as read BEFORE selecting, so the response reflects it
    const unread = q(
      'SELECT id FROM messages WHERE senderId = ? AND recipientId = ? AND read = 0',
      peerId,
      me.id,
    )
    if (unread.length) {
      const ids = unread.map((m: any) => m.id)
      run(
        `UPDATE messages SET read = 1 WHERE id IN (${ids.map(() => '?').join(',')})`,
        ...ids,
      )
      toUser(peerId, 'message:read', { userId: me.id, peerId, at: nowIso() })
    }

    const rows = q(
      `SELECT * FROM messages WHERE (senderId = ? AND recipientId = ?) OR (senderId = ? AND recipientId = ?)
       ORDER BY createdAt DESC LIMIT ?`,
      me.id,
      peerId,
      peerId,
      me.id,
      limit,
    ).reverse()

    res.json({
      success: true,
      data: {
        user: { id: peer.id, _id: peer.id, name: peer.name, role: peer.role },
        messages: rows.map((m) => pubMessage(m)),
      },
    })
  }),
)

/* ------------------------------ send ------------------------------ */

// POST /messages { recipientId, body }
r.post(
  '/',
  h((req, res) => {
    const me = req.user
    const { recipientId, body } = req.body || {}
    const details = []
    if (!recipientId) details.push(vd('recipientId', 'recipientId is required'))
    if (!body || !String(body).trim()) details.push(vd('body', 'body is required'))
    if (details.length) throw verr(details)
    const peer = one('SELECT * FROM users WHERE id = ?', String(recipientId))
    if (!peer) throw new ApiError(404, 'Recipient not found')
    if (!contactIds(me).has(peer.id)) throw new ApiError(403, 'Forbidden', 'FORBIDDEN')

    const row = {
      id: crypto.randomUUID(),
      senderId: me.id,
      recipientId: peer.id,
      body: String(body).trim(),
      read: 0,
      createdAt: nowIso(),
    }
    run(
      'INSERT INTO messages (id, senderId, recipientId, body, read, createdAt) VALUES (?,?,?,?,?,?)',
      row.id,
      row.senderId,
      row.recipientId,
      row.body,
      row.read,
      row.createdAt,
    )
    const payload = {
      ...pubMessage(row)!,
      sender: { id: me.id, _id: me.id, name: me.name, role: me.role },
    }
    toUser(peer.id, 'message:new', payload) // recipient
    toUser(me.id, 'message:new', payload) // sender mirror (other devices)
    res.status(201).json({ success: true, data: pubMessage(row) })
  }),
)

export default r
