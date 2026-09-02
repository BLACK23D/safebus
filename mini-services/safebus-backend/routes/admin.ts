import { Router } from 'express'
import { count, one, q } from '../lib/db'
import { h, localDateStr, todayStr, weekdayLabel } from '../lib/util'
import { requireAuth, requireRole, type Row } from '../lib/auth'

const r = Router()
r.use(requireAuth, requireRole('admin'))

const PRESENT_SQL = "(status IN ('picked_up','dropped_off','returned_to_school'))"

function tripsOfSchool(schoolId: string | null): Row[] {
  return schoolId ? q('SELECT * FROM trips WHERE schoolId = ?', schoolId) : q('SELECT * FROM trips')
}

function attendanceOfSchool(schoolId: string | null): Row[] {
  return schoolId
    ? q('SELECT a.* FROM attendance a JOIN students s ON s.id = a.studentId WHERE s.schoolId = ?', schoolId)
    : q('SELECT * FROM attendance')
}

/* ------------------------------- stats ------------------------------- */

// GET /admin/stats (admin+)
r.get(
  '/stats',
  h((req, res) => {
    const me = req.user
    const schoolId = me.role === 'superadmin' ? null : me.schoolId

    const students = count(schoolId ? 'SELECT COUNT(*) AS c FROM students WHERE schoolId = ?' : 'SELECT COUNT(*) AS c FROM students', ...(schoolId ? [schoolId] : []))
    const drivers = count(
      schoolId
        ? "SELECT COUNT(*) AS c FROM users WHERE role = 'driver' AND schoolId = ?"
        : "SELECT COUNT(*) AS c FROM users WHERE role = 'driver'",
      ...(schoolId ? [schoolId] : []),
    )
    const buses = count(schoolId ? 'SELECT COUNT(*) AS c FROM buses WHERE schoolId = ?' : 'SELECT COUNT(*) AS c FROM buses', ...(schoolId ? [schoolId] : []))
    const routes = count(schoolId ? 'SELECT COUNT(*) AS c FROM routes WHERE schoolId = ?' : 'SELECT COUNT(*) AS c FROM routes', ...(schoolId ? [schoolId] : []))

    const trips = tripsOfSchool(schoolId)
    const activeTrips = trips.filter((t) => t.status === 'active').length

    const openEmergencies = count(
      schoolId
        ? "SELECT COUNT(*) AS c FROM emergencies WHERE status = 'active' AND schoolId = ?"
        : "SELECT COUNT(*) AS c FROM emergencies WHERE status = 'active'",
      ...(schoolId ? [schoolId] : []),
    )

    const today = todayStr()
    const attToday = attendanceOfSchool(schoolId).filter((a) => a.date === today)
    const byStatus = (s: string) => attToday.filter((a) => a.status === s).length
    const attendanceToday = {
      present:
        byStatus('picked_up') + byStatus('dropped_off') + byStatus('returned_to_school'),
      pickedUp: byStatus('picked_up'),
      droppedOff: byStatus('dropped_off'),
      absent: byStatus('absent'),
      pending: byStatus('pending'),
    }

    const tripsTodayRows = trips.filter((t) => {
      const parts = [t.scheduledStart, t.scheduledEnd, t.startedAt, t.endedAt, t.createdAt].filter(Boolean) as string[]
      return parts.some((p) => localDateStr(p) === today)
    })
    const tripsToday = {
      total: tripsTodayRows.length,
      active: tripsTodayRows.filter((t) => t.status === 'active').length,
      completed: tripsTodayRows.filter((t) => t.status === 'completed').length,
    }

    res.json({
      success: true,
      data: { students, drivers, buses, routes, activeTrips, openEmergencies, attendanceToday, tripsToday },
    })
  }),
)

/* ----------------------------- analytics ----------------------------- */

// GET /admin/analytics (admin+) — last 7 days
r.get(
  '/analytics',
  h((req, res) => {
    const me = req.user
    const schoolId = me.role === 'superadmin' ? null : me.schoolId
    const today = new Date()
    const days: { key: string; label: string }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
      days.push({ key: localDateStr(d), label: weekdayLabel(d) })
    }

    const trips = tripsOfSchool(schoolId)
    const tripDay = (t: Row) => {
      const p = [t.scheduledStart, t.scheduledEnd, t.startedAt, t.endedAt, t.createdAt].find(Boolean) as string
      return localDateStr(p)
    }
    const tripsPerDay = days.map((d) => ({
      label: d.label,
      trips: trips.filter((t) => tripDay(t) === d.key).length,
    }))

    const att = attendanceOfSchool(schoolId)
    const attendanceTrend = days.map((d) => {
      const rows = att.filter((a) => a.date === d.key)
      const present = rows.filter((a) => ['picked_up', 'dropped_off', 'returned_to_school'].includes(a.status)).length
      const rate = rows.length ? Math.round((present / rows.length) * 100) : 0
      return { label: d.label, rate }
    })

    const buses = schoolId
      ? q('SELECT status FROM buses WHERE schoolId = ?', schoolId)
      : q('SELECT status FROM buses')
    const fleetStatus = ['active', 'inactive', 'maintenance'].map((status) => ({
      status,
      count: buses.filter((b: any) => b.status === status).length,
    }))

    res.json({ success: true, data: { tripsPerDay, attendanceTrend, fleetStatus } })
  }),
)

export default r
