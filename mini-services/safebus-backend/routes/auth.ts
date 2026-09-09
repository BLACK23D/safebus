import { Router } from 'express'
import { one, run } from '../lib/db'
import { ApiError, checkPassword, newId, nowIso, vd, verr, h } from '../lib/util'
import {
  authTokens,
  clientIp,
  comparePassword,
  dummyPasswordHash,
  hashPassword,
  rateLimit,
  requireAuth,
  type Row,
} from '../lib/auth'
import { pubUser } from '../lib/serialize'

const r = Router()
const authLimiter = rateLimit({ windowMs: 60_000, max: 10, bucket: 'auth' })
// Login is keyed per account+IP: one victim's bucket can no longer be filled by
// an attacker spraying from a different IP (global-bucket login DoS fixed).
const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  bucket: 'login',
  key: (req) => `${clientIp(req)}:${String(req.body?.email ?? '').trim().toLowerCase()}`,
})
const refreshLimiter = rateLimit({ windowMs: 60_000, max: 60, bucket: 'refresh' })
const inviteLimiter = rateLimit({ windowMs: 60_000, max: 10, bucket: 'invite' })
const verifyLimiter = rateLimit({ windowMs: 60_000, max: 10, bucket: 'verify' })
const isProd = process.env.NODE_ENV === 'production'

function findUserByEmail(email: unknown): Row | undefined {
  return one('SELECT * FROM users WHERE email = ?', String(email ?? '').trim().toLowerCase())
}

function assertLoginAllowed(user: Row) {
  if (user.status === 'inactive' || user.status === 'suspended') {
    throw new ApiError(403, 'Account is disabled', 'ACCOUNT_DISABLED')
  }
  if (user.status === 'invited') {
    throw new ApiError(403, 'Account pending activation — claim your invite first', 'ACCOUNT_DISABLED')
  }
}

// POST /auth/login
r.post(
  '/login',
  loginLimiter,
  h((req, res) => {
    const b = req.body || {}
    if (b.role) console.log(`[auth] login role hint: ${b.role} (informational only)`)
    const details = []
    if (!b.email) details.push(vd('email', 'Email is required'))
    if (!b.password) details.push(vd('password', 'Password is required'))
    if (details.length) throw verr(details)
    const user = findUserByEmail(b.email)
    // Timing equalization: unknown emails still pay one bcrypt compare so login
    // latency cannot be used to enumerate registered accounts.
    if (!user || !comparePassword(String(b.password), user.passwordHash || dummyPasswordHash())) {
      if (!user) dummyPasswordHash()
      throw new ApiError(401, 'Invalid credentials')
    }
    assertLoginAllowed(user)
    res.json({ success: true, data: { ...authTokens(user), user: pubUser(user) } })
  }),
)

