'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { ListOrdered, MapPin } from 'lucide-react';
import Link from 'next/link';
import { http } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ResourceTable, type Col, type FieldDef } from '@/components/admin/resource-table';
import { idOf, useResource, type Row } from '@/features/admin/use-resource';

type StopRow = Row & {
  name?: string;
  sequence?: number;
  location?: { coordinates?: number[] } | null;
};

type RouteRow = Row & {
  name?: string;
  status?: string;
  stopIds?: string[];
  stops?: StopRow[] | null;
};

const fields: FieldDef<RouteRow>[] = [
  { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Route A' },
  { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'] },
];

/**
 * Ordered stop sequencing is preserved by the backend via the route-update
 * `stopIds` array (contract §5). v1 keeps stops read-only here — the dialog
 * lists them in order; sequencing edits remain a backend/API concern for now.
 */
export default function RoutesPage() {
  const res = useResource<RouteRow>('/routes');

  const [stopsFor, setStopsFor] = React.useState<RouteRow | null>(null);
  const [stopsLoading, setStopsLoading] = React.useState(false);

  async function openStops(row: RouteRow) {
    setStopsFor(row);
    if (row.stops && row.stops.length > 0) return;
    setStopsLoading(true);
    try {
      const detail = await http.get<RouteRow>(`/routes/${idOf(row)}`);
      setStopsFor(detail);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load stops');
      setStopsFor(null);
    } finally {
      setStopsLoading(false);
    }
  }

  const cols = React.useMemo<Col<RouteRow>[]>(
    () => [
      {
        key: 'name',
        label: 'Name',
        render: (r) => (
          <Link
            href={`/routes/${idOf(r)}`}
            className="font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            {r.name ?? '—'}
          </Link>
        ),
      },
      {
        key: 'stops',
        label: 'Stops',
        render: (r) => <span className="tabular-nums">{r.stops?.length ?? r.stopIds?.length ?? 0}</span>,
      },
      { key: 'status', label: 'Status', badge: true },
    ],
    [],
  );

  const rowActions = (row: RouteRow) => (
    <Button
      variant="ghost"
      size="icon"
      className="h-11 w-11"
      aria-label={`View ordered stops of ${row.name ?? 'route'}`}
      onClick={() => void openStops(row)}
    >
      <ListOrdered className="h-4 w-4" />
    </Button>
  );

  const stops = stopsFor?.stops ?? [];

  return (
    <>
      <ResourceTable
        title="Routes"
        subtitle="Ordered stop sequences per school"
        res={res}
        cols={cols}
        fields={fields}
        canWrite
        rowActions={rowActions}
        emptyTitle="No routes yet"
        emptyBody="Create routes and attach ordered stops."
      />

      <Dialog open={Boolean(stopsFor)} onOpenChange={(o) => !o && !stopsLoading && setStopsFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Stops — {stopsFor?.name ?? 'Route'}</DialogTitle>
            <DialogDescription>
              Ordered pickup sequence (read-only in v1; sequencing is preserved by the backend&apos;s stopIds array).
            </DialogDescription>
          </DialogHeader>
          {stopsLoading ? (
            <div className="space-y-2" aria-busy="true" aria-label="Loading stops">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : stops.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No stops attached to this route yet.
            </p>
          ) : (
            <ol className="max-h-96 space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
              {stops.map((s, i) => (
                <li key={idOf(s)} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-sm">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500/10 text-xs font-bold text-brand-600 dark:text-brand-400">
                    {i + 1}
                  </span>
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{s.name ?? 'Stop'}</span>
                  <span className="text-xs text-muted-foreground">
                    {(s.location?.coordinates ?? []).map((c) => c.toFixed(4)).join(', ')}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
