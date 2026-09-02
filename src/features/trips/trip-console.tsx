'use client';

/**
 * Driver trip console — the complete trip lifecycle state machine.
 * Contract: docs/CONTRACTS.md §6 (trips lifecycle), §7 (attendance/lockout), §13 (events).
 *
 * scheduled → [Start trip] → active (GPS pings + roster verification + live map) → [End trip] → completed
 * The 409 PENDING_STUDENTS safeguard and the 423 LOCKED verify lockout are handled
 * exactly as the backend emits them — never bypassed client-side.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  KeyRound,
  Loader2,
  MapPin,
  Navigation,
  Play,
  Power,
  RefreshCw,
  ShieldAlert,
  Users,
} from 'lucide-react';

import { ApiError, http } from '@/lib/api/client';
import { SE } from '@/lib/socket/events';
import { useJoinTrip, useSocketEvent } from '@/components/providers/socket-provider';
import { LiveMap } from '@/components/map/live-map';
import { PageHeader, StatusBadge } from '@/components/ui/kit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  TRIP_TYPE_LABEL,
  formatTime,
  type AttendanceRow,
  type AttendanceStatus,
  type Trip,
  type TripType,
} from '@/features/trips/shared';

/* ------------------------------ constants ---------------------------- */

/** Server exposes retryAfterSeconds in the raw body only; ApiError drops it → contract default 300. */
const VERIFY_LOCK_DEFAULT_SECONDS = 300;
const LOCATION_POST_MIN_INTERVAL_MS = 5000;

const ATT_COUNT_LABELS: Partial<Record<AttendanceStatus, string>> = {
  picked_up: 'Picked up',
  dropped_off: 'Dropped off',
  returned_to_school: 'Returned to school',
  absent: 'Absent',
  pending: 'Still pending',
};

type BusPosition = { lat: number; lng: number; heading?: number };
type GpsState = { state: 'waiting' | 'sending' | 'error'; message?: string };

/* --------------------------- payload shapes -------------------------- */

type TripLocationPayload = { tripId?: string; location?: { lat?: number; lng?: number }; heading?: number };
type TripArrivedPayload = { tripId?: string; stopId?: string; stopName?: string };
type TripStatusPayload = { tripId?: string };
type AttendanceUpdatePayload = {
  attendanceId?: string;
  studentId?: string;
  studentName?: string;
  status?: AttendanceStatus;
  verified?: boolean;
  tripId?: string;
};

/* ------------------------------ component ---------------------------- */

