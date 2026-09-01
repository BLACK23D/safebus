import express, { type Express } from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import { initDb } from './lib/db'
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

export function createApp(): Express {
  const app = express()
  app.use(cors())
  // capture raw body for multipart avatar handling; JSON bodies also keep rawBody
  app.use(
    express.json({
      limit: '15mb',
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

  const app = createApp()
  const httpServer = createServer(app)
  const io = new SocketServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  })
  setIo(io)
  setupSocket(io)

  httpServer.listen(PORT, () => {
    console.log(`[safebus-backend] listening on http://localhost:${PORT} (REST + Socket.IO)`)
  })
}

main()
