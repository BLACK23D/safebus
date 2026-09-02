'use client';

/**
 * Driver dashboard — "Today's trips".
 * GET /trips?driver=me&date=today&limit=20 (§6), live refresh on SE.TRIP_STATUS (§13):
 * trips assigned to this driver can activate or change server-side at any moment.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { BusFront, ChevronRight, Clock, RefreshCw, Route as RouteIcon, Sunrise, Sunset } from 'lucide-react';

import { http } from '@/lib/api/client';
import { SE } from '@/lib/socket/events';
import { useSocketEvent, useSocketStatus } from '@/components/providers/socket-provider';
import { EmptyState, ErrorState, PageHeader, PageSkeleton, StatusBadge } from '@/components/ui/kit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TRIP_TYPE_LABEL, formatTime, type Trip } from '@/features/trips/shared';

type TripList = { items: Trip[]; total: number; page: number; pages: number };

export function DriverDashboard() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useSocketStatus();

  const applyList = useCallback((data: TripList) => {
    setTrips(data.items);
    setError(null);
  }, []);

  // Initial fetch — setState flows through the promise callback (subscription pattern).
  useEffect(() => {
    let alive = true;
    http
      .get<TripList>('/trips', { driver: 'me', date: 'today', limit: 20 })
      .then((d) => {
        if (alive) applyList(d);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Could not load today’s trips');
      });
    return () => {
      alive = false;
    };
  }, [applyList]);

  const load = useCallback(
    async (loud = false) => {
      try {
        applyList(await http.get<TripList>('/trips', { driver: 'me', date: 'today', limit: 20 }));
        if (loud) toast.success('Trips updated');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not load today’s trips';
        setError(msg);
        if (loud) toast.error(msg);
      }
    },
    [applyList],
  );

  // Live refresh: assigned trips can activate/change server-side.
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

  const counts = (trips ?? []).reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  const countLine = (
    [
      ['scheduled', counts.scheduled],
      ['active', counts.active],
      ['completed', counts.completed],
    ] as const
  )
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([label, n]) => `${n} ${label}`)
    .join(' · ');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Driver Dashboard"
        subtitle="Today’s trips"
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
                className={cn('h-1.5 w-1.5 rounded-full', live ? 'animate-pulse bg-emerald-500' : 'bg-amber-500')}
              />
              {live ? 'Live' : 'Offline'}
            </Badge>
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={refresh} aria-label="Refresh trips">
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
          title="No trips assigned today"
          body="Trips assigned to you by the school will appear here each morning."
        />
      ) : (
        <>
          {countLine && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {countLine}
            </p>
          )}
          <ul className="space-y-3">
            {trips.map((t) => (
              <li key={t.id}>
                <div className="nu-raised flex flex-wrap items-center gap-3 rounded-2xl bg-card p-4 sm:flex-nowrap sm:gap-4">
                  <span
                        className={cn(
                          'grid h-11 w-11 shrink-0 place-items-center rounded-xl',
                          t.type === 'pickup'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
                        )}
                  >
                    {t.type === 'pickup' ? (
                      <Sunrise className="h-5 w-5" aria-hidden />
                    ) : (
                      <Sunset className="h-5 w-5" aria-hidden />
                    )}
                  </span>

                  <div className="min-w-0 flex-1 basis-48">
                    <p className="font-semibold">{TRIP_TYPE_LABEL[t.type]}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                      <RouteIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">
                        {t.route?.name ?? 'Unassigned route'}
                        {t.bus?.number ? ` · Bus ${t.bus.number}` : ''}
                        {t.bus?.plate ? ` (${t.bus.plate})` : ''}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <p className="inline-flex items-center gap-1 text-sm font-medium tabular-nums">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      {formatTime(t.scheduledStart)}
                    </p>
                    <StatusBadge status={t.status} />
                  </div>

                  <Button asChild className="h-11">
                    <Link href={`/driver/trips/${t.id}`}>
                      Open
                      <ChevronRight className="h-4 w-4" aria-hidden />
                      <span className="sr-only">
                        — {TRIP_TYPE_LABEL[t.type]}
                        {t.route?.name ? ` on ${t.route.name}` : ''}
                      </span>
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
