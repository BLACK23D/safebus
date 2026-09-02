'use client';

import * as React from 'react';
import Link from 'next/link';
import { http } from '@/lib/api/client';
import { ResourceTable, type Col, type FieldDef } from '@/components/admin/resource-table';
import { idOf, useResource, type Row } from '@/features/admin/use-resource';

type StudentRow = Row & {
  name?: string;
  grade?: string;
  studentCode?: string;
  parentId?: string | null;
  busId?: string | null;
  routeId?: string | null;
  stopId?: string | null;
  status?: string;
  parent?: { name?: string } | null;
  bus?: { number?: string } | null;
};

type ParentRow = Row & { name?: string; email?: string };
type BusRow = Row & { number?: string };

const fields: FieldDef<StudentRow>[] = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'grade', label: 'Grade', type: 'text', placeholder: 'e.g. 3', hint: 'Single number' },
  { key: 'studentCode', label: 'Student code', type: 'text' },
  { key: 'parentId', label: 'Parent', type: 'ref', refPath: '/users?role=parent' },
  { key: 'busId', label: 'Bus', type: 'ref', refPath: '/buses', labelKey: 'number' },
  { key: 'routeId', label: 'Route', type: 'ref', refPath: '/routes' },
  { key: 'stopId', label: 'Stop', type: 'ref', refPath: '/stops' },
  { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'] },
];

export default function StudentsPage() {
  const res = useResource<StudentRow>('/students');

  // The students list endpoint is not populated (contract §4) — enrich parent/bus
  // names client-side with two scoped lookups so the columns stay useful.
  const [parentNames, setParentNames] = React.useState<Record<string, string>>({});
  const [busNumbers, setBusNumbers] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const [p, b] = await Promise.allSettled([
        http.get<{ items?: ParentRow[] }>('/users', { role: 'parent', limit: 100 }),
        http.get<{ items?: BusRow[] }>('/buses', { limit: 100 }),
      ]);
      if (!alive) return;
      if (p.status === 'fulfilled') {
        const map: Record<string, string> = {};
        for (const u of p.value.items ?? []) map[idOf(u)] = u.name ?? u.email ?? '';
        setParentNames(map);
      }
      if (b.status === 'fulfilled') {
        const map: Record<string, string> = {};
        for (const x of b.value.items ?? []) map[idOf(x)] = x.number ?? '';
        setBusNumbers(map);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const cols = React.useMemo<Col<StudentRow>[]>(
    () => [
      {
        key: 'name',
        label: 'Name',
        render: (r) => (
          <Link
            href={`/students/${idOf(r)}`}
            className="font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            {r.name ?? '—'}
          </Link>
        ),
      },
      { key: 'grade', label: 'Grade' },
      { key: 'parent', label: 'Parent', render: (r) => r.parent?.name ?? parentNames[r.parentId ?? ''] ?? '—' },
      { key: 'bus', label: 'Bus', render: (r) => r.bus?.number ?? busNumbers[r.busId ?? ''] ?? '—' },
      { key: 'status', label: 'Status', badge: true },
    ],
    [parentNames, busNumbers],
  );

  return (
    <ResourceTable
      title="Students"
      subtitle="Enrolled riders and their assignments"
      res={res}
      cols={cols}
      fields={fields}
      canWrite
      emptyTitle="No students yet"
      emptyBody="Add students and link them to a parent, bus, route and stop."
    />
  );
}
