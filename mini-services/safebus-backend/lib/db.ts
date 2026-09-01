import { Database } from 'bun:sqlite'
import { join } from 'path'

export let db: Database

const DB_PATH = join(import.meta.dir, '..', 'data.db')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL,
  schoolId TEXT,
  avatar TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  inviteToken TEXT,
  verificationToken TEXT,
  resetToken TEXT,
  resetTokenExpiresAt TEXT,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  used INTEGER NOT NULL DEFAULT 0,
  revoked INTEGER NOT NULL DEFAULT 0,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  grade TEXT,
  studentCode TEXT,
  parentId TEXT,
  busId TEXT,
  routeId TEXT,
  stopId TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  schoolId TEXT NOT NULL,
  pickupCode TEXT NOT NULL,
  dropoffCode TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS buses (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  plate TEXT NOT NULL,
  driverId TEXT,
  routeId TEXT,
  capacity INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  schoolId TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 1,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  schoolId TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  schoolId TEXT NOT NULL,
  stopIds TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  routeId TEXT NOT NULL,
  busId TEXT NOT NULL,
  driverId TEXT,
  schoolId TEXT NOT NULL,
  scheduledStart TEXT,
  scheduledEnd TEXT,
  startedAt TEXT,
  endedAt TEXT,
  currentLocation TEXT,
  etaFlags TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stop_progress (
  id TEXT PRIMARY KEY,
  tripId TEXT NOT NULL,
  stopId TEXT NOT NULL,
  arrivedAt TEXT NOT NULL,
  ping TEXT,
  UNIQUE(tripId, stopId)
);
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  tripId TEXT NOT NULL,
  busId TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  speed REAL,
  heading REAL,
  at TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  tripId TEXT NOT NULL,
  studentId TEXT NOT NULL,
  stopId TEXT,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  verified INTEGER NOT NULL DEFAULT 0,
  verifiedAt TEXT,
  failedAttempts INTEGER NOT NULL DEFAULT 0,
  lockedUntil TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  senderId TEXT NOT NULL,
  recipientId TEXT NOT NULL,
  body TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT NOT NULL DEFAULT 'system',
  read INTEGER NOT NULL DEFAULT 0,
  meta TEXT,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS device_tokens (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'web',
  userId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  UNIQUE(token, userId)
);
CREATE TABLE IF NOT EXISTS emergencies (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT,
  studentId TEXT,
  schoolId TEXT,
  createdById TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  resolvedAt TEXT,
  resolvedBy TEXT
);
CREATE TABLE IF NOT EXISTS edit_requests (
  id TEXT PRIMARY KEY,
  studentId TEXT NOT NULL,
  field TEXT NOT NULL,
  oldValue TEXT,
  newValue TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requestedById TEXT NOT NULL,
  schoolId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  decidedAt TEXT,
  decidedBy TEXT
);
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id TEXT PRIMARY KEY,
  schoolId TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT NOT NULL
);
`

export function initDb(): Database {
  if (db) return db
  db = new Database(DB_PATH)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec(SCHEMA)
  return db
}

export function q<T = Record<string, any>>(sql: string, ...params: unknown[]): T[] {
  return db.query(sql).all(...(params as any[])) as T[]
}

export function one<T = Record<string, any>>(sql: string, ...params: unknown[]): T | undefined {
  return db.query(sql).get(...(params as any[])) as T | undefined
}

export function run(sql: string, ...params: unknown[]): void {
  db.query(sql).run(...(params as any[]))
}

export function count(sql: string, ...params: unknown[]): number {
  const row = one<{ c: number | bigint }>(sql, ...params)
  return Number(row?.c ?? 0)
}
