import express, { type Express } from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import { closeDb, initDb, purgeOldLocations, LOCATION_RETENTION_DAYS } from './lib/db'
import { errorHandler, notFoundHandler } from './lib/errors'
import { setIo, setupSocket } from './lib/sockets'
import { runSeed } from './seed'

import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import studentRoutes from './routes/students'
import tripRoutes from './routes/trips'
import { buses, routes, stops } from './routes/fleet'
import attendanceRoutes from './routes/attendance'
import messageRoutes from './routes/messages'
import notificationRoutes from './routes/notifications'
import emergencyRoutes from './routes/emergency'
import editRequestRoutes from './routes/edit-requests'
import adminRoutes from './routes/admin'
import misc, { healthHandler } from './routes/misc'

const PORT = 5000

// CORS: default permissive for the sandbox (BFF + gateway hops); production must
// pin ALLOWED_ORIGIN (comma-separated list) to the deployment origin(s).
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean)
const corsOptions = ALLOWED_ORIGINS?.length
  ? { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] }
  : {}

export function createApp(): Express {
  const app = express()
  app.use(cors(corsOptions))
  // capture raw body for multipart avatar handling; JSON bodies also keep rawBody
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf
      },
    }),
  )

  app.get('/health', healthHandler)
  app.get('/api/health', healthHandler)

  app.use('/api/auth', authRoutes)
  app.use('/api/users', userRoutes)
  app.use('/api/students', studentRoutes)
  app.use('/api/trips', tripRoutes)
  app.use('/api/buses', buses)
  app.use('/api/routes', routes)
  app.use('/api/stops', stops)
  app.use('/api/attendance', attendanceRoutes)
  app.use('/api/messages', messageRoutes)
  app.use('/api/notifications', notificationRoutes)
  app.use('/api/emergency', emergencyRoutes)
  app.use('/api/edit-requests', editRequestRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api', misc)

  // unknown /api routes → contract error envelope
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

function main() {
  initDb()
  runSeed()
  const purged = purgeOldLocations()
  if (purged > 0) console.log(`[safebus-backend] locations retention: purged ${purged} rows (>${LOCATION_RETENTION_DAYS}d)`)
  // Retention job: keep the only unbounded table bounded.
  setInterval(() => {
    try {
      purgeOldLocations()
    } catch (e) {
      console.error('[safebus-backend] retention job failed:', e)
    }
  }, 6 * 3600 * 1000).unref()

  const app = createApp()
  const httpServer = createServer(app)
  const io = new SocketServer(httpServer, {
    cors: ALLOWED_ORIGINS?.length
      ? { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] }
      : { origin: '*', methods: ['GET', 'POST'] },
  })
  setIo(io)
  setupSocket(io)

  httpServer.listen(PORT, () => {
    console.log(`[safebus-backend] listening on http://localhost:${PORT} (REST + Socket.IO)`)
  })

  // Graceful shutdown: stop accepting → close realtime → checkpoint WAL → close DB.
  let shuttingDown = false
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[safebus-backend] ${signal} received — shutting down`)
    io.close(() => {
      httpServer.close(() => {
        try {
          closeDb()
        } finally {
          process.exit(0)
        }
      })
    })
    // Hard exit if graceful close hangs (pending keep-alive sockets etc.).
    setTimeout(() => {
      console.warn('[safebus-backend] graceful close timed out — forcing exit')
      try {
        closeDb()
      } finally {
        process.exit(0)
      }
    }, 5_000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main()
