import type { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { one, q, run } from './db'
import { JWT_SECRET } from './auth'
import { pubNotification } from './serialize'
import { newId, nowIso } from './util'

let io: Server | null = null

export const setIo = (s: Server) => {
  io = s
}
export const getIo = (): Server | null => io

export const toUser = (userId: string | null | undefined, event: string, payload: unknown) => {
  if (io && userId) io.to(`user:${userId}`).emit(event, payload)
}
export const toSchool = (schoolId: string | null | undefined, event: string, payload: unknown) => {
  if (io && schoolId) io.to(`school:${schoolId}`).emit(event, payload)
}
export const toTripRoom = (tripId: string, event: string, payload: unknown) => {
  if (io) io.to(`trip:${tripId}`).emit(event, payload)
}

/** Task-required aliases for the emitter helpers. */
export const emitToUser = toUser
export const emitToSchool = toSchool
export const emitToTrip = toTripRoom

export type NotifInput = {
  userId: string
  title: string
  body?: string
  type?: string
  meta?: Record<string, unknown>
}

/** Creates a notification row and emits notification:new to the user's room. */
export function notify(input: NotifInput) {
  const row = {
    id: newId(),
    userId: input.userId,
    title: input.title,
    body: input.body ?? null,
    type: input.type ?? 'system',
    read: 0,
    meta: input.meta ? JSON.stringify(input.meta) : null,
    createdAt: nowIso(),
  }
  run(
    'INSERT INTO notifications (id, userId, title, body, type, read, meta, createdAt) VALUES (?,?,?,?,?,?,?,?)',
    row.id,
    row.userId,
    row.title,
    row.body,
    row.type,
    row.read,
    row.meta,
    row.createdAt,
  )
  toUser(input.userId, 'notification:new', pubNotification(row))
  return row
}

export function notifyMany(
  userIds: Array<string | null | undefined>,
  n: Omit<NotifInput, 'userId'>,
): number {
  const uniq = [...new Set(userIds.filter(Boolean) as string[])]
  for (const uid of uniq) notify({ ...n, userId: uid })
  return uniq.length
}

export function setupSocket(ioServer: Server) {
  ioServer.use((socket: Socket, next: (err?: Error) => void) => {
    try {
      const token =
        (socket.handshake.auth?.token as string) ||
        String(socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '')
      if (!token) return next(new Error('Unauthorized'))
      const payload = jwt.verify(token, JWT_SECRET) as any
      const user = one('SELECT * FROM users WHERE id = ?', payload?.sub)
      if (!user || user.status !== 'active') return next(new Error('Unauthorized'))
      socket.data.userId = user.id
      socket.data.role = user.role
      socket.data.schoolId = user.schoolId ?? null
      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  })

  ioServer.on('connection', (socket: Socket) => {
    const { userId, role, schoolId } = socket.data as { userId: string; role: string; schoolId: string | null }
    socket.join(`user:${userId}`)
    // School room is STAFF-ONLY (admin/superadmin/driver). Parents are excluded so
    // school-wide broadcasts (bus positions, attendance events) can never leak
    // other families' children to a parent socket — parents receive everything
    // they are entitled to via `trip:<id>` rooms (server-validated trip:join) and
    // their own `user:<id>` room.
    if (schoolId && (role === 'admin' || role === 'superadmin' || role === 'driver')) {
      socket.join(`school:${schoolId}`)
    }

    socket.on('trip:join', (arg: { tripId?: string } | undefined) => {
      try {
        const tripId = arg?.tripId
        if (!tripId) return
        const trip = one('SELECT * FROM trips WHERE id = ?', tripId)
        if (!trip) return
        let allowed = false
        if (role === 'superadmin') {
          allowed = true
        } else if (role === 'admin') {
          allowed = trip.schoolId === schoolId
        } else if (role === 'driver') {
          allowed = trip.driverId === userId
        } else if (role === 'parent') {
          const kids = q('SELECT id, routeId FROM students WHERE parentId = ?', userId)
          allowed =
            kids.some((k: any) => k.routeId === trip.routeId) ||
            (kids.length
              ? !!one(
                  `SELECT 1 FROM attendance a WHERE a.tripId = ? AND a.studentId IN (${kids
                    .map(() => '?')
                    .join(',')}) LIMIT 1`,
                  tripId,
                  ...kids.map((k: any) => k.id),
                )
              : false)
        }
        if (allowed) socket.join(`trip:${tripId}`)
      } catch (e) {
        console.error('[socket] trip:join error', e)
      }
    })
  })
}
