'use client';

/**
 * Parent live tracking — "Live Map".
 *
 * Contract: docs/CONTRACTS.md §4 (students), §5 (routes/stops), §6 (trips),
 * §13 (Socket.IO events). Data sources are REAL only:
 *  - `GET /routes/:routeId`  → ordered stops (§5)
 *  - `GET /trips?mine=1&date=today` → today's trips touching the linked children (§6)
 *  - SE.TRIP_LOCATION / TRIP_ARRIVED / TRIP_ETA / TRIP_STATUS / STUDENT_STATUS (§13)
 * The map itself is the shared LiveMap (Google when a key exists, schematic
 * fallback with the same real geometry otherwise — §12).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  BusFront,
  CheckCircle2,
  Clock,
  MapPin,
  RefreshCw,
  Route as RouteIcon,
  Sunrise,
  Sunset,
  Users,
} from 'lucide-react';

import { http } from '@/lib/api/client';
import { SE } from '@/lib/socket/events';
import { useJoinTrip, useSocketEvent, useSocketStatus } from '@/components/providers/socket-provider';
import { LiveMap, type BusPosition } from '@/components/map/live-map';
import { EmptyState, ErrorState, PageHeader, PageSkeleton, StatusBadge } from '@/components/ui/kit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AppSession } from '@/lib/auth/session';
import { TRIP_TYPE_LABEL, type Trip, type TripStatus } from '@/features/trips/shared';

/* ------------------------------- types ------------------------------- */

export type TrackingChild = {
  id: string;
  name: string;
  grade?: string | null;
  routeId?: string | null;
  stopId?: string | null;
};

type RouteStop = {
  id: string;
  name: string;
  sequence: number;
  location: { type: 'Point'; coordinates: [number, number] };
};

type RouteDetail = {
  id: string;
  name: string;
  status?: string;
  stopIds?: string[];
  stops?: RouteStop[];
};

type TripList = { items: TrackingTrip[]; total: number; page: number; pages: number };

/** Trip list payload (§6) — backend includes routeId; shared type adds it for matching. */
type TrackingTrip = Trip & { routeId?: string | null };

type EtaState = { tripId: string; stopId: string; stopName: string; minutes: number };

type TripLocationPayload = { tripId?: string; location?: { lat?: number; lng?: number }; heading?: number };
type TripArrivedPayload = { tripId?: string; stopId?: string; stopName?: string; at?: string };
type TripEtaPayload = { tripId?: string; stopId?: string; stopName?: string; minutes?: number };
type TripStatusPayload = { tripId?: string; status?: TripStatus; startedAt?: string; endedAt?: string };
type StudentStatusPayload = { studentId?: string; status?: string; tripId?: string; at?: string };

const CHILD_STATUS_LABEL: Record<string, string> = {
  waiting: 'is waiting at the stop',
  picked_up: 'was picked up',
  in_transit: 'is on the bus',
  dropped_off: 'was dropped off',
  absent: 'was marked absent',
  returned_to_school: 'was returned to school',
};

function hm(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'HH:mm');
}

function pickTrip(items: TrackingTrip[], routeId: string): TrackingTrip | null {
  const matching = items.filter((t) => t.routeId === routeId);
  return matching.find((t) => t.status === 'active') ?? matching[0] ?? null;
}

/* ----------------------------- component ----------------------------- */

