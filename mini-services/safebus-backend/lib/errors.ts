import type { NextFunction, Request, Response } from 'express'
import { ApiError } from './util'

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err)
  const e = err as Record<string, any>
  if (e?.type === 'entity.parse.failed' || e instanceof SyntaxError) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON body',
      error: { message: 'Invalid JSON body', code: 'INVALID_JSON' },
    })
  }
  if (e instanceof ApiError) {
    const error: Record<string, unknown> = { message: e.message }
    if (e.code) error.code = e.code
    if (e.details) error.details = e.details
    if (e.extra) Object.assign(error, e.extra)
    return res.status(e.status).json({ success: false, message: e.message, error })
  }
  console.error('[error]', e)
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: { message: 'Internal server error', code: 'INTERNAL' },
  })
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: 'Not found',
    error: { message: 'Not found', code: 'NOT_FOUND' },
  })
}
