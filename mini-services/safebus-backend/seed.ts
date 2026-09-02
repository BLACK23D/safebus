/**
 * SafeBus reference seed — idempotent (skips when users already exist).
 * Creates the two demo schools, all demo accounts, route/bus/stops, students,
 * today's scheduled trips + 3 days of completed pickup history, messages,
 * notifications, a resolved emergency, a pending edit request and the
 * claimable driver invite (INV-DEMO-2025).
 */
import { count, run } from './lib/db'
import { hashPassword } from './lib/auth'
import { code6, localDateStr, newId, nowIso } from './lib/util'

function atTime(dayOffset: number, hours: number, minutes: number): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hours, minutes, 0, 0).toISOString()
}

export function runSeed(): { seeded: boolean } {
  const users = count('SELECT COUNT(*) AS c FROM users')
  if (users > 0) {
    console.log('[seed] users exist — skipping seed')
    return { seeded: false }
  }
  console.log('[seed] seeding demo data…')
  const t = nowIso()

  const insertSchool = (name: string, address: string) => {
    const id = newId()
    run('INSERT INTO schools (id, name, address, createdAt) VALUES (?,?,?,?)', id, name, address, t)
    return id
  }
  const insertUser = (
    name: string,
    email: string,
    password: string,
    role: string,
    schoolId: string | null,
    opts?: { phone?: string; status?: string; verified?: number; inviteToken?: string | null },
  ) => {
    const id = newId()
    run(
      `INSERT INTO users (id, name, email, phone, passwordHash, role, schoolId, avatar, verified, status, inviteToken, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      name,
      email,
      opts?.phone ?? null,
      hashPassword(password),
      role,
      schoolId,
      null,
      opts?.verified ?? 1,
      opts?.status ?? 'active',
      opts?.inviteToken ?? null,
      t,
    )
    return id
  }
  const insertStop = (name: string, sequence: number, lat: number, lng: number, schoolId: string) => {
    const id = newId()
    run(
      'INSERT INTO stops (id, name, sequence, lat, lng, status, schoolId, createdAt) VALUES (?,?,?,?,?,?,?,?)',
      id,
      name,
      sequence,
      lat,
      lng,
      'active',
      schoolId,
      t,
    )
    return id
  }
  const insertRoute = (name: string, schoolId: string, stopIds: string[]) => {
    const id = newId()
    run('INSERT INTO routes (id, name, schoolId, stopIds, status, createdAt) VALUES (?,?,?,?,?,?)', id, name, schoolId, JSON.stringify(stopIds), 'active', t)
    stopIds.forEach((sid, i) => run('UPDATE stops SET sequence = ? WHERE id = ?', i + 1, sid))
    return id
  }
  const insertBus = (
    number: string,
    plate: string,
    driverId: string | null,
    routeId: string | null,
    capacity: number,
    schoolId: string,
  ) => {
    const id = newId()
    run(
      'INSERT INTO buses (id, number, plate, driverId, routeId, capacity, status, schoolId, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
      id,
      number,
      plate,
      driverId,
      routeId,
      capacity,
      'active',
      schoolId,
      t,
    )
    return id
  }
  const insertStudent = (
    name: string,
    grade: string,
    studentCode: string,
    parentId: string,
    busId: string,
    routeId: string,
    stopId: string,
    schoolId: string,
  ) => {
    const id = newId()
    run(
      `INSERT INTO students (id, name, grade, studentCode, parentId, busId, routeId, stopId, status, schoolId, pickupCode, dropoffCode, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      name,
      grade,
      studentCode,
      parentId,
      busId,
      routeId,
      stopId,
      'active',
      schoolId,
      code6(),
      code6(),
      t,
    )
    return id
  }
  const insertTrip = (
    type: string,
    status: string,
    routeId: string,
    busId: string,
    driverId: string | null,
    schoolId: string,
    scheduledStart: string | null,
    scheduledEnd: string | null,
    extra?: { startedAt?: string | null; endedAt?: string | null },
  ) => {
    const id = newId()
    run(
      `INSERT INTO trips (id, type, status, routeId, busId, driverId, schoolId, scheduledStart, scheduledEnd, startedAt, endedAt, etaFlags, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      type,
      status,
      routeId,
      busId,
      driverId,
      schoolId,
      scheduledStart,
      scheduledEnd,
      extra?.startedAt ?? null,
      extra?.endedAt ?? null,
      '{}',
      t,
    )
    return id
  }
  const insertAttendance = (
    tripId: string,
    studentId: string,
    stopId: string | null,
    date: string,
    type: string,
    status: string,
    verified: number,
    verifiedAt: string | null,
  ) => {
    run(
      `INSERT INTO attendance (id, tripId, studentId, stopId, date, type, status, verified, verifiedAt, failedAttempts, lockedUntil, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      newId(),
      tripId,
      studentId,
      stopId,
      date,
      type,
      status,
      verified,
      verifiedAt,
      0,
      null,
      t,
      t,
    )
  }
  const insertMessage = (senderId: string, recipientId: string, body: string, read: number, createdAt: string) => {
    run('INSERT INTO messages (id, senderId, recipientId, body, read, createdAt) VALUES (?,?,?,?,?,?)', newId(), senderId, recipientId, body, read, createdAt)
  }
  const insertNotification = (userId: string, title: string, body: string, type: string, read: number, createdAt: string) => {
    run(
      'INSERT INTO notifications (id, userId, title, body, type, read, meta, createdAt) VALUES (?,?,?,?,?,?,?,?)',
      newId(),
      userId,
      title,
      body,
      type,
      read,
      null,
      createdAt,
    )
  }

  /* ------------------------------ schools ------------------------------ */
  const horizonId = insertSchool('Horizon Elementary School', '2100 Horizon Dr, Austin, TX 78704')
  const riversideId = insertSchool('Riverside High School', '700 Riverside Dr, Austin, TX 78741')

  /* --------------------------- Horizon users --------------------------- */
  const adminId = insertUser('Alan Reyes', 'admin.demo@safebus.app', 'Admin123!', 'admin', horizonId, { phone: '+1-512-555-0110' })
  const superId = insertUser('Sam Ortega', 'super.demo@safebus.app', 'Super123!', 'superadmin', horizonId, { phone: '+1-512-555-0111' })
  const mariaId = insertUser('Maria Lopez', 'maria.demo@safebus.app', 'Parent123!', 'parent', horizonId, { phone: '+1-512-555-0112' })
  const davidId = insertUser('David Kim', 'david.demo@safebus.app', 'Driver123!', 'driver', horizonId, { phone: '+1-512-555-0113' })
  const sofiaId = insertUser('Sofia Martinez', 'sofia.demo@safebus.app', 'Parent123!', 'parent', horizonId, { phone: '+1-512-555-0114' })
  // claimable driver invite
  insertUser('Invited Driver', 'invited.demo@safebus.app', 'Placeholder123!', 'driver', horizonId, {
    phone: '+1-512-555-0115',
    status: 'invited',
    verified: 0,
    inviteToken: 'INV-DEMO-2025',
  })

  /* -------------------------- Horizon fleet ---------------------------- */
  const s1 = insertStop('Maple & 5th', 1, 30.2701, -97.7395, horizonId)
  const s2 = insertStop('Sunset Park', 2, 30.2812, -97.7361, horizonId)
  const s3 = insertStop('Oakwood Lane', 3, 30.2921, -97.733, horizonId)
  const s4 = insertStop('Horizon Elementary', 4, 30.303, -97.7301, horizonId)
  const routeAId = insertRoute('Horizon Route A', horizonId, [s1, s2, s3, s4])
  const bus101Id = insertBus('B-101', 'TX-4471', davidId, routeAId, 24, horizonId)

  /* -------------------------- Horizon students ------------------------- */
  const avaId = insertStudent('Ava Johnson', '3', 'HOR-1001', mariaId, bus101Id, routeAId, s2, horizonId)
  const liamId = insertStudent('Liam Johnson', '5', 'HOR-1002', mariaId, bus101Id, routeAId, s3, horizonId)
  const noahId = insertStudent('Noah Garcia', '2', 'HOR-1003', sofiaId, bus101Id, routeAId, s4, horizonId)

  /* ----------------------------- trips -------------------------------- */
  // today: scheduled pickup 07:15 + dropoff 15:30
  insertTrip('pickup', 'scheduled', routeAId, bus101Id, davidId, horizonId, atTime(0, 7, 15), atTime(0, 8, 0))
  insertTrip('dropoff', 'scheduled', routeAId, bus101Id, davidId, horizonId, atTime(0, 15, 30), atTime(0, 16, 15))

  // history: 3 completed pickup trips on the 3 previous days, verified attendance
  for (let i = 1; i <= 3; i++) {
    const start = atTime(-i, 7, 17)
    const end = atTime(-i, 8, 2)
    const tripId = insertTrip('pickup', 'completed', routeAId, bus101Id, davidId, horizonId, atTime(-i, 7, 15), atTime(-i, 8, 0), {
      startedAt: start,
      endedAt: end,
    })
    const date = localDateStr(atTime(-i, 7, 15))
    insertAttendance(tripId, avaId, s2, date, 'pickup', 'picked_up', 1, atTime(-i, 7, 24))
    insertAttendance(tripId, liamId, s3, date, 'pickup', 'picked_up', 1, atTime(-i, 7, 33))
    insertAttendance(tripId, noahId, s4, date, 'pickup', 'picked_up', 1, atTime(-i, 7, 41))
  }

  /* ---------------------- messages / notifications --------------------- */
  insertMessage(davidId, mariaId, 'Good morning! B-101 will reach Sunset Park around 7:25 today.', 1, atTime(-2, 7, 5))
  insertMessage(mariaId, davidId, 'Thanks David! Ava boards at Sunset Park and Liam at Oakwood Lane.', 1, atTime(-2, 7, 8))
  insertMessage(davidId, mariaId, 'All pickup verifications went smoothly today. See you tomorrow!', 0, atTime(-1, 8, 1))
  insertMessage(adminId, mariaId, 'Welcome to Horizon Elementary transportation — message us anytime.', 1, atTime(-2, 9, 15))

  insertNotification(mariaId, 'Welcome to SafeBus', 'Your Horizon Elementary parent account is ready.', 'system', 0, atTime(-2, 9, 0))
  insertNotification(mariaId, 'Route assignment confirmed', 'Ava and Liam ride Horizon Route A with driver David Kim (bus B-101).', 'trip', 0, atTime(0, 6, 45))

  /* ------------------- emergency + edit request seeds ------------------- */
  run(
    `INSERT INTO emergencies (id, type, status, note, studentId, schoolId, createdById, createdAt, resolvedAt, resolvedBy)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    newId(),
    'medical',
    'resolved',
    'Ava scraped her knee boarding at Sunset Park — cleaned and bandaged, she is fine.',
    avaId,
    horizonId,
    mariaId,
    atTime(-1, 7, 40),
    atTime(-1, 8, 10),
    adminId,
  )
  run(
    `INSERT INTO edit_requests (id, studentId, field, oldValue, newValue, status, requestedById, schoolId, createdAt)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    newId(),
    avaId,
    'grade',
    '3',
    '4',
    'pending',
    mariaId,
    horizonId,
    atTime(-1, 10, 0),
  )

  // school emergency contacts
  const contacts: Array<[string, string, string, string]> = [
    [horizonId, 'Front Office', 'staff', '+1-512-555-0100'],
    [horizonId, 'School Nurse', 'nurse', '+1-512-555-0101'],
    [horizonId, 'Transportation Desk', 'transportation', '+1-512-555-0102'],
    [riversideId, 'Front Office', 'staff', '+1-512-555-0200'],
  ]
  for (const [schoolId, name, role, phone] of contacts) {
    run('INSERT INTO emergency_contacts (id, schoolId, name, role, phone) VALUES (?,?,?,?,?)', newId(), schoolId, name, role, phone)
  }

  /* ----------------------------- Riverside ----------------------------- */
  const admin2Id = insertUser('Rachel Woods', 'admin2.demo@safebus.app', 'Admin123!', 'admin', riversideId, { phone: '+1-512-555-0210' })
  insertUser('Robert Fields', 'riverside.demo@safebus.app', 'Parent123!', 'parent', riversideId, { phone: '+1-512-555-0211' })
  const rs1 = insertStop('Riverside Gate', 1, 30.2265, -97.753, riversideId)
  const rs2 = insertStop('Lakeshore Court', 2, 30.2351, -97.7501, riversideId)
  const routeRId = insertRoute('Riverside Route 1', riversideId, [rs1, rs2])
  const busRId = insertBus('R-201', 'TX-9938', null, routeRId, 30, riversideId)
  insertTrip('pickup', 'scheduled', routeRId, busRId, null, riversideId, atTime(1, 7, 30), atTime(1, 8, 10))

  console.log('[seed] done — Horizon (5 users + invite), Riverside (2 users), trips, history seeded')
  return { seeded: true }
}

if (import.meta.main) {
  const { initDb } = await import('./lib/db')
  initDb()
  runSeed()
}
