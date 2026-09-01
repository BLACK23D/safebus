'use client';

import * as React from 'react';
import Link from 'next/link';
import { ResourceTable, type Col, type FieldDef } from '@/components/admin/resource-table';
import { idOf, useResource, type Row } from '@/features/admin/use-resource';

type TripRow = Row & {
  type?: string;
  status?: string;
  routeId?: string | null;
  route?: { name?: string } | null;
  busId?: string | null;
  bus?: { number?: string } | null;
  driverId?: string | null;
  driver?: { name?: string } | null;
  scheduledStart?: string;
  scheduledEnd?: string;
};

function fmtDateTime(v?: string): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const fields: FieldDef<TripRow>[] = [
  { key: 'type', label: 'Type', type: 'select', options: ['pickup', 'dropoff'], required: true },
  { key: 'routeId', label: 'Route', type: 'ref', refPath: '/routes', required: true },
  { key: 'busId', label: 'Bus', type: 'ref', refPath: '/buses', labelKey: 'number', required: true },
  { key: 'driverId', label: 'Driver', type: 'ref', refPath: '/users?role=driver', required: true },
  { key: 'scheduledStart', label: 'Scheduled start', type: 'datetime-local' },
  { key: 'scheduledEnd', label: 'Scheduled end', type: 'datetime-local' },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: ['scheduled', 'active', 'completed', 'cancelled'],
    hint: 'Lifecycle is driven by start/end/cancel actions',
  },
];

export default function TripsPage() {
  const res = useResource<TripRow>('/trips');

  const cols = React.useMemo<Col<TripRow>[]>(
    () => [
      {
        key: 'type',
        label: 'Type',
        render: (r) => (
          <span className="capitalize">
            {r.type ? r.type.charAt(0).toUpperCase() + r.type.slice(1) : '—'}
          </span>
        ),
      },
      {
        key: 'route',
        label: 'Route',
        render: (r) =>
          r.routeId ? (
            <Link
              href={`/routes/${r.routeId}`}
              className="font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              {r.route?.name ?? 'View route'}
            </Link>
          ) : (
            (r.route?.name ?? '—')
          ),
      },
      { key: 'bus', label: 'Bus', render: (r) => r.bus?.number ?? '—' },
      { key: 'driver', label: 'Driver', render: (r) => r.driver?.name ?? '—' },
      { key: 'scheduledStart', label: 'Scheduled start', render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.scheduledStart)}</span> },
      { key: 'status', label: 'Status', badge: true },
    ],
    [],
  );

  return (
    <ResourceTable
      title="Trips"
      subtitle="Scheduled runs and lifecycle state"
      res={res}
      cols={cols}
      fields={fields}
      canWrite
      emptyTitle="No trips yet"
      emptyBody="Schedule pickup or drop-off runs for a bus, route and driver."
    />
  );
}
