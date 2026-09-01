/**
 * Socket.IO probe — connects as maria (parent) + david (driver), exercises the
 * trip lifecycle over HTTP and asserts the contract §13 event set arrives.
 * Run: bun scripts/socket-probe.ts   (service must be running on :5000)
 */
import { io, type Socket } from 'socket.io-client'

const BASE = 'http://localhost:5000'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const received = new Map<string, string[]>() // socketLabel -> [eventNames]
const push = (label: string, ev: string) => {
  const arr = received.get(label) ?? []
  arr.push(ev)
  received.set(label, arr)
}

async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const j: any = await res.json()
  if (!res.ok || !j?.data?.accessToken) throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(j)}`)
  return j.data as { accessToken: string; user: any }
}

function connect(label: string, token: string, events: string[]): Socket {
  const s = io(BASE, { auth: { token }, transports: ['websocket'] })
  s.on('connect', () => console.log(`[probe] ${label} connected (${s.id})`))
  s.on('connect_error', (err) => console.log(`[probe] ${label} connect_error: ${err.message}`))
  for (const ev of events) {
    s.on(ev, (payload: any) => {
      push(label, ev)
      console.log(`[probe] ${label} ← ${ev}: ${JSON.stringify(payload).slice(0, 180)}`)
    })
  }
  return s
}

async function main() {
  const maria = await login('maria.demo@safebus.app', 'Parent123!')
  const david = await login('david.demo@safebus.app', 'Driver123!')
  const admin = await login('admin.demo@safebus.app', 'Admin123!')

  const all = [
    'trip:status',
    'trip:location',
    'trip:eta',
    'trip:arrived',
    'attendance:update',
    'student:status',
    'message:new',
    'message:read',
    'emergency:new',
    'emergency:update',
    'notification:new',
  ]
  const mSock = connect('maria', maria.accessToken, all)
  const dSock = connect('david', david.accessToken, all)
  await sleep(400)

  // today's pickup trip
  const tripsRes = await fetch(`${BASE}/api/trips?driver=me&date=today`, {
    headers: { authorization: `Bearer ${david.accessToken}` },
  })
  const trips = (await tripsRes.json()).data.items as any[]
  const trip = trips.find((t) => t.type === 'pickup')
  if (!trip) throw new Error('no scheduled pickup trip for today')
  console.log(`[probe] using trip ${trip.id} (${trip.type}, ${trip.status})`)

  mSock.emit('trip:join', { tripId: trip.id })
  await sleep(400)

  const dH = { authorization: `Bearer ${david.accessToken}`, 'content-type': 'application/json' }
  const mH = { authorization: `Bearer ${maria.accessToken}`, 'content-type': 'application/json' }
  const aH = { authorization: `Bearer ${admin.accessToken}`, 'content-type': 'application/json' }

  // 1) start → trip:status + notification:new
  const startRes = await fetch(`${BASE}/api/trips/${trip.id}/start`, { method: 'POST', headers: dH })
  console.log(`[probe] POST start → ${startRes.status}`)
  await sleep(1200)

  // 2) drive the route: eta10 → eta5 → arrived per stop
  const detail = await (await fetch(`${BASE}/api/trips/${trip.id}`, { headers: dH })).json()
  const stops = detail.data.route.stops as any[]
  const kmSouth = (stop: any, km: number) => ({
    lat: stop.location.coordinates[1] - km / 111.32,
    lng: stop.location.coordinates[0],
  })
  const postLocation = async (lat: number, lng: number, speed = 30) => {
    const res = await fetch(`${BASE}/api/trips/${trip.id}/location`, {
      method: 'POST',
      headers: dH,
      body: JSON.stringify({ location: { type: 'Point', coordinates: [lng, lat] }, speed, heading: 45 }),
    })
    console.log(`[probe] POST location (${lat.toFixed(5)}, ${lng.toFixed(5)}) → ${res.status}`)
  }

  // stop 1
  let p = kmSouth(stops[0], 3.5) // ~7 min at 30 km/h → eta 10
  await postLocation(p.lat, p.lng)
  await sleep(1200)
  p = kmSouth(stops[0], 1.5) // ~3 min → eta 5
  await postLocation(p.lat, p.lng)
  await sleep(1200)
  await postLocation(stops[0].location.coordinates[1], stops[0].location.coordinates[0]) // < 75 m → arrived
  await sleep(1200)
  // stop 2
  p = kmSouth(stops[1], 3.5)
  await postLocation(p.lat, p.lng)
  await sleep(1200)
  await postLocation(stops[1].location.coordinates[1], stops[1].location.coordinates[0])
  await sleep(1200)

  // 3) attendance verify (maria reveals Ava's code, david verifies) → attendance:update + student:status + notification:new
  const attRes = await fetch(`${BASE}/api/attendance?tripId=${trip.id}`, { headers: mH })
  const attItems = (await attRes.json()).data.items as any[]
  const ava = attItems.find((a) => a.student?.name?.startsWith('Ava'))
  if (!ava) throw new Error('no attendance row for Ava')
  const codeData = await (await fetch(`${BASE}/api/attendance/${ava.id}/code`, { headers: mH })).json()
  console.log(`[probe] revealed code for Ava (${codeData.data.type}, until ${codeData.data.until})`)
  const verRes = await fetch(`${BASE}/api/attendance/${ava.id}/verify`, {
    method: 'POST',
    headers: dH,
    body: JSON.stringify({ code: codeData.data.code }),
  })
  console.log(`[probe] POST verify → ${verRes.status}`)
  await sleep(1200)

  // 4) messaging → message:new (david) ; thread read → message:read (david)
  const msgRes = await fetch(`${BASE}/api/messages`, {
    method: 'POST',
    headers: mH,
    body: JSON.stringify({ recipientId: david.user.id, body: 'Probe: is the bus on schedule?' }),
  })
  console.log(`[probe] POST messages → ${msgRes.status}`)
  await sleep(600)
  await fetch(`${BASE}/api/messages?userId=${david.user.id}`, { headers: mH })
  await sleep(800)

  // 5) emergency → emergency:new (driver school room + creator mirror) ; admin resolves → emergency:update
  const emRes = await fetch(`${BASE}/api/emergency`, {
    method: 'POST',
    headers: mH,
    body: JSON.stringify({ type: 'other', note: 'Probe: verifying emergency fan-out' }),
  })
  const em = await emRes.json()
  console.log(`[probe] POST emergency → ${emRes.status}`)
  await sleep(800)
  await fetch(`${BASE}/api/emergency/${em.data.id}`, {
    method: 'PATCH',
    headers: aH,
    body: JSON.stringify({ status: 'resolved' }),
  })
  await sleep(1200)

  mSock.close()
  dSock.close()
  await sleep(300)

  const m = [...new Set(received.get('maria') ?? [])]
  const d = [...new Set(received.get('david') ?? [])]
  console.log(`\n[probe] maria received: ${m.join(', ')}`)
  console.log(`[probe] david received: ${d.join(', ')}`)

  const needMaria = ['trip:status', 'trip:location', 'trip:eta', 'trip:arrived', 'notification:new', 'attendance:update', 'student:status', 'emergency:new', 'emergency:update']
  const needDavid = ['message:new', 'message:read', 'emergency:new', 'emergency:update', 'trip:status']
  const missing = [
    ...needMaria.filter((e) => !m.includes(e)).map((e) => `maria:${e}`),
    ...needDavid.filter((e) => !d.includes(e)).map((e) => `david:${e}`),
  ]
  if (missing.length) {
    console.error(`[probe] MISSING EVENTS: ${missing.join(', ')}`)
    process.exit(1)
  }
  console.log('[probe] SOCKET PROBE OK — all expected events received')
  process.exit(0)
}

main().catch((e) => {
  console.error('[probe] failed:', e)
  process.exit(1)
})
