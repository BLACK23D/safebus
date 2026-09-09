import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getSession, serverApi } from '@/lib/api/server';
import { ErrorState, LinkButton, PageHeader, StatusBadge } from '@/components/ui/kit';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LiveMap } from '@/components/map/live-map';
import { MapPin } from 'lucide-react';
import type { AppSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Route Detail' };

type MapsConfig = { apiKey: string; provider?: 'google' | 'none' };

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

/**
 * Role-aware route detail (§5): parent if a linked child rides the route,
 * driver if assigned, admin+ school-scoped — the backend enforces it; the UI
 * adds a "Manage" entry for staff roles only.
 */
export default async function RouteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Parallel: session + route detail + maps config.
  const mapsPromise: Promise<MapsConfig | null> = serverApi<MapsConfig>('/config/maps').catch(() => null);

  let session: AppSession | null = null;
  let route: RouteDetail | null = null;
  let errorMessage: string | null = null;
  try {
    const [s, r] = await Promise.all([getSession(), serverApi<RouteDetail>(`/routes/${id}`)]);
    session = s;
    route = r;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not load this route.';
    if (/not found|\b404\b/i.test(msg)) notFound(); // unknown id → 404 page (§2)
    errorMessage = msg;
  }

  const maps = await mapsPromise;
  const apiKey = maps?.apiKey ?? '';

  if (route === null) {
    return (
      <div className="space-y-4">
        <ErrorState message={errorMessage ?? 'Could not load this route.'} />
        <div className="flex justify-center">
          <Button asChild variant="outline" className="h-11">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const stops = route.stops ?? [];
  const first = stops[0]?.location.coordinates;
  const center = first ? { lat: first[1], lng: first[0] } : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title={route.name}
        subtitle={`${stops.length} ${stops.length === 1 ? 'stop' : 'stops'} in travel order`}
        actions={
          <>
            <StatusBadge status={route.status} />
            {session && session.role !== 'parent' ? <LinkButton href="/routes">Manage</LinkButton> : null}
          </>
        }
      />

      <div className="overflow-hidden rounded-2xl border">
        <LiveMap
          apiKey={apiKey}
          center={center}
          stops={stops}
          height="h-[300px] md:h-[400px]"
          className="w-full"
          ariaLabel={`Map of route ${route.name} with all stops`}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden />
            Stops
          </CardTitle>
          <CardDescription>Ordered by travel sequence.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {stops.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
              No stops have been added to this route yet.
            </p>
          ) : (
            <ol className="max-h-96 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
              {stops.map((s, i) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border p-3"
                >
                  <span
                    aria-hidden
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-700 dark:text-brand-400"
                  >
                    {s.sequence ?? i + 1}
                  </span>
                  <span className="sr-only">Stop {s.sequence ?? i + 1}</span>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</p>
                  <Badge variant="secondary" className="tabular-nums">
                    Stop {s.sequence ?? i + 1}
                  </Badge>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