export function TripConsole({ trip, apiKey }: { trip: Trip; apiKey: string }) {
  const [tripState, setTripState] = useState<Trip>(trip);
  const [refreshing, setRefreshing] = useState(false);
  const [startBusy, setStartBusy] = useState(false);

  // GPS: 'waiting' until the first fix arrives; errors never block other controls.
  const [gps, setGps] = useState<GpsState>({ state: 'waiting' });
  const [gpsDismissed, setGpsDismissed] = useState(false);
  const lastPostRef = useRef(0);

  // Map state (real positions only — never simulated).
  const [busPos, setBusPos] = useState<BusPosition | null>(() => {
    const c = trip.currentLocation?.coordinates;
    return c && c.length >= 2 ? { lat: c[1], lng: c[0] } : null;
  });
  const [lastArrivedId, setLastArrivedId] = useState<string | null>(null);

  // Verify dialog + 423 lockout countdown.
  const [verifyTarget, setVerifyTarget] = useState<AttendanceRow | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [lockSeconds, setLockSeconds] = useState(0);
  const locked = lockSeconds > 0;

  // End-trip dialog; endPending !== null switches it into the forced-end safeguard.
  const [endOpen, setEndOpen] = useState(false);
  const [endPending, setEndPending] = useState<number | null>(null);
  const [endBusy, setEndBusy] = useState(false);

  const stops = useMemo(() => tripState.route?.stops ?? [], [tripState.route?.stops]);
  const attendance = useMemo(() => tripState.attendance ?? [], [tripState.attendance]);

  const active = tripState.status === 'active';
  useJoinTrip(active ? tripState.id : null);

  /* ------------------------------ refetch ------------------------------ */

  const refetch = useCallback(
    async (loud = false) => {
      setRefreshing(true);
      try {
        const fresh = await http.get<Trip>(`/trips/${tripState.id}`);
        setTripState(fresh);
        if (loud) toast.success('Trip updated');
      } catch (err) {
        if (loud) toast.error(err instanceof Error ? err.message : 'Could not refresh trip');
      } finally {
        setRefreshing(false);
      }
    },
    [tripState.id],
  );

  /* --------------------------- socket events --------------------------- */

  useSocketEvent(
    SE.TRIP_LOCATION,
    (payload) => {
      const p = payload as TripLocationPayload;
      if (p.tripId !== tripState.id) return;
      const lat = p.location?.lat;
      const lng = p.location?.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      setBusPos({ lat, lng, heading: p.heading });
    },
    [tripState.id],
  );

  useSocketEvent(
    SE.TRIP_ARRIVED,
    (payload) => {
      const p = payload as TripArrivedPayload;
      if (p.tripId !== tripState.id || !p.stopId) return;
      setLastArrivedId(p.stopId);
      if (p.stopName) toast.info(`Arrived at ${p.stopName}`);
    },
    [tripState.id],
  );

  useSocketEvent(
    SE.TRIP_STATUS,
    (payload) => {
      const p = payload as TripStatusPayload;
      if (p.tripId !== tripState.id) return;
      // Assigned trips can be started/ended/cancelled server-side (admin) — resync.
      void refetch();
    },
    [tripState.id, refetch],
  );

  useSocketEvent(
    SE.ATTENDANCE_UPDATE,
    (payload) => {
      const p = payload as AttendanceUpdatePayload;
      if (p.tripId !== tripState.id) return;
      setTripState((ts) => ({
        ...ts,
        attendance: (ts.attendance ?? []).map((a) =>
          a.id === p.attendanceId || (p.studentId !== undefined && a.studentId === p.studentId)
            ? {
                ...a,
                status: p.status ?? a.status,
                verified: p.verified ?? a.verified,
                student: p.studentName
                  ? { id: a.studentId, name: p.studentName, grade: a.student?.grade }
                  : a.student,
              }
            : a,
        ),
      }));
    },
    [tripState.id],
  );

  /* ------------------------------ GPS watch ---------------------------- */

  const geoSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  useEffect(() => {
    if (!active || !geoSupported) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed, heading } = pos.coords;
        setBusPos({ lat: latitude, lng: longitude, heading: heading ?? undefined });
        setGps((g) => (g.state === 'sending' ? g : { state: 'sending' }));

        const now = Date.now();
        if (now - lastPostRef.current < LOCATION_POST_MIN_INTERVAL_MS) return; // throttle ≥5s
        lastPostRef.current = now;

        // Safety-critical write: never queued for replay — failures surface and drop.
        void http
          .post(`/trips/${tripState.id}/location`, {
            location: { type: 'Point', coordinates: [longitude, latitude] },
            speed: speed ?? 0,
            heading: heading ?? undefined,
          })
          .catch(() => {
            setGps({
              state: 'error',
              message: 'Could not send location updates — check your connection. Retrying automatically.',
            });
          });
      },
      () => {
        setGps({ state: 'error', message: 'Location unavailable — enable GPS so parents get live ETAs' });
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [active, geoSupported, tripState.id]);

  /* -------------------------- lockout countdown ------------------------- */

  useEffect(() => {
    if (!locked) return;
    const timer = setInterval(() => setLockSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [locked]);

  /* ------------------------------ mutations ---------------------------- */

  async function startTrip() {
    setStartBusy(true);
    try {
      await http.post<Trip>(`/trips/${tripState.id}/start`, {});
      toast.success('Trip started');
      await refetch(); // loads the expected attendance rows created server-side
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.info('Trip already underway');
        await refetch();
      } else {
        toast.error(err instanceof Error ? err.message : 'Could not start trip');
      }
    } finally {
      setStartBusy(false);
    }
  }

  function openVerify(row: AttendanceRow) {
    setVerifyTarget(row);
    setVerifyCode('');
    setVerifyError(null);
    const remain = row.lockedUntil
      ? Math.max(0, Math.ceil((new Date(row.lockedUntil).getTime() - Date.now()) / 1000))
      : 0;
    setLockSeconds((prev) => (remain > 0 ? remain : prev));
  }

  function closeVerify() {
    setVerifyTarget(null);
    setVerifyCode('');
    setVerifyError(null);
    setVerifyBusy(false);
    // lockSeconds intentionally preserved so a running lockout survives close/reopen.
  }

  async function submitVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const row = verifyTarget;
    if (!row || verifyBusy || locked) return;
    setVerifyBusy(true);
    setVerifyError(null);
    try {
      const fresh = await http.post<AttendanceRow>(`/attendance/${row.id}/verify`, { code: verifyCode });
      setTripState((ts) => ({
        ...ts,
        attendance: (ts.attendance ?? []).map((a) => (a.id === fresh.id ? { ...a, ...fresh } : a)),
      }));
      const name = fresh.student?.name ?? row.student?.name ?? 'Student';
      toast.success(`${name} ${tripState.type === 'pickup' ? 'picked up' : 'dropped off'}`);
      closeVerify(); // clears the draft only on success
    } catch (err) {
      if (err instanceof ApiError && (err.status === 423 || err.code === 'LOCKED')) {
        setLockSeconds(VERIFY_LOCK_DEFAULT_SECONDS);
        setVerifyError(null);
      } else if (err instanceof ApiError && err.status === 400) {
        setVerifyError('Invalid code — ask the parent for the 6-digit code');
        // draft (verifyCode) intentionally kept so the driver can retry
      } else {
        toast.error(err instanceof Error ? err.message : 'Verification failed');
      }
    } finally {
      setVerifyBusy(false);
    }
  }

  async function endTrip(force: boolean) {
    setEndBusy(true);
    try {
      await http.post<Trip>(`/trips/${tripState.id}/end`, force ? { force: true } : {});
      setEndOpen(false);
      setEndPending(null);
      toast.success('Trip ended');
      await refetch(); // final attendance states (absent / returned_to_school on force)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'PENDING_STUDENTS') {
        const fromServer = Number(err.fieldErrors?.pendingCount);
        const localPending =
          tripState.attendance?.filter((a) => a.status === 'pending').length ?? tripState.pendingCount ?? 0;
        setEndPending(Number.isFinite(fromServer) && fromServer > 0 ? fromServer : localPending);
      } else if (err instanceof ApiError && err.status === 409) {
        // Trip already ended/cancelled elsewhere.
        toast.info(err.message || 'Trip is no longer active');
        setEndOpen(false);
        setEndPending(null);
        await refetch();
      } else {
        toast.error(err instanceof Error ? err.message : 'Could not end trip');
      }
    } finally {
      setEndBusy(false);
    }
  }

  /* ------------------------------- derived ----------------------------- */

  const roster = useMemo(() => {
    const seqOf = new Map<string, number>(stops.map((s, i) => [s.id, s.sequence ?? i + 1]));
    return [...attendance].sort(
      (a, b) => (seqOf.get(a.stopId ?? '') ?? 999) - (seqOf.get(b.stopId ?? '') ?? 999),
    );
  }, [attendance, stops]);

  const doneCount = roster.filter((a) => a.status !== 'pending').length;

  const center = useMemo(() => {
    if (stops.length === 0) return undefined;
    const [lng, lat] = stops[0].location.coordinates;
    return { lat, lng };
  }, [stops]);

  const statusCounts = useMemo(() => {
    const c: Partial<Record<AttendanceStatus, number>> = {};
    for (const a of attendance) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [attendance]);

  const busLabel = [tripState.bus?.number, tripState.bus?.plate].filter(Boolean).join(' · ');
  const subtitleParts = [
    tripState.route?.name ? `Route ${tripState.route.name}` : null,
    busLabel ? `Bus ${busLabel}` : null,
  ].filter(Boolean);

  const gpsChip = (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5',
        gps.state === 'sending'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
      )}
    >
      <Navigation className="h-3 w-3" aria-hidden />
      <span className="hidden sm:inline">
        GPS:{' '}
        {gps.state === 'sending' ? 'sending updates' : gps.state === 'waiting' ? 'waiting for fix' : 'unavailable'}
      </span>
      <span className="sm:hidden">GPS</span>
    </Badge>
  );

  const showGpsBanner =
    active && !geoSupported
      ? true
      : active && gps.state === 'error' && !gpsDismissed;

  /* -------------------------------- render ----------------------------- */

  return (
    <div className="space-y-4">
      <Link
        href="/driver"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Dashboard
      </Link>

      <PageHeader
        title={TRIP_TYPE_LABEL[tripState.type]}
        subtitle={subtitleParts.length > 0 ? subtitleParts.join('  ·  ') : undefined}
        actions={
          <>
            <StatusBadge status={tripState.status} />
            {active && gpsChip}
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              onClick={() => void refetch(true)}
              aria-label="Refresh trip"
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} aria-hidden />
            </Button>
            {active && (
              <Button
                variant="outline"
                className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  setEndPending(null);
                  setEndOpen(true);
                }}
              >
                <Power className="h-4 w-4" aria-hidden /> End trip
              </Button>
            )}
          </>
        }
      />

      {/* ------------------------- scheduled ------------------------- */}
      {tripState.status === 'scheduled' && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" aria-hidden />
                Scheduled start {formatTime(tripState.scheduledStart)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" aria-hidden />
                {stops.length} {stops.length === 1 ? 'stop' : 'stops'}
              </span>
            </div>
            <p className="max-w-prose text-sm text-muted-foreground">
              Starting the trip notifies every parent on the route and creates the student roster you will
              verify with 6-digit codes at each stop.
            </p>
            <Button
              size="lg"
              className="h-14 w-full text-base md:h-12 md:w-auto md:px-10"
              onClick={() => void startTrip()}
              disabled={startBusy}
            >
              {startBusy ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <Play className="h-5 w-5" aria-hidden />
              )}
              Start {TRIP_TYPE_LABEL[tripState.type].toLowerCase()}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* --------------------------- active --------------------------- */}
      {active && (
        <div className="space-y-4">
          {showGpsBanner && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="flex-1">
                {!geoSupported
                  ? 'Location unavailable — this device does not support GPS, parents will not see live ETAs.'
                  : gps.state === 'error'
                    ? (gps.message ?? 'Location unavailable — enable GPS so parents get live ETAs')
                    : ''}
              </p>
              <button
                type="button"
                onClick={() => setGpsDismissed(true)}
                aria-label="Dismiss location warning"
                className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xl text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
              >
                <span aria-hidden>×</span>
                <span className="sr-only">Dismiss</span>
              </button>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="overflow-hidden lg:col-span-3">
              <LiveMap
                apiKey={apiKey}
                center={center}
                stops={stops}
                bus={busPos}
                arrivalStopId={lastArrivedId}
                height={380}
                className="w-full"
                ariaLabel={`Live map — ${TRIP_TYPE_LABEL[tripState.type]} on ${tripState.route?.name ?? 'route'}`}
              />
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden />
                  Students
                  <Badge variant="secondary" className="tabular-nums">
                    {doneCount}/{roster.length}
                  </Badge>
                </CardTitle>
                <CardDescription>Verify each student with the parent’s 6-digit code.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {roster.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Student roster will appear here once the trip starts.
                  </p>
                ) : (
                  <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                    {roster.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-3"
                      >
                        <div className="min-w-0 flex-1 basis-40">
                          <p className="truncate font-medium">
                            {row.student?.name ?? 'Student'}
                            {row.student?.grade !== undefined && row.student?.grade !== null && (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                Grade {row.student.grade}
                              </span>
                            )}
                          </p>
                          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                            {row.stopName ?? 'No stop assigned'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {row.verified && (
                            <CheckCircle2
                              className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                              aria-label="Verified"
                            />
                          )}
                          <StatusBadge status={row.status} />
                          {row.status === 'pending' && (
                            <Button className="h-11 shrink-0" onClick={() => openVerify(row)}>
                              <KeyRound className="h-4 w-4" aria-hidden /> Verify code
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ---------------------- completed / cancelled ---------------------- */}
      {(tripState.status === 'completed' || tripState.status === 'cancelled') && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Trip summary</CardTitle>
            <CardDescription>
              {tripState.status === 'cancelled'
                ? 'This trip was cancelled by the school.'
                : 'Route complete — final attendance below.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryTile label="Scheduled" value={formatTime(tripState.scheduledStart)} />
              <SummaryTile label="Started" value={formatTime(tripState.startedAt)} />
              <SummaryTile label="Ended" value={formatTime(tripState.endedAt)} />
              <SummaryTile label="Students" value={String(attendance.length)} />
            </dl>

            {attendance.length > 0 ? (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(Object.keys(ATT_COUNT_LABELS) as AttendanceStatus[])
                  .filter((s) => (statusCounts[s] ?? 0) > 0)
                  .map((s) => (
                    <SummaryTile
                      key={s}
                      label={ATT_COUNT_LABELS[s] ?? s}
                      value={String(statusCounts[s] ?? 0)}
                    />
                  ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No attendance was recorded for this trip.</p>
            )}

            <Button asChild className="h-11">
              <Link href="/driver">
                <ArrowLeft className="h-4 w-4" aria-hidden /> Back to dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ------------------------- verify dialog ------------------------- */}
      <Dialog open={verifyTarget !== null} onOpenChange={(o) => !o && closeVerify()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden />
              Verify {verifyTarget?.student?.name ?? 'student'}
            </DialogTitle>
            <DialogDescription>
              Ask the parent for the 6-digit {tripState.type === 'pickup' ? 'pickup' : 'drop-off'} code shown
              in their app, then enter it below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void submitVerify(e)} className="space-y-3">
            {locked ? (
              <div
                role="alert"
                className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
              >
                <p className="flex items-center gap-2 font-medium">
                  <ShieldAlert className="h-4 w-4" aria-hidden /> Too many failed attempts
                </p>
                <p className="mt-1">
                  Verification is locked for{' '}
                  <span className="font-bold tabular-nums">{mmss(lockSeconds)}</span>. No retries are allowed
                  until the countdown ends.
                </p>
              </div>
            ) : (
              <>
                <Input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label={`6-digit code for ${verifyTarget?.student?.name ?? 'student'}`}
                  placeholder="••••••"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => {
                    setVerifyError(null);
                    setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  }}
                  disabled={verifyBusy}
                  aria-invalid={verifyError ? true : undefined}
                  className="h-14 text-center text-2xl font-bold tracking-[0.5em]"
                />
                {verifyError && (
                  <p role="alert" className="text-sm font-medium text-destructive">
                    {verifyError}
                  </p>
                )}
              </>
            )}
            <DialogFooter className="flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1"
                onClick={closeVerify}
                disabled={verifyBusy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-11 flex-1"
                disabled={verifyBusy || locked || verifyCode.length !== 6}
              >
                {verifyBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Confirm
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* --------------------------- end dialog --------------------------- */}
      <Dialog
        open={endOpen}
        onOpenChange={(o) => {
          setEndOpen(o);
          if (!o) setEndPending(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {endPending === null ? (
            <>
              <DialogHeader>
                <DialogTitle>End this trip?</DialogTitle>
                <DialogDescription>
                  Live location will stop broadcasting and parents will be notified that the route is
                  complete. A trip cannot be reopened after it ends.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-row gap-2">
                <Button
                  variant="outline"
                  className="h-11 flex-1"
                  onClick={() => setEndOpen(false)}
                  disabled={endBusy}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="h-11 flex-1"
                  onClick={() => void endTrip(false)}
                  disabled={endBusy}
                >
                  {endBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} End trip
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" aria-hidden />
                  {endPending} {endPending === 1 ? 'student' : 'students'} still pending
                </DialogTitle>
                <DialogDescription>
                  You are about to end the {TRIP_TYPE_LABEL[tripState.type].toLowerCase()} before every
                  student was verified.
                </DialogDescription>
              </DialogHeader>
              <div
                role="alert"
                className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-800 dark:text-rose-300"
              >
                Ending now will mark the remaining {endPending}{' '}
                {endPending === 1 ? 'student' : 'students'} as{' '}
                <strong>{tripState.type === 'pickup' ? 'absent' : 'returned to school'}</strong>. This cannot
                be undone — verify remaining students first if possible.
              </div>
              <DialogFooter className="flex-row gap-2">
                <Button
                  variant="outline"
                  className="h-11 flex-1"
                  onClick={() => setEndOpen(false)}
                  disabled={endBusy}
                >
                  Keep trip active
                </Button>
                <Button
                  variant="destructive"
                  className="h-11 flex-1"
                  onClick={() => void endTrip(true)}
                  disabled={endBusy}
                >
                  {endBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Force end trip
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------- helpers ------------------------------ */

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