export function TrackingClient({
  apiKey,
  session: _session,
  children_,
}: {
  apiKey: string;
  session: AppSession;
  children_: TrackingChild[];
}) {
  const kids = children_;
  const [selectedId, setSelectedId] = useState<string | null>(kids[0]?.id ?? null);
  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [trip, setTrip] = useState<TrackingTrip | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Live state (all seeded from real data / events only).
  const [bus, setBus] = useState<BusPosition>(null);
  const [arrived, setArrived] = useState<Record<string, string>>({});
  const [eta, setEta] = useState<EtaState | null>(null);
  const [childStatus, setChildStatus] = useState<string | null>(null);
  const etaToastKeys = useRef<Set<string>>(new Set());
  const prevChildStatusRef = useRef<string | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const live = useSocketStatus();
  const child = useMemo(() => kids.find((k) => k.id === selectedId) ?? kids[0] ?? null, [kids, selectedId]);

  // Fetch the selected child's route (ordered stops) + today's trip touching that route.
  useEffect(() => {
    const c = kids.find((k) => k.id === selectedId);
    if (!c?.routeId) return;
    const routeId = c.routeId;
    let alive = true;
    http
      .get<RouteDetail>(`/routes/${routeId}`)
      .then((r) => {
        if (alive) setRoute(r);
      })
      .catch((err) => {
        if (alive) setRouteError(err instanceof Error ? err.message : 'Could not load the route');
      });
    http
      .get<TripList>('/trips', { mine: 1, date: 'today', limit: 20 })
      .then((d) => {
        if (alive) setTrip(pickTrip(d.items, routeId));
      })
      .catch(() => {
        /* Trip list is optional — the map still renders the route. */
      });
    return () => {
      alive = false;
    };
  }, [selectedId, reloadKey, kids]);

  const tripId = trip?.id ?? null;
  useJoinTrip(tripId);

  const resetLiveState = useCallback(() => {
    setBus(null);
    setArrived({});
    setEta(null);
    setChildStatus(null);
    prevChildStatusRef.current = null;
  }, []);

  const selectChild = useCallback(
    (id: string) => {
      if (id === selectedId) return;
      setSelectedId(id);
      setRoute(null);
      setRouteError(null);
      setTrip(null);
      resetLiveState();
    },
    [selectedId, resetLiveState],
  );

  const refresh = useCallback(() => {
    setRoute(null);
    setRouteError(null);
    setTrip(null);
    resetLiveState();
    setReloadKey((k) => k + 1);
  }, [resetLiveState]);

  /* --------------------------- live events --------------------------- */

  useSocketEvent(
    SE.TRIP_LOCATION,
    (payload) => {
      const p = payload as TripLocationPayload;
      if (!trip || p.tripId !== trip.id) return;
      const lat = p.location?.lat;
      const lng = p.location?.lng;
      if (typeof lat === 'number' && typeof lng === 'number') {
        setBus({ lat, lng, heading: p.heading });
      }
    },
    [trip],
  );

  useSocketEvent(
    SE.TRIP_ARRIVED,
    (payload) => {
      const p = payload as TripArrivedPayload;
      if (!trip || p.tripId !== trip.id || !p.stopId) return;
      const stopId = p.stopId;
      setArrived((prev) => ({ ...prev, [stopId]: p.at ?? new Date().toISOString() }));
      setEta((prev) => (prev && prev.stopId === stopId ? null : prev));
      toast.info(`Bus arrived at ${p.stopName ?? 'the stop'}`);
    },
    [trip],
  );

  useSocketEvent(
    SE.TRIP_ETA,
    (payload) => {
      const p = payload as TripEtaPayload;
      if (!trip || p.tripId !== trip.id || !p.stopId || typeof p.minutes !== 'number') return;
      setEta({ tripId: trip.id, stopId: p.stopId, stopName: p.stopName ?? 'the stop', minutes: p.minutes });
      // One toast per (trip, stop, minutes) combination.
      const key = `${trip.id}:${p.stopId}:${p.minutes}`;
      if (!etaToastKeys.current.has(key)) {
        etaToastKeys.current.add(key);
        toast.info(`Bus is ${p.minutes} minutes away — ${p.stopName ?? 'your stop'}`);
      }
    },
    [trip],
  );

  useSocketEvent(
    SE.TRIP_STATUS,
    (payload) => {
      const p = payload as TripStatusPayload;
      if (!trip || p.tripId !== trip.id || !p.status) return;
      const nextStatus: TripStatus = p.status;
      const startedAt = p.startedAt;
      const endedAt = p.endedAt;
      setTrip((prev) =>
        prev && prev.id === trip.id
          ? {
              ...prev,
              status: nextStatus,
              startedAt: startedAt ?? prev.startedAt,
              endedAt: endedAt ?? prev.endedAt,
            }
          : prev,
      );
    },
    [trip],
  );

  useSocketEvent(
    SE.STUDENT_STATUS,
    (payload) => {
      const p = payload as StudentStatusPayload;
      if (!child || p.studentId !== child.id) return;
      const next = p.status;
      if (!next) return;
      if (prevChildStatusRef.current !== next) {
        prevChildStatusRef.current = next;
        toast.success(`${child.name} ${CHILD_STATUS_LABEL[next] ?? `is ${next.replace(/_/g, ' ')}`}`);
      }
      setChildStatus(next);
    },
    [child],
  );

  /* ---------------------------- derived ------------------------------ */

  const stops = useMemo<RouteStop[]>(() => {
    if (route?.stops && route.stops.length > 0) return route.stops;
    return (trip?.route?.stops ?? []) as RouteStop[];
  }, [route, trip]);

  const nextStopId = useMemo(() => stops.find((s) => !(s.id in arrived))?.id ?? null, [stops, arrived]);

  const seededBus = useMemo<BusPosition>(() => {
    const c = trip?.currentLocation?.coordinates;
    return c && c.length >= 2 ? { lat: c[1], lng: c[0] } : null;
  }, [trip]);
  const busPos: BusPosition = bus ?? seededBus;

  const arrivedCount = stops.filter((s) => s.id in arrived).length;
  const loading = Boolean(child?.routeId) && route === null && trip === null && routeError === null;
  const showMapStops = useMemo(
    () =>
      stops
        .filter((s) => Array.isArray(s.location?.coordinates) && s.location.coordinates.length >= 2)
        .map((s) => ({
          id: s.id,
          name: s.name,
          sequence: s.sequence,
          location: { coordinates: s.location.coordinates },
        })),
    [stops],
  );
  const mapCenter = showMapStops[0]
    ? { lat: showMapStops[0].location.coordinates[1], lng: showMapStops[0].location.coordinates[0] }
    : undefined;

  /* ------------------------- interactions ---------------------------- */

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % kids.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + kids.length) % kids.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = kids.length - 1;
    if (next >= 0) {
      e.preventDefault();
      const nk = kids[next];
      if (nk) {
        selectChild(nk.id);
        tabRefs.current[nk.id]?.focus();
      }
    }
  };

  /* ----------------------------- render ------------------------------ */

  if (kids.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Live Map" subtitle="Follow your children's bus in real time" />
        <EmptyState
          icon={Users}
          title="No linked children yet"
          body="When your school links children to your account, their live trips will appear here."
        />
      </div>
    );
  }

  const liveChip = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold',
        live ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
      )}
      title={live ? 'Live — connected' : 'Reconnecting — live updates paused'}
    >
      <span aria-hidden className={cn('status-light', live ? 'text-emerald-500' : 'text-amber-500')} />
      {live ? 'Live' : 'Reconnecting…'}
    </span>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Live Map"
        subtitle="Follow your children's bus in real time"
        actions={
          <>
            {liveChip}
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={refresh} aria-label="Refresh tracking">
              <RefreshCw className="h-4 w-4" aria-hidden />
            </Button>
          </>
        }
      />

      {/* Child switcher */}
      <div role="tablist" aria-label="Children" className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
        {kids.map((k, i) => {
          const selected = k.id === child?.id;
          return (
            <button
              key={k.id}
              ref={(el) => {
                tabRefs.current[k.id] = el;
              }}
              type="button"
              role="tab"
              id={`child-tab-${k.id}`}
              aria-selected={selected}
              aria-controls="tracking-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => selectChild(k.id)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className={cn(
                'flex min-h-[3.25rem] min-w-[9.5rem] shrink-0 items-center gap-2.5 rounded-2xl border p-2 pr-4 text-left transition-colors',
                selected ? 'border-brand-500 bg-brand-500/10 ring-2 ring-brand-500/40' : 'bg-card hover:bg-accent',
              )}
            >
              <span
                aria-hidden
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-700 dark:text-brand-400"
              >
                {k.name.trim().charAt(0).toUpperCase() || '?'}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{k.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {k.grade != null && k.grade !== '' ? `Grade ${k.grade}` : '\u00A0'}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div id="tracking-panel" role="tabpanel" aria-labelledby={`child-tab-${child?.id ?? ''}`} className="space-y-4">
        {!child?.routeId ? (
          <EmptyState
            icon={RouteIcon}
            title="No route assigned yet"
            body={`The school has not assigned a bus route for ${child?.name ?? 'this child'} yet. Once assigned, live tracking appears here.`}
          />
        ) : loading ? (
          <PageSkeleton />
        ) : routeError !== null && trip === null ? (
          <ErrorState message={routeError} retry={refresh} />
        ) : (
          <>
            {/* Trip header */}
            <div className="nu-raised flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-card p-4">
              <span
                aria-hidden
                className={cn(
                  'grid h-11 w-11 shrink-0 place-items-center rounded-xl',
                  trip?.type === 'dropoff'
                    ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                )}
              >
                {trip?.type === 'dropoff' ? <Sunset className="h-5 w-5" /> : <Sunrise className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  <span className="truncate">{route?.name ?? trip?.route?.name ?? 'Route'}</span>
                  <StatusBadge status={trip?.status} />
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  {trip ? (
                    <>
                      {TRIP_TYPE_LABEL[trip.type]}
                      {trip.bus?.number ? (
                        <>
                          <span aria-hidden>·</span>
                          <span className="inline-flex items-center gap-1">
                            <BusFront className="h-3.5 w-3.5" aria-hidden />
                            Bus {trip.bus.number}
                          </span>
                        </>
                      ) : null}
                      <span aria-hidden>·</span>
                      <span>
                        {hm(trip.scheduledStart)} – {hm(trip.scheduledEnd)}
                      </span>
                    </>
                  ) : (
                    'No trip scheduled for today'
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {childStatus !== null && <StatusBadge status={childStatus} />}
                {/* ETA announcements are polite live-region updates (§13 trip:eta). */}
                <div aria-live="polite">
                  {eta && eta.tripId === trip?.id ? (
                    <Badge
                      variant="outline"
                      className="gap-1.5 border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-400"
                    >
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      {eta.minutes} min — {eta.stopName}
                    </Badge>
                  ) : (
                    <span className="sr-only">No arrival estimate yet</span>
                  )}
                </div>
              </div>
            </div>

            <LiveMap
              apiKey={apiKey}
              center={mapCenter}
              stops={showMapStops}
              bus={busPos}
              arrivalStopId={trip?.status === 'active' ? nextStopId : null}
              height="h-[320px] md:h-[420px]"
              className="w-full"
              ariaLabel={`Live map of ${route?.name ?? trip?.route?.name ?? 'the route'} with the bus position`}
            />

            {/* Stop timeline */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden />
                  Stops
                  {trip?.status === 'active' && (
                    <Badge variant="secondary" className="tabular-nums">
                      {arrivedCount}/{stops.length}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {trip?.status === 'active'
                    ? 'Live progress along the route — the next stop pulses.'
                    : 'Route stops in travel order.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {stops.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No stops on this route.
                  </p>
                ) : (
                  <ol className="space-y-0">
                    {stops.map((s, i) => {
                      const at = arrived[s.id];
                      const isNext = trip?.status === 'active' && s.id === nextStopId;
                      const isMine = child?.stopId === s.id;
                      return (
                        <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
                          {i < stops.length - 1 && (
                            <span
                              aria-hidden
                              className="absolute left-[15px] top-9 h-[calc(100%-2.25rem)] w-px bg-border"
                            />
                          )}
                          <span
                            className={cn(
                              'relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-bold tabular-nums',
                              at
                                ? 'border-transparent bg-emerald-500 text-white'
                                : isNext
                                  ? 'border-brand-500 bg-card text-brand-600 motion-safe:animate-pulse dark:text-brand-400'
                                  : 'border-border bg-card text-muted-foreground',
                            )}
                          >
                            {at ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : s.sequence ?? i + 1}
                            <span className="sr-only">Stop {s.sequence ?? i + 1}</span>
                          </span>
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 pt-1.5">
                            <p className="truncate text-sm font-medium">{s.name}</p>
                            {isMine && <Badge variant="secondary">Your stop</Badge>}
                            <span className="flex-1" aria-hidden />
                            {at && (
                              <span className="inline-flex items-center gap-1 text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                                {hm(at)}
                              </span>
                            )}
                            {isNext && (
                              <Badge
                                variant="outline"
                                className="motion-safe:animate-pulse border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              >
                                Next
                              </Badge>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
