'use client';

import * as React from 'react';
import { ResourceTable, type Col, type FieldDef } from '@/components/admin/resource-table';
import { useResource, type Row } from '@/features/admin/use-resource';

type StopRow = Row & {
  name?: string;
  sequence?: number;
  location?: { type?: string; coordinates?: number[] } | null;
  status?: string;
};

const fields: FieldDef<StopRow>[] = [
  { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Maple & 5th' },
  { key: 'latitude', label: 'Latitude', type: 'number', required: true, valueFrom: (r) => r.location?.coordinates?.[1] ?? '' },
  { key: 'longitude', label: 'Longitude', type: 'number', required: true, valueFrom: (r) => r.location?.coordinates?.[0] ?? '' },
  { key: 'sequence', label: 'Sequence', type: 'number' },
  { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'] },
];

export default function StopsPage() {
  const res = useResource<StopRow>('/stops');

  const cols = React.useMemo<Col<StopRow>[]>(
    () => [
      { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name ?? '—'}</span> },
      { key: 'sequence', label: 'Sequence' },
      {
        key: 'location.coordinates',
        label: 'Coordinates',
        render: (r) => {
          const c = r.location?.coordinates;
          return Array.isArray(c) && c.length >= 2 ? (
            <span className="tabular-nums">{`${c[0].toFixed(5)}, ${c[1].toFixed(5)}`}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      { key: 'status', label: 'Status', badge: true },
    ],
    [],
  );

  return (
    <ResourceTable
      title="Stops"
      subtitle="Geocoded pickup and drop-off points"
      res={res}
      cols={cols}
      fields={fields}
      canWrite
      emptyTitle="No stops yet"
      emptyBody="Create stops with a name and coordinates."
    />
  );
}
