'use client';

/**
 * Parent schedule — "Today's schedule".
 * GET /trips?mine=1&date=today&limit=20 (§6); live refetch on SE.TRIP_STATUS
 * (§13) so trips that start/end/cancel server-side stay accurate.
 */

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { BusFront, Clock, RefreshCw, Route as RouteIcon, Sunrise, Sunset } from 'lucide-react';

import { http } from '@/lib/api/client';
import { SE } from '@/lib/socket/events';
import { useSocketEvent, useSocketStatus, socketStatusLabel, useOnline } from '@/components/providers/socket-provider';
import { EmptyState, ErrorState, PageHeader, PageSkeleton, StatusBadge } from '@/components/ui/kit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TRIP_TYPE_LABEL, type Trip } from '@/features/trips/shared';

type TripList = { items: Trip[]; total: number; page: number; pages: number };

function hm(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'HH:mm');
}

export default function SchedulePage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useSocketStatus();
  const online = useOnline();

  const applyList = useCallback((data: TripList) => {
    setTrips(data.items);
    setError(null);
  }, []);

  // Initial fetch — setState flows through promise callbacks only.
  useEffect(() => {
    let alive = true;
    http
      .get<TripList>('/trips', { mine: 1, date: 'today', limit: 20 })
      .then((d) => {
        if (alive) applyList(d);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Could not load today’s schedule');
      });
    return () => {
      alive = false;
    };
  }, [applyList]);

  const load = useCallback(
    async (loud = false) => {
      try {
        applyList(await http.get<TripList>('/trips', { mine: 1, date: 'today', limit: 20 }));
        if (loud) toast.success('Schedule updated');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not load today’s schedule';
        setError(msg);
        if (loud) toast.error(msg);
      }
    },
    [applyList],
  );

  // Live refresh: today's trips can start/end/cancel server-side at any moment.
  useSocketEvent(
    SE.TRIP_STATUS,
    () => {
      void load();
    },
    [load],
  );

  const refresh = () => {
    setBusy(true);
    void load(true).finally(() => setBusy(false));
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Today's schedule"
        subtitle="Pickups and drop-offs planned for your children today"
        actions={
          <>
            <Badge
              variant="outline"
              className={cn(
                'gap-1.5',
                live
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
              )}
            >
              <span
                aria-hidden
                className={cn('h-1.5 w-1.5 rounded-full', live ? 'animate-pulse bg-emerald-600' : 'bg-amber-600')}
              />
              {socketStatusLabel(live, online)}
            </Badge>
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={refresh} aria-label="Refresh schedule">
              <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} aria-hidden />
            </Button>
          </>
        }
      />

      {error !== null ? (
        <ErrorState message={error} retry={refresh} />
      ) : trips === null ? (
        <PageSkeleton />
      ) : trips.length === 0 ? (
        <EmptyState
          icon={BusFront}
          title="No trips scheduled today"
          body="When the school schedules pickups or drop-offs for your children, they will appear here."
        />
      ) : (
        <ul className="space-y-3">
          {trips.map((t) => (
            <li key={t.id}>
              <div className="nu-raised flex flex-wrap items-center gap-3 rounded-2xl bg-card p-4 sm:flex-nowrap sm:gap-4">
                <span
                  aria-hidden
                  className={cn(
                    'grid h-11 w-11 shrink-0 place-items-center rounded-xl',
                    t.type === 'pickup'
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      : 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
                  )}
                >
                  {t.type === 'pickup' ? <Sunrise className="h-5 w-5" /> : <Sunset className="h-5 w-5" />}
                </span>

                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-semibold">{TRIP_TYPE_LABEL[t.type]}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                    <RouteIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">
                      {t.route?.name ?? 'Unassigned route'}
                      {t.bus?.number ? ` · Bus ${t.bus.number}` : ''}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <p className="inline-flex items-center gap-1 text-sm font-medium tabular-nums">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    {hm(t.scheduledStart)} – {hm(t.scheduledEnd)}
                  </p>
                  <StatusBadge status={t.status} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
