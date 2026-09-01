'use client';

import * as React from 'react';
import { ResourceTable, type Col, type FieldDef } from '@/components/admin/resource-table';
import { useResource, type Row } from '@/features/admin/use-resource';

type SchoolRow = Row & {
  name?: string;
  address?: string;
  contactPhone?: string;
  status?: string;
};

const fields: FieldDef<SchoolRow>[] = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'address', label: 'Address', type: 'textarea' },
  { key: 'contactPhone', label: 'Contact phone', type: 'tel' },
  { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'] },
];

export function SchoolsClient() {
  const res = useResource<SchoolRow>('/schools');

  const cols = React.useMemo<Col<SchoolRow>[]>(
    () => [
      { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name ?? '—'}</span> },
      {
        key: 'address',
        label: 'Address',
        render: (r) => <span className="whitespace-normal">{r.address || '—'}</span>,
      },
      { key: 'status', label: 'Status', badge: true },
    ],
    [],
  );

  return (
    <ResourceTable
      title="Schools"
      subtitle="All schools on the platform (superadmin only)"
      res={res}
      cols={cols}
      fields={fields}
      canWrite
      emptyTitle="No schools yet"
      emptyBody="Create the first school to start onboarding users."
    />
  );
}
