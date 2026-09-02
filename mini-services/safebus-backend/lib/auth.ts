import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import { one, run } from './db'
import { ApiError, newId, nowIso, token48 } from './util'

export const JWT_SECRET = 'safebus-dev-secret-9f2c1b7a5e84d0c3a6b1f8e2d4c7a9b0'
export const ACCESS_TTL = '15m'
export const REFRESH_DAYS = 7

export type Row = Record<string, any>

export const hashPassword = (pw: string): string => bcrypt.hashSync(pw, 10)
export const comparePassword = (pw: string, hash: string): boolean => bcrypt.compareSync(pw, hash)

export function signAccess(user: Row): string {
  return jwt.sign(
    { sub: user.id, role: user.role, schoolId: user.schoolId ?? null },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL } as jwt.SignOptions,
  )
}

export function issueRefresh(userId: string): string {
  const token = token48()
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 3600 * 1000).toISOString()
  run(
    'INSERT INTO refresh_tokens (id, userId, token, used, revoked, expiresAt, createdAt) VALUES (?,?,?,?,?,?,?)',
    newId(),
    userId,
    token,
    0,
    0,
    expiresAt,
    nowIso(),
  )
  return token
}

export function authTokens(user: Row): { accessToken: string; refreshToken: string } {
  return { accessToken: signAccess(user), refreshToken: issueRefresh(user.id) }
}

export function isDisabledStatus(status: string): boolean {
  return status === 'inactive' || status === 'suspended' || status === 'invited'
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = String(req.headers.authorization || '')
    if (!header.startsWith('Bearer ')) {
      throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED')
    }
    let payload: any
    try {
      payload = jwt.verify(header.slice(7), JWT_SECRET)
    } catch {
      throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED')
    }
    const user = one('SELECT * FROM users WHERE id = ?', payload?.sub)
    if (!user) throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED')
    if (user.status === 'inactive' || user.status === 'suspended') {
      throw new ApiError(403, 'Account is disabled', 'ACCOUNT_DISABLED')
    }
    if (user.status === 'invited') {
      throw new ApiError(403, 'Account pending activation', 'ACCOUNT_DISABLED')
    }
    ;(req as any).user = user
    next()
  } catch (e) {
    next(e)
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as Row | undefined
    if (!user) return next(new ApiError(401, 'Unauthorized', 'UNAUTHORIZED'))
    if (user.role === 'superadmin' || roles.includes(user.role)) return next()
    return next(new ApiError(403, 'Forbidden', 'FORBIDDEN'))
  }
}

/** Simple in-memory fixed-window rate limiter. */
export function rateLimit(opts: { windowMs: number; max: number; bucket: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>()
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req as any).ip || req.socket?.remoteAddress || 'unknown'
    const key = `${opts.bucket}:${ip}`
    const now = Date.now()
    let rec = hits.get(key)
    if (!rec || rec.resetAt <= now) {
      rec = { count: 0, resetAt: now + opts.windowMs }
      hits.set(key, rec)
    }
    rec.count++
    if (rec.count > opts.max) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests, please try again later',
        error: { message: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
      })
    }
    next()
  }
}

/** Buffers the raw request body (for multipart parsing via Response.formData).
 * No-op when the body was already captured (e.g. by the express.json `verify` hook)
 * or the stream already ended — prevents hangs on application/json requests. */
export function rawBody(req: Request, res: Response, next: NextFunction) {
  if ((req as any).rawBody || req.readableEnded) return next()
  const chunks: Buffer[] = []
  req.on('data', (c) => chunks.push(c as Buffer))
  req.on('end', () => {
    ;(req as any).rawBody = Buffer.concat(chunks)
    next()
  })
  req.on('error', next)
}
