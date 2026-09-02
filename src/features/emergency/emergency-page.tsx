'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CarFront,
  CheckCircle2,
  HeartPulse,
  Loader2,
  Phone,
  Plus,
  ShieldAlert,
  Siren,
  TriangleAlert,
  UserRoundX,
} from 'lucide-react';
import { toast } from 'sonner';
import { http } from '@/lib/api/client';
import { SE } from '@/lib/socket/events';
import { useSocketEvent } from '@/components/providers/socket-provider';
import type { AppSession, Role } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState, ErrorState, PageHeader, PageSkeleton, StatusBadge } from '@/components/ui/kit';

type EmergencyType = 'medical' | 'accident' | 'behavior' | 'other';
type EmergencyStatus = 'active' | 'resolved' | 'cancelled';

type Emergency = {
  id: string;
  type: EmergencyType;
  status: EmergencyStatus;
  note?: string;
  studentId?: string | null;
  student?: { id: string; name: string; grade?: string };
  createdById: string;
  createdBy?: { id: string; name: string; role: Role };
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
};

type EmergencyContact = { name: string; role: string; phone: string };

/** Envelope-tolerant list unwrap (contract §0) — same helper the profile page uses. */
function listOf<T>(d: unknown): T[] {
  if (Array.isArray(d)) return d as T[];
  const j = d as { items?: T[]; results?: T[] } | null;
  return j?.items ?? j?.results ?? [];
}

const TYPE_META: Record<EmergencyType, { label: string; icon: typeof Siren }> = {
  medical: { label: 'Medical', icon: HeartPulse },
  accident: { label: 'Accident', icon: CarFront },
  behavior: { label: 'Behavior', icon: UserRoundX },
  other: { label: 'Other', icon: TriangleAlert },
};

