import { randomUUID, randomBytes, randomInt } from 'crypto'

export type VDetail = { path: string[]; message: string }

export class ApiError extends Error {
  status: number
  code?: string
  details?: VDetail[]
  extra?: Record<string, unknown>
  constructor(
    status: number,
    message: string,
    code?: string,
    details?: VDetail[],
    extra?: Record<string, unknown>,
  ) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
    this.extra = extra
  }
}

export const verr = (details: VDetail[], message = 'Validation failed') =>
  new ApiError(400, message, 'VALIDATION_ERROR', details)
export const vd = (path: string, message: string): VDetail => ({ path: [path], message })

export const newId = (): string => randomUUID()
export const nowIso = (): string => new Date().toISOString()

/** Local (server timezone) yyyy-mm-dd of a Date/ISO string. */
export function localDateStr(input?: Date | string | null): string {
  if (input === null || input === undefined || input === '') return ''
  const d = typeof input === 'string' ? new Date(input) : input
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export const todayStr = (): string => localDateStr(new Date())

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const weekdayLabel = (d: Date): string => WEEKDAYS[d.getDay()]

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLng = (lng2 - lng1) * toRad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export const code6 = (): string => String(randomInt(0, 1000000)).padStart(6, '0')
export const token48 = (): string => randomBytes(48).toString('hex')
export const newInviteToken = (): string => 'INV-' + randomBytes(6).toString('hex').toUpperCase()

export function validatePasswordRules(pw: unknown): string[] {
  const issues: string[] = []
  if (typeof pw !== 'string' || pw.length < 8) issues.push('Password must be at least 8 characters')
  if (typeof pw === 'string' && pw.length > 128) issues.push('Password must be at most 128 characters')
  if (typeof pw !== 'string' || !/[A-Z]/.test(pw)) issues.push('Password must contain an uppercase letter')
  if (typeof pw !== 'string' || !/[a-z]/.test(pw)) issues.push('Password must contain a lowercase letter')
  if (typeof pw !== 'string' || !/[0-9]/.test(pw)) issues.push('Password must contain a number')
  if (typeof pw !== 'string' || !/[^A-Za-z0-9]/.test(pw)) issues.push('Password must contain a symbol')
  return issues
}

export function checkPassword(pw: unknown): void {
  const issues = validatePasswordRules(pw)
  if (issues.length) throw verr(issues.map((i) => vd('password', i)))
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (s === null || s === undefined || s === '') return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

/** Wraps an (async) express handler so rejections/errors reach next(). */
export const h =
  (fn: (req: any, res: any, next: any) => unknown) =>
  (req: any, res: any, next: any) => {
    try {
      const out = fn(req, res, next)
      if (out && typeof (out as Promise<unknown>).catch === 'function') {
        ;(out as Promise<unknown>).catch(next)
      }
    } catch (e) {
      next(e)
    }
  }
