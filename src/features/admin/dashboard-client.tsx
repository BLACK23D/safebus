'use client';

import * as React from 'react';
import { Bus, BusFront, Navigation, RefreshCw, Siren, UserRound } from 'lucide-react';
import dynamic from 'next/dynamic';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { http } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, PageHeader, PageSkeleton, StatCard, StatusBadge } from '@/components/ui/kit';
import { useJoinTrip, useSocketEvent } from '@/components/providers/socket-provider';
import { SE } from '@/lib/socket/events';
import { idOf } from '@/features/admin/use-resource';

/**
 * LiveMap is owned by Task 4 and may land after this file — import it lazily so
 * the dashboard bundle only pulls the (heavy) map module when it renders. If the
 * module is missing at build time the route compiles once Task 4 lands (noted in
 * the worklog); do not create it here.
 */
const LiveMap = dynamic(() => import('@/components/map/live-map').then((m) => m.LiveMap), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full rounded-2xl" aria-label="Loading map" />,
});

/* ------------------------------- types ------------------------------- */

type Stats = {
  students: number;
  drivers: number;
  buses: number;
  routes: number;
  activeTrips: number;
  openEmergencies: number;
  attendanceToday: { present: number; pickedUp: number; droppedOff: number; absent: number; pending: number };
  tripsToday: { total: number; active: number; completed: number };
};

type Analytics = {
  tripsPerDay: { label: string; trips: number }[];
  attendanceTrend: { label: string; rate: number }[];
  fleetStatus: { status: string; count: number }[];
};

type BusRow = {
  id?: string;
  _id?: string;
  number?: string;
  plate?: string;
  capacity?: number;
  status?: string;
  driver?: { name?: string } | null;
  route?: { name?: string } | null;
};

type TripRow = {
  id?: string;
  _id?: string;
  type?: string;
  status?: string;
  routeId?: string;
  route?: { name?: string } | null;
  bus?: { number?: string } | null;
  driver?: { name?: string } | null;
  startedAt?: string;
  currentLocation?: { type?: string; coordinates?: number[] } | { lat?: number; lng?: number } | null;
};

type RouteDetail = {
  id?: string;
  _id?: string;
  name?: string;
  stops?: { id?: string; _id?: string; name?: string; sequence?: number; location?: { coordinates?: number[] } }[] | null;
};

type MapStop = { id: string; name: string; sequence?: number; location: { coordinates: [number, number] } };

const FLEET_COLORS: Record<string, string> = {
  active: '#10b981',
  inactive: '#64748b',
  maintenance: '#f59e0b',
};

const FALLBACK_CENTER = { lat: 30.2672, lng: -97.7431 };

function errOf(r: PromiseSettledResult<unknown>): string | null {
  return r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : 'Request failed') : null;
}

function fmtTime(v?: string): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function busPosition(t: TripRow): { lat: number; lng: number } | null {
  const c = t.currentLocation;
  if (!c || typeof c !== 'object') return null;
  if ('coordinates' in c && Array.isArray(c.coordinates) && c.coordinates.length >= 2) {
    return { lat: Number(c.coordinates[1]), lng: Number(c.coordinates[0]) };
  }
  if ('lat' in c && 'lng' in c && typeof c.lat === 'number' && typeof c.lng === 'number') {
    return { lat: c.lat, lng: c.lng };
  }
  return null;
}

/* ----------------------------- component ----------------------------- */