// POST /auth/register — always creates role=parent
r.post(
  '/register',
  authLimiter,
  h((req, res) => {
    const b = req.body || {}
    const details = []
    if (!b.name || !String(b.name).trim()) details.push(vd('name', 'Name is required'))
    if (!b.email || !/^\S+@\S+\.\S+$/.test(String(b.email))) details.push(vd('email', 'A valid email is required'))
    if (details.length) throw verr(details)
    checkPassword(b.password)
    if (findUserByEmail(b.email)) {
      throw verr([vd('email', 'Email already registered')], 'Email already registered')
    }
    const id = newId()
    run(
      `INSERT INTO users (id, name, email, phone, passwordHash, role, schoolId, avatar, verified, status, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      String(b.name).trim(),
      String(b.email).trim().toLowerCase(),
      b.phone ? String(b.phone) : null,
      hashPassword(String(b.password)),
      'parent', // register only creates parents
      null,
      null,
      1, // auto-verified in sandbox
      'active',
      nowIso(),
    )
    const user = one('SELECT * FROM users WHERE id = ?', id)!
    res.status(201).json({ success: true, data: { user: pubUser(user) } })
  }),
)

// POST /auth/refresh — rotation with reuse detection.
// Benign concurrent refreshes (BFF single-flight loser, middleware race) present a
// just-rotated token within a short grace window → plain 401, family untouched.
// A later replay of a consumed/revoked token is treated as theft: the whole family
// is revoked (OWASP refresh-token rotation guidance).
const REUSE_GRACE_MS = 90_000
r.post(
  '/refresh',
  refreshLimiter,
  h((req, res) => {
    const { refreshToken } = req.body || {}
    if (!refreshToken) throw new ApiError(401, 'Refresh token required', 'UNAUTHORIZED')
    const row = one('SELECT * FROM refresh_tokens WHERE token = ?', String(refreshToken))
    if (!row) throw new ApiError(401, 'Invalid refresh token', 'UNAUTHORIZED')
    if (row.revoked) {
      run('UPDATE refresh_tokens SET revoked = 1 WHERE userId = ? AND revoked = 0', row.userId)
      console.warn(`[auth] revoked-token replay for user ${row.userId} — family revoked`)
      throw new ApiError(401, 'Invalid refresh token', 'UNAUTHORIZED')
    }
    if (row.used) {
      const usedAt = row.usedAt ? new Date(row.usedAt).getTime() : 0
      if (usedAt && Date.now() - usedAt < REUSE_GRACE_MS) {
        // Benign race: the session continues via whichever caller won the rotation.
        throw new ApiError(401, 'Invalid refresh token', 'UNAUTHORIZED')
      }
      run('UPDATE refresh_tokens SET revoked = 1 WHERE userId = ? AND revoked = 0', row.userId)
      console.warn(`[auth] refresh reuse detected for user ${row.userId} — family revoked`)
      throw new ApiError(401, 'Invalid refresh token', 'UNAUTHORIZED')
    }
    if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
      throw new ApiError(401, 'Refresh token expired', 'UNAUTHORIZED')
    }
    const user = one('SELECT * FROM users WHERE id = ?', row.userId)
    if (!user) throw new ApiError(401, 'Invalid refresh token', 'UNAUTHORIZED')
    assertLoginAllowed(user)
    run('UPDATE refresh_tokens SET used = 1, usedAt = ? WHERE id = ?', nowIso(), row.id) // rotate
    res.json({ success: true, data: authTokens(user) })
  }),
)

// POST /auth/logout
r.post(
  '/logout',
  h((req, res) => {
    const { refreshToken } = req.body || {}
    if (refreshToken) {
      run('UPDATE refresh_tokens SET revoked = 1 WHERE token = ?', String(refreshToken))
    }
    res.json({ success: true, data: { ok: true } })
  }),
)

// GET /auth/me
r.get(
  '/me',
  requireAuth,
  h((req, res) => {
    res.json({ success: true, data: pubUser(req.user) })
  }),
)

// POST /auth/forgot-password — always ok
r.post(
  '/forgot-password',
  authLimiter,
  h((req, res) => {
    const { email } = req.body || {}
    const user = email ? findUserByEmail(email) : undefined
    if (user) {
      const token = newId() + newId()
      run(
        'UPDATE users SET resetToken = ?, resetTokenExpiresAt = ? WHERE id = ?',
        token,
        new Date(Date.now() + 3600_000).toISOString(),
        user.id,
      )
      if (!isProd) console.log(`[auth] reset token issued for ${user.email}: ${token}`)
    }
    res.json({ success: true, data: { ok: true } })
  }),
)

// POST /auth/reset-password/:token
r.post(
  '/reset-password/:token',
  authLimiter,
  h((req, res) => {
    checkPassword(req.body?.password)
    const user = one('SELECT * FROM users WHERE resetToken = ?', req.params.token)
    if (!user || !user.resetTokenExpiresAt || new Date(user.resetTokenExpiresAt).getTime() < Date.now()) {
      throw new ApiError(400, 'Invalid or expired reset token')
    }
    run(
      'UPDATE users SET passwordHash = ?, resetToken = NULL, resetTokenExpiresAt = NULL WHERE id = ?',
      hashPassword(String(req.body.password)),
      user.id,
    )
    // A password reset invalidates every live session for the account.
    run('UPDATE refresh_tokens SET revoked = 1 WHERE userId = ? AND revoked = 0', user.id)
    res.json({ success: true, data: { ok: true } })
  }),
)

// POST /auth/verify-email
r.post(
  '/verify-email',
  verifyLimiter,
  h((req, res) => {
    const { token } = req.body || {}
    const user = token ? one('SELECT * FROM users WHERE verificationToken = ?', String(token)) : undefined
    if (!user) throw new ApiError(400, 'Invalid verification token')
    run('UPDATE users SET verified = 1, verificationToken = NULL WHERE id = ?', user.id)
    res.json({ success: true, data: { ok: true } })
  }),
)

// POST /auth/resend-verification
r.post(
  '/resend-verification',
  requireAuth,
  verifyLimiter,
  h((req, res) => {
    const token = newId() + newId()
    run('UPDATE users SET verificationToken = ? WHERE id = ?', token, req.user.id)
    if (!isProd) console.log(`[auth] verification token issued for ${req.user.email}: ${token}`)
    res.json({ success: true, data: { ok: true } })
  }),
)

// POST /auth/claim-invite
r.post(
  '/claim-invite',
  inviteLimiter,
  h((req, res) => {
    const b = req.body || {}
    if (!b.token) throw verr([vd('token', 'Invite token is required')])
    const user = one('SELECT * FROM users WHERE inviteToken = ? AND status = ?', String(b.token).trim(), 'invited')
    if (!user) throw new ApiError(400, 'Invalid or already-used invite token')
    if (!b.name || !String(b.name).trim()) throw verr([vd('name', 'Name is required')])
    checkPassword(b.password)
    run(
      'UPDATE users SET name = ?, phone = ?, passwordHash = ?, status = ?, verified = 1, inviteToken = NULL WHERE id = ?',
      String(b.name).trim(),
      b.phone ? String(b.phone) : user.phone,
      hashPassword(String(b.password)),
      'active',
      user.id,
    )
    const fresh = one('SELECT * FROM users WHERE id = ?', user.id)!
    res.json({ success: true, data: { ...authTokens(fresh), user: pubUser(fresh) } })
  }),
)

export default r