function when(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function EmergencyPage({ session }: { session: AppSession }) {
  const [items, setItems] = useState<Emergency[] | null>(null);
  const [contacts, setContacts] = useState<EmergencyContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const isParent = session.role === 'parent';
  const isAdmin = session.role === 'admin' || session.role === 'superadmin';

  const load = useCallback(async () => {
    try {
      const rows = await http.get<Emergency[]>('/emergency');
      setItems(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load emergency alerts');
    }
  }, []);

  useEffect(() => {
    // Initial fetch deferred to a timer callback (no synchronous setState from the effect body).
    const t = setTimeout(() => void load(), 0);
    let alive = true;
    http
      .get<{ items: EmergencyContact[] }>('/emergency/contacts')
      .then((d) => alive && setContacts(d.items ?? []))
      .catch(() => alive && setContacts([]));
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [load]);

  // Live: new alert prepends (deduped) with a danger toast.
  useSocketEvent(
    SE.EMERGENCY_NEW,
    (payload) => {
      const p = payload as Emergency;
      if (!p || typeof p.id !== 'string') return;
      setItems((prev) => {
        if (!prev) return prev;
        if (prev.some((x) => x.id === p.id)) return prev;
        return [{ ...p, student: undefined }, ...prev];
      });
      toast.error('New emergency alert', {
        description: `${TYPE_META[p.type]?.label ?? 'Emergency'} — reported by ${p.createdBy?.name ?? 'a user'}.`,
      });
    },
    [load],
  );

  // Live: status patches.
  useSocketEvent(
    SE.EMERGENCY_UPDATE,
    (payload) => {
      const p = payload as { id?: string; status?: EmergencyStatus; resolvedAt?: string; resolvedBy?: string };
      if (!p?.id || !p.status) return;
      setItems((prev) =>
        prev
          ? prev.map((x) =>
              x.id === p.id ? { ...x, status: p.status!, resolvedAt: p.resolvedAt, resolvedBy: p.resolvedBy } : x,
            )
          : prev,
      );
    },
    [load],
  );

  const patchStatus = useCallback(
    async (id: string, status: 'resolved' | 'cancelled') => {
      try {
        await http.patch(`/emergency/${id}`, { status });
        setItems((prev) =>
          prev
            ? prev.map((x) =>
                x.id === id ? { ...x, status, resolvedAt: new Date().toISOString(), resolvedBy: session.id } : x,
              )
            : prev,
        );
        toast.success(status === 'resolved' ? 'Emergency resolved' : 'Emergency cancelled');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not update the alert');
      }
    },
    [session.id],
  );

  return (
    <div>
      <PageHeader
        title="Emergency"
        subtitle="Safety alerts for your school — everyone sees the same live picture."
        actions={
          isParent ? (
            <Button
              onClick={() => setReportOpen(true)}
              className="min-h-12 bg-rose-600 px-5 text-white hover:bg-rose-700"
            >
              <Siren className="h-5 w-5" /> Report emergency
            </Button>
          ) : undefined
        }
      />

      <Alert className="mb-4 border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>
          Emergency actions always require a live connection — they are never queued offline.
        </AlertDescription>
      </Alert>

      {error ? (
        <ErrorState message={error} retry={() => void load()} />
        ) : items === null ? (
        <PageSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Siren}
          title="No emergency alerts"
          body={
            isParent
              ? 'Nothing to worry about. If something happens, use Report emergency — administrators and drivers are alerted instantly.'
              : 'No alerts have been raised for your school. Active reports appear here the moment they happen.'
          }
        />
      ) : (
        <ul className="space-y-3" aria-label="Emergency alerts">
          {items.map((e) => {
            const Icon = TYPE_META[e.type]?.icon ?? TriangleAlert;
            const active = e.status === 'active';
            return (
              <li
                key={e.id}
                className={cn(
                  'nu-raised rounded-2xl border bg-card p-4 md:p-5',
                  active && 'border-rose-300 dark:border-rose-900/60',
                )}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      'grid h-11 w-11 shrink-0 place-items-center rounded-xl',
                      active
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        : 'bg-slate-500/10 text-slate-500 dark:text-slate-400',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{TYPE_META[e.type]?.label ?? e.type}</p>
                      <StatusBadge
                        status={e.status}
                        className={
                          e.status === 'active'
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                            : undefined
                        }
                      />
                      {active && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                          <span className="status-light text-rose-500" aria-hidden /> live
                        </span>
                      )}
                    </div>
                    {e.note && <p className="mt-1 text-sm text-muted-foreground">{e.note}</p>}
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Reported by {e.createdBy?.name ?? 'unknown'}</span>
                      {e.student?.name && <span>· Student: {e.student.name}</span>}
                      <span>· {when(e.createdAt)}</span>
                      {e.resolvedAt && (
                        <span className="inline-flex items-center gap-1">
                          · <CheckCircle2 className="h-3 w-3" /> {when(e.resolvedAt)}
                        </span>
                      )}
                    </p>
                  </div>
                  {isAdmin && active && (
                    <div className="flex w-full gap-2 sm:w-auto">
                      <ResolveDialog emergency={e} onDone={patchStatus} action="resolve" />
                      <ResolveDialog emergency={e} onDone={patchStatus} action="cancel" />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Emergency contacts */}
      <section aria-label="Emergency contacts" className="mt-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Emergency contacts
        </h2>
        {contacts === null ? (
          <div className="grid place-items-center rounded-2xl border bg-card py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading contacts" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-6 text-center text-sm text-muted-foreground">
            No emergency contacts published for your school yet.
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {contacts.map((c) => (
              <li key={`${c.name}-${c.phone}`} className="nu-raised rounded-2xl border bg-card p-4">
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs capitalize text-muted-foreground">{c.role}</p>
                <a
                  href={`tel:${c.phone}`}
                  className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  <Phone className="h-4 w-4" /> {c.phone}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isParent && (
        <ReportDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          onCreated={(created) =>
            setItems((prev) => (prev?.some((x) => x.id === created.id) ? prev : [created, ...(prev ?? [])]))
          }
        />
      )}
    </div>
  );
}

function ResolveDialog({
  emergency,
  action,
  onDone,
}: {
  emergency: Emergency;
  action: 'resolve' | 'cancel';
  onDone: (id: string, status: 'resolved' | 'cancelled') => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const resolve = action === 'resolve';
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        variant={resolve ? 'default' : 'outline'}
        onClick={() => setOpen(true)}
        className={cn('min-h-10 flex-1', resolve ? 'bg-emerald-700 hover:bg-emerald-800' : undefined)}
      >
        <CheckCircle2 className="h-4 w-4" /> {resolve ? 'Resolve' : 'Cancel alert'}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {resolve ? 'Resolve this emergency alert?' : 'Cancel this emergency alert?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {resolve
              ? 'The alert will be marked resolved for everyone. Use this when the situation is under control.'
              : 'The alert will be marked cancelled for everyone. Use this if the report was raised in error.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-10">Keep open</AlertDialogCancel>
          <AlertDialogAction
            className={cn('min-h-10', resolve ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-slate-600 hover:bg-slate-700')}
            disabled={busy}
            onClick={async (ev) => {
              ev.preventDefault();
              setBusy(true);
              await onDone(emergency.id, resolve ? 'resolved' : 'cancelled');
              setBusy(false);
              setOpen(false);
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {resolve ? 'Mark resolved' : 'Mark cancelled'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReportDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (e: Emergency) => void;
}) {
  const [type, setType] = useState<EmergencyType | ''>('');
  const [studentId, setStudentId] = useState<string>('none');
  const [note, setNote] = useState('');
  const [children, setChildren] = useState<{ id: string; name: string; grade?: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  // Load linked children when the dialog opens (optional student attribution).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    http
      .get<unknown>('/students', { parent: 'me' })
      .then((rows) => alive && setChildren(listOf<{ id: string; name: string; grade?: string }>(rows)))
      .catch(() => alive && setChildren([]));
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setType('');
        setStudentId('none');
        setNote('');
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const submit = async () => {
    if (!type || busy) return;
    setBusy(true);
    try {
      const created = await http.post<Emergency>('/emergency', {
        type,
        note: note.trim() || undefined,
        studentId: studentId !== 'none' ? studentId : undefined,
      });
      onCreated(created);
      toast.success('Emergency reported — contacts and administrators have been alerted.');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not submit the report');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
            <Siren className="h-5 w-5" /> Report an emergency
          </DialogTitle>
          <DialogDescription>
            School administrators and the driver on route are alerted immediately. Please include what
            happened and where.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="em-type">Type of emergency</Label>
            <Select value={type} onValueChange={(v) => setType(v as EmergencyType)}>
              <SelectTrigger id="em-type" className="min-h-11 w-full">
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_META) as EmergencyType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_META[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="em-student">Student (optional)</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger id="em-student" className="min-h-11 w-full">
                <SelectValue placeholder={children === null ? 'Loading…' : 'Not student-specific'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not student-specific</SelectItem>
                {(children ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.grade ? ` (grade ${s.grade})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="em-note">What happened? (optional)</Label>
            <Textarea
              id="em-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe the situation, location and anything responders should know…"
              className="min-h-24"
            />
          </div>

          <Button
            onClick={() => void submit()}
            disabled={!type || busy}
            className="min-h-12 w-full bg-rose-600 text-base font-semibold text-white hover:bg-rose-700"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            Submit emergency report
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Requires a live connection — reports are sent immediately, never queued.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