export function AdminDashboardClient() {
  const [reloadKey, setReloadKey] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [statsError, setStatsError] = React.useState<string | null>(null);
  const [analytics, setAnalytics] = React.useState<Analytics | null>(null);
  const [analyticsError, setAnalyticsError] = React.useState<string | null>(null);
  const [buses, setBuses] = React.useState<BusRow[]>([]);
  const [busesError, setBusesError] = React.useState<string | null>(null);
  const [trips, setTrips] = React.useState<TripRow[]>([]);
  const [tripsError, setTripsError] = React.useState<string | null>(null);
  const [mapsKey, setMapsKey] = React.useState('');

  const [selectedTripId, setSelectedTripId] = React.useState<string | null>(null);
  const [route, setRoute] = React.useState<RouteDetail | null>(null);
  const [routeLoading, setRouteLoading] = React.useState(false);
  const [liveBus, setLiveBus] = React.useState<{ lat: number; lng: number } | null>(null);

  const refresh = React.useCallback(() => setReloadKey((k) => k + 1), []);

  // Parallel load: stats, analytics, buses, active trips, maps config (§12, §5, §6).
  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [s, a, b, t, m] = await Promise.allSettled([
        http.get<Stats>('/admin/stats'),
        http.get<Analytics>('/admin/analytics'),
        http.get<{ items?: BusRow[] } | BusRow[]>('/buses', { limit: 100 }),
        http.get<{ items?: TripRow[] } | TripRow[]>('/trips', { status: 'active', limit: 50 }),
        http.get<{ apiKey: string; provider: string }>('/config/maps'),
      ]);
      if (!alive) return;
      if (s.status === 'fulfilled') {
        setStats(s.value);
        setStatsError(null);
      } else {
        setStats(null);
        setStatsError(errOf(s));
      }
      if (a.status === 'fulfilled') {
        setAnalytics(a.value);
        setAnalyticsError(null);
      } else {
        setAnalytics(null);
        setAnalyticsError(errOf(a));
      }
      if (b.status === 'fulfilled') {
        const d = b.value;
        setBuses(Array.isArray(d) ? d : (d.items ?? []));
        setBusesError(null);
      } else {
        setBuses([]);
        setBusesError(errOf(b));
      }
      if (t.status === 'fulfilled') {
        const d = t.value;
        setTrips(Array.isArray(d) ? d : (d.items ?? []));
        setTripsError(null);
      } else {
        setTrips([]);
        setTripsError(errOf(t));
      }
      if (m.status === 'fulfilled') setMapsKey(m.value.apiKey ?? '');
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  // Selected trip = manual chip choice, else the first active trip (acceptable
  // simplification: one LiveMap renders the selected trip's route + bus).
  const selected = React.useMemo(
    () => trips.find((t) => idOf(t) === selectedTripId) ?? trips[0] ?? null,
    [trips, selectedTripId],
  );
  const effectiveSelectedId = selected ? idOf(selected) : null;

  // Fetch the selected trip's route (ordered stops feed the schematic map).
  React.useEffect(() => {
    const rid = selected?.routeId;
    let alive = true;
    (async () => {
      setRouteLoading(true);
      setLiveBus(null);
      if (!rid) {
        setRoute(null);
        setRouteLoading(false);
        return;
      }
      try {
        const r = await http.get<RouteDetail>(`/routes/${rid}`);
        if (alive) setRoute(r);
      } catch {
        if (alive) setRoute(null);
      } finally {
        if (alive) setRouteLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selected]);

  // Live position for the selected bus (contract §13) + fleet refresh on new trips.
  useJoinTrip(effectiveSelectedId ?? undefined);
  useSocketEvent(SE.TRIP_LOCATION, (payload) => {
    const p = payload as { tripId?: string; location?: { lat?: number; lng?: number } };
    if (!p || p.tripId !== effectiveSelectedId) return;
    const lat = p.location?.lat;
    const lng = p.location?.lng;
    if (typeof lat === 'number' && typeof lng === 'number') setLiveBus({ lat, lng });
  });
  useSocketEvent(SE.TRIP_STATUS, (payload) => {
    const p = payload as { status?: string };
    if (p?.status === 'active') refresh();
  });

  const mapStops: MapStop[] = React.useMemo(
    () =>
      (route?.stops ?? [])
        .filter((s) => Array.isArray(s.location?.coordinates) && (s.location?.coordinates?.length ?? 0) >= 2)
        .map((s) => ({
          id: idOf(s),
          name: s.name ?? 'Stop',
          sequence: s.sequence,
          location: {
            coordinates: [Number(s.location?.coordinates?.[0]), Number(s.location?.coordinates?.[1])] as [number, number],
          },
        })),
    [route],
  );

  const busPin = liveBus ?? (selected ? busPosition(selected) : null);
  const center =
    mapStops.length > 0
      ? { lat: mapStops[0].location.coordinates[1], lng: mapStops[0].location.coordinates[0] }
      : FALLBACK_CENTER;

  const att = stats?.attendanceToday;
  const attChips = att
    ? [
        { label: 'Present', value: att.present, cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
        { label: 'Picked up', value: att.pickedUp, cls: 'bg-brand-500/15 text-brand-700 dark:text-brand-400' },
        { label: 'Dropped off', value: att.droppedOff, cls: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400' },
        { label: 'Absent', value: att.absent, cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-400' },
        { label: 'Pending', value: att.pending, cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
      ]
    : [];
  const fleetTotal = analytics ? analytics.fleetStatus.reduce((acc, f) => acc + f.count, 0) : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        subtitle="Fleet, attendance and trip analytics at a glance"
        actions={
          <Button variant="outline" className="min-h-11 gap-2" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
          </Button>
        }
      />

      {statsError && !stats ? (
        <ErrorState message={statsError} retry={refresh} />
      ) : loading && !stats ? (
        <PageSkeleton />
      ) : stats ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Students" value={stats.students} icon={UserRound} hint={`${stats.drivers} drivers`} />
            <StatCard label="Buses" value={stats.buses} icon={Bus} tone="indigo" hint={`${stats.routes} routes`} />
            <StatCard
              label="Active trips"
              value={stats.activeTrips}
              icon={Navigation}
              tone="emerald"
              hint={`Today: ${stats.tripsToday.total} total · ${stats.tripsToday.completed} completed`}
            />
            <StatCard label="Open alerts" value={stats.openEmergencies} icon={Siren} tone="rose" hint="Unresolved emergencies" />
          </div>

          {/* Attendance today + fleet status */}
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="py-5 lg:col-span-2">
              <CardHeader>
                <CardTitle>Attendance today</CardTitle>
                <CardDescription>Live status counts across today&apos;s trips</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {attChips.map((c) => (
                    <div key={c.label} className={cn('rounded-xl px-3 py-2.5', c.cls)}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{c.label}</p>
                      <p className="text-xl font-black tabular-nums">{c.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="py-5">
              <CardHeader>
                <CardTitle>Fleet status</CardTitle>
                <CardDescription>{fleetTotal} buses by state</CardDescription>
              </CardHeader>
              <CardContent>
                {analyticsError ? (
                  <ErrorState message={analyticsError} retry={refresh} />
                ) : !analytics ? (
                  <div className="h-64 animate-pulse rounded-xl bg-muted" aria-label="Loading fleet status" />
                ) : fleetTotal === 0 ? (
                  <EmptyState title="No buses yet" body="Add buses to see fleet health." icon={Bus} />
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={analytics.fleetStatus}
                          dataKey="count"
                          nameKey="status"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={3}
                          strokeWidth={0}
                        >
                          {analytics.fleetStatus.map((f) => (
                            <Cell key={f.status} fill={FLEET_COLORS[f.status] ?? '#64748b'} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                      {analytics.fleetStatus.map((f) => (
                        <span key={f.status} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: FLEET_COLORS[f.status] ?? '#64748b' }}
                          />
                          {f.status} <span className="font-bold text-foreground">{f.count}</span>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 7-day analytics */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="py-5">
              <CardHeader>
                <CardTitle>Trips per day</CardTitle>
                <CardDescription>Last 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                {analyticsError ? (
                  <ErrorState message={analyticsError} retry={refresh} />
                ) : !analytics ? (
                  <div className="h-64 animate-pulse rounded-xl bg-muted" aria-label="Loading trips chart" />
                ) : (
                  <ResponsiveContainer width="100%" height={256}>
                    <BarChart data={analytics.tripsPerDay} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(100,116,139,0.25)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={36} />
                      <Tooltip cursor={{ fill: 'rgba(25,118,210,0.08)' }} />
                      <Bar dataKey="trips" name="Trips" fill="#1976d2" radius={[6, 6, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="py-5">
              <CardHeader>
                <CardTitle>Attendance trend</CardTitle>
                <CardDescription>Present rate % — last 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                {analyticsError ? (
                  <ErrorState message={analyticsError} retry={refresh} />
                ) : !analytics ? (
                  <div className="h-64 animate-pulse rounded-xl bg-muted" aria-label="Loading attendance chart" />
                ) : (
                  <ResponsiveContainer width="100%" height={256}>
                    <LineChart data={analytics.attendanceTrend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(100,116,139,0.25)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={12} width={36} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="rate"
                        name="Present %"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: '#10b981' }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Fleet — live map + active trips + roster */}
          <Card className="py-5">
            <CardHeader>
              <CardTitle>Fleet</CardTitle>
              <CardDescription>
                Live trips with a schematic route view{mapsKey ? '' : ' (no map key configured — schematic mode)'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {tripsError ? (
                <ErrorState message={tripsError} retry={refresh} />
              ) : trips.length === 0 ? (
                <EmptyState
                  title="No active trips right now"
                  body="Trips appear here as soon as a driver starts one."
                  icon={BusFront}
                />
              ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                  <div className="min-w-0 overflow-hidden rounded-2xl border">
                    {routeLoading ? (
                      <div className="h-80 w-full animate-pulse bg-muted" aria-label="Loading route map" />
                    ) : (
                      <LiveMap
                        apiKey={mapsKey}
                        center={center}
                        stops={mapStops}
                        bus={busPin}
                        className="w-full"
                        height={320}
                        ariaLabel="Fleet map showing the selected trip's route stops and bus position"
                      />
                    )}
                  </div>
                  <div className="max-h-80 space-y-2 overflow-y-auto pr-1 scrollbar-thin" aria-label="Active trips">
                    {trips.map((t) => {
                      const tid = idOf(t);
                      const isSel = tid === effectiveSelectedId;
                      return (
                        <button
                          key={tid}
                          type="button"
                          onClick={() => setSelectedTripId(tid)}
                          aria-pressed={isSel}
                          className={cn(
                            'w-full rounded-xl border p-3 text-left transition-colors',
                            isSel ? 'border-brand-500 bg-brand-500/10' : 'bg-card hover:bg-brand-500/5',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">{t.bus?.number ?? 'Bus'}</span>
                            <StatusBadge status={t.status} />
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {t.type ? t.type.charAt(0).toUpperCase() + t.type.slice(1) : 'Trip'} ·{' '}
                            {t.route?.name ?? 'Unassigned route'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {t.driver?.name ?? 'No driver'} · started {fmtTime(t.startedAt)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Roster */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Buses roster</h3>
                {busesError ? (
                  <p className="text-sm text-rose-600 dark:text-rose-400">{busesError}</p>
                ) : buses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No buses registered yet.</p>
                ) : (
                  <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
                    {buses.map((b) => (
                      <li
                        key={idOf(b)}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-sm"
                      >
                        <span className="font-semibold">{b.number ?? '—'}</span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {b.driver?.name ?? 'No driver'}
                          {b.route?.name ? ` · ${b.route.name}` : ''}
                        </span>
                        <StatusBadge status={b.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
