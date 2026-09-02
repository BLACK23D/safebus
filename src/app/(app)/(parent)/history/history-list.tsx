'use client';

/**
 * Parent history list — shared pager for trip history and route history.
 * `GET /${kind}?page=${page}&limit=10` → { items, total, page, pages } (§0/§5/§6).
 * Route rows deep-link into the role-aware route detail page (/routes/:id).
 */

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ArrowRight, Clock, History, Route as RouteIcon, Sunrise, Sunset } from 'lucide-react';
import Link from 'next/link';

import { http } from '@/lib/api/client';
import { EmptyState, ErrorState, PageHeader, PageSkeleton, StatusBadge } from '@/components/ui/kit';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TRIP_TYPE_LABEL } from '@/features/trips/shared';

export type HistoryKind = 'trips' | 'routes';

type TripRow = {
  id: string;
  type?: 'pickup' | 'dropoff';
  route?: { id?: string; name?: string } | null;
  scheduledStart?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  status?: string;
};

type RouteRow = {
  id: string;
  name: string;
  createdAt?: string | null;
  stopIds?: string[];
};

type ListEnvelope<T> = { items: T[]; total: number; page: number; pages: number };

const PAGE_SIZE = 10;

function day(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'MMM d, yyyy');
}

export function HistoryList({ kind }: { kind: HistoryKind }) {
  const [page, setPage] = useState(1);
  const [trips, setTrips] = useState<ListEnvelope<TripRow> | null>(null);
  const [routes, setRoutes] = useState<ListEnvelope<RouteRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Initial + page fetches — setState flows through promise callbacks only.
  useEffect(() => {
    let alive = true;
    if (kind === 'trips') {
      http
        .get<ListEnvelope<TripRow>>(`/trips`, { page, limit: PAGE_SIZE })
        .then((d) => {
          if (alive) {
            setTrips(d);
            setError(null);
          }
        })
        .catch((err) => {
          if (alive) setError(err instanceof Error ? err.message : 'Could not load trip history');
        });
    } else {
      http
        .get<ListEnvelope<RouteRow>>(`/routes`, { page, limit: PAGE_SIZE })
        .then((d) => {
          if (alive) {
            setRoutes(d);
            setError(null);
          }
        })
        .catch((err) => {
          if (alive) setError(err instanceof Error ? err.message : 'Could not load route history');
        });
    }
    return () => {
      alive = false;
    };
  }, [kind, page, reloadKey]);

  const retry = useCallback(() => {
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  const isTrips = kind === 'trips';
  const data = isTrips ? trips : routes;
  const pages = data?.pages ?? 0;

  const goPage = (next: number) => {
    setPage(Math.min(Math.max(1, next), Math.max(1, pages)));
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={isTrips ? 'Trip history' : 'Route history'}
        subtitle={isTrips ? 'Past pickups and drop-offs' : 'Routes assigned to your children'}
      />

      {error !== null ? (
        <ErrorState message={error} retry={retry} />
      ) : data === null ? (
        <PageSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={isTrips ? History : RouteIcon}
          title={isTrips ? 'No trips yet' : 'No routes yet'}
          body={
            isTrips
              ? 'Completed and cancelled trips will appear here after they run.'
              : 'Routes assigned to your children by the school will appear here.'
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {isTrips
              ? (trips?.items ?? []).map((t) => (
                  <li key={t.id}>
                    <div className="nu-raised flex flex-wrap items-center gap-3 rounded-2xl bg-card p-4 sm:flex-nowrap sm:gap-4">
                      <span
                        aria-hidden
                        className={cn(
                          'grid h-11 w-11 shrink-0 place-items-center rounded-xl',
                          t.type === 'dropoff'
                            ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                        )}
                      >
                        {t.type === 'dropoff' ? <Sunset className="h-5 w-5" /> : <Sunrise className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="font-semibold">{TRIP_TYPE_LABEL[t.type ?? 'pickup']}</p>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">{t.route?.name ?? 'Unassigned route'}</p>
                      </div>
                      <p className="inline-flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
                        <Clock className="h-3.5 w-3.5" aria-hidden />
                        {day(t.scheduledStart ?? t.startedAt)}
                      </p>
                      <StatusBadge status={t.status} />
                    </div>
                  </li>
                ))
              : (routes?.items ?? []).map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/routes/${r.id}`}
                      className="nu-raised flex min-h-11 flex-wrap items-center gap-3 rounded-2xl bg-card p-4 transition-colors hover:bg-accent sm:flex-nowrap sm:gap-4"
                      aria-label={`Open route ${r.name}`}
                    >
                      <span
                        aria-hidden
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400"
                      >
                        <RouteIcon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="truncate font-semibold">{r.name}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {day(r.createdAt)}
                          {Array.isArray(r.stopIds) && r.stopIds.length > 0 ? ` · ${r.stopIds.length} stops` : ''}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
          </ul>

          <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => goPage(page - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              Previous
            </Button>
            <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
              Page {page} of {Math.max(1, pages)}
            </p>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => goPage(page + 1)}
              disabled={page >= pages}
              aria-label="Next page"
            >
              Next
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}
