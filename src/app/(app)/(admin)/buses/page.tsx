'use client';

import * as React from 'react';
import { ResourceTable, type Col, type FieldDef } from '@/components/admin/resource-table';
import { useResource, type Row } from '@/features/admin/use-resource';

type BusRow = Row & {
  number?: string;
  plate?: string;
  capacity?: number;
  status?: string;
  driverId?: string | null;
  driver?: { name?: string } | null;
  routeId?: string | null;
  route?: { name?: string } | null;
};

const fields: FieldDef<BusRow>[] = [
  { key: 'number', label: 'Bus number', type: 'text', required: true, placeholder: 'e.g. B-101' },
  { key: 'plate', label: 'Plate', type: 'text', required: true, placeholder: 'e.g. TX-4471' },
  { key: 'driverId', label: 'Driver', type: 'ref', refPath: '/users?role=driver' },
  { key: 'routeId', label: 'Route', type: 'ref', refPath: '/routes' },
  { key: 'capacity', label: 'Capacity', type: 'number' },
  { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive', 'maintenance'] },
];

export default function BusesPage() {
  const res = useResource<BusRow>('/buses');

  const cols = React.useMemo<Col<BusRow>[]>(
    () => [
      { key: 'number', label: 'Number', render: (r) => <span className="font-semibold">{r.number ?? '—'}</span> },
      { key: 'plate', label: 'Plate' },
      { key: 'driver', label: 'Driver', render: (r) => r.driver?.name ?? '—' },
      { key: 'route', label: 'Route', render: (r) => r.route?.name ?? '—' },
      { key: 'capacity', label: 'Capacity' },
      { key: 'status', label: 'Status', badge: true },
    ],
    [],
  );

  return (
    <ResourceTable
      title="Buses"
      subtitle="Fleet vehicles, assignments and state"
      res={res}
      cols={cols}
      fields={fields}
      canWrite
      emptyTitle="No buses yet"
      emptyBody="Register a bus and assign a driver and route."
    />
  );
}
