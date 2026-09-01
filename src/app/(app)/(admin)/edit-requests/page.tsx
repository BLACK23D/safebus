'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { ArrowRight, Check, RefreshCw, X } from 'lucide-react';
import { http } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState, PageHeader, PageSkeleton, StatusBadge } from '@/components/ui/kit';
import { idOf } from '@/features/admin/use-resource';

type EditRequest = {
  id?: string;
  _id?: string;
  studentId?: string;
  studentName?: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  status?: string;
  requestedByName?: string;
  createdAt?: string;
  decidedAt?: string;
};

function fmtDateTime(v?: string): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ChangeCell({ r }: { r: EditRequest }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">{r.oldValue ?? '—'}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      <strong>{r.newValue ?? '—'}</strong>
    </span>
  );
}

export default function EditRequestsPage() {
  const [status, setStatus] = React.useState('pending');
  const [rows, setRows] = React.useState<EditRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  // GET /edit-requests returns a RAW array (contract §11) — normalize defensively.
  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const d = await http.get<EditRequest[] | { items?: EditRequest[] }>('/edit-requests', {
          limit: 50,
          ...(status === 'all' ? {} : { status }),
        });
        if (!alive) return;
        setRows(Array.isArray(d) ? d : (d.items ?? []));
        setError(null);
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setError(e instanceof Error ? e.message : 'Failed to load edit requests');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [status, reloadKey]);

  async function decide(id: string, action: 'approve' | 'reject') {
    if (busyId) return;
    setBusyId(id);
    try {
      await http.patch(`/edit-requests/${id}`, { action });
      toast.success(action === 'approve' ? 'Request approved' : 'Request rejected');
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  const emptyCopy: Record<string, { title: string; body: string }> = {
    pending: { title: 'No pending requests', body: 'Parent-submitted profile changes will appear here for review.' },
    approved: { title: 'No approved requests', body: 'Approved profile changes will appear here.' },
    rejected: { title: 'No rejected requests', body: 'Rejected profile changes will appear here.' },
    all: { title: 'No edit requests yet', body: 'Parent-submitted profile changes will appear here.' },
  };

  const actions = (r: EditRequest, stacked = false) =>
    r.status === 'pending' ? (
      <div className={cn('flex items-center gap-2', stacked && 'pt-1')}>
        <Button
          size="sm"
          className="min-h-11 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={busyId === idOf(r)}
          onClick={() => void decide(idOf(r), 'approve')}
          aria-label={`Approve request for ${r.studentName ?? 'student'}`}
        >
          <Check className="h-4 w-4" /> Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11 gap-1.5"
          disabled={busyId === idOf(r)}
          onClick={() => void decide(idOf(r), 'reject')}
          aria-label={`Reject request for ${r.studentName ?? 'student'}`}
        >
          <X className="h-4 w-4" /> Reject
        </Button>
      </div>
    ) : (
      <StatusBadge status={r.status} />
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Edit Requests"
        subtitle="Review parent-submitted child profile changes"
        actions={
          <Button
            variant="outline"
            className="min-h-11 gap-2"
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={loading}
            aria-label="Refresh edit requests"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
          </Button>
        }
      />

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList className="h-11">
          <TabsTrigger value="pending" className="min-h-9">Pending</TabsTrigger>
          <TabsTrigger value="approved" className="min-h-9">Approved</TabsTrigger>
          <TabsTrigger value="rejected" className="min-h-9">Rejected</TabsTrigger>
          <TabsTrigger value="all" className="min-h-9">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? (
        <ErrorState message={error} retry={() => setReloadKey((k) => k + 1)} />
      ) : loading && rows.length === 0 ? (
        <PageSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState title={emptyCopy[status]?.title ?? 'No requests'} body={emptyCopy[status]?.body} />
      ) : (
        <>
          {/* Desktop — dense table */}
          <div
            className={cn('hidden overflow-x-auto rounded-2xl border bg-card md:block', loading && 'pointer-events-none opacity-60')}
            aria-busy={loading}
          >
            <Table>
              <TableCaption className="sr-only">Edit requests</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-px text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={idOf(r)}>
                    <TableCell className="font-medium">{r.studentName ?? '—'}</TableCell>
                    <TableCell className="capitalize">{r.field ?? '—'}</TableCell>
                    <TableCell>
                      <ChangeCell r={r} />
                    </TableCell>
                    <TableCell>{r.requestedByName ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-right">{actions(r)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile — stacked cards */}
          <div className={cn('space-y-3 md:hidden', loading && 'pointer-events-none opacity-60')}>
            {rows.map((r) => (
              <div key={idOf(r)} className="rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{r.studentName ?? '—'}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-2 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Field</span>
                    <span className="font-medium capitalize">{r.field ?? '—'}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Change</span>
                    <ChangeCell r={r} />
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Requested by</span>
                    <span className="font-medium">{r.requestedByName ?? '—'}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Date</span>
                    <span className="font-medium">{fmtDateTime(r.createdAt)}</span>
                  </div>
                </div>
                {r.status === 'pending' && <div className="mt-3 border-t pt-3">{actions(r, true)}</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
