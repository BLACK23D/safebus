'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { http } from '@/lib/api/client';
import { SE } from '@/lib/socket/events';
import { useSocketEvent } from '@/components/providers/socket-provider';
import type { AppSession } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { TRIP_TYPE_SHORT, type TripType } from '@/features/trips/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, PageHeader, PageSkeleton, StatusBadge } from '@/components/ui/kit';

type AttendanceStatus = 'pending' | 'picked_up' | 'dropped_off' | 'absent' | 'returned_to_school';

type AttendanceRow = {
  id: string;
  tripId?: string;
  studentId: string;
  student?: { id: string; name: string; grade?: string };
  stopName?: string;
  date: string;
  type: 'pickup' | 'dropoff';
  status: AttendanceStatus;
  verified: boolean;
};

type AttendancePage = { items: AttendanceRow[]; total: number; page: number; pages: number };

type CodeInfo = { attendanceId: string; code: string; type: string; until: string };

const LIMIT = 30;
/** student:status values that mirror an attendance status (contract §7). */
const ATTENDANCE_STATUSES: ReadonlySet<string> = new Set([
  'picked_up',
  'dropped_off',
  'absent',
  'returned_to_school',
]);

export function AttendanceClient({ session }: { session: AppSession }) {
  const [data, setData] = useState<AttendancePage | null>(null);
  const [page, setPage] = useState(1);
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<CodeInfo | null>(null);
  const [left, setLeft] = useState(0);
  const [codeBusy, setCodeBusy] = useState<string | null>(null);

  const isParent = session.role === 'parent';
  const isAdmin = session.role === 'admin' || session.role === 'superadmin';

  const load = useCallback(async (p: number, d: string) => {
    try {
      const res = await http.get<AttendancePage>('/attendance', {
        page: p,
        limit: LIMIT,
        date: d || undefined,
      });
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load attendance');
    }
  }, []);

  useEffect(() => {
    // Initial/param-driven fetch deferred to a timer callback (no synchronous setState in effects).
    const t = setTimeout(() => void load(page, date), 0);
    return () => clearTimeout(t);
  }, [load, page, date]);

  const patchRow = useCallback((attendanceId: string, patch: Partial<AttendanceRow>) => {
    setData((prev) =>
      prev
        ? { ...prev, items: prev.items.map((r) => (r.id === attendanceId ? { ...r, ...patch } : r)) }
        : prev,
    );
  }, []);

  // Live: authoritative attendance updates from verification / trip lifecycle.
  useSocketEvent(
    SE.ATTENDANCE_UPDATE,
    (payload) => {
      const p = payload as {
        attendanceId?: string;
        studentName?: string;
        status?: AttendanceStatus;
        verified?: boolean;
      };
      if (!p?.attendanceId) return;
      patchRow(p.attendanceId, {
        ...(p.status ? { status: p.status } : {}),
        ...(typeof p.verified === 'boolean' ? { verified: p.verified } : {}),
      });
    },
    [patchRow],
  );

  // Live: child-status mirror — patch matching rows when the payload carries an
  // attendance object, otherwise map the status onto rows of the same trip+student.
  useSocketEvent(
    SE.STUDENT_STATUS,
    (payload) => {
      const p = payload as {
        studentId?: string;
        status?: string;
        tripId?: string;
        attendance?: { attendanceId?: string; status?: AttendanceStatus; verified?: boolean };
      };
      if (!p?.studentId) return;
      if (p.attendance?.attendanceId) {
        patchRow(p.attendance.attendanceId, {
          ...(p.attendance.status ? { status: p.attendance.status } : {}),
          ...(typeof p.attendance.verified === 'boolean' ? { verified: p.attendance.verified } : {}),
        });
        return;
      }
      if (!p.status || !ATTENDANCE_STATUSES.has(p.status)) return;
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((r) =>
                r.studentId === p.studentId && (!p.tripId || r.tripId === p.tripId)
                  ? { ...r, status: p.status as AttendanceStatus }
                  : r,
              ),
            }
          : prev,
      );
    },
    [patchRow],
  );

  // Verification code reveal — one code visible at a time, 30 s auto-hide server TTL.
  const revealCode = useCallback(
    async (row: AttendanceRow) => {
      if (code?.attendanceId === row.id) {
        setCode(null);
        return;
      }
      setCodeBusy(row.id);
      try {
        const c = await http.get<{ code: string; type: string; until: string }>(`/attendance/${row.id}/code`);
        setCode({ attendanceId: row.id, code: c.code, type: c.type, until: c.until });
        setLeft(Math.max(0, Math.ceil((new Date(c.until).getTime() - Date.now()) / 1000)));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not load the code');
      } finally {
        setCodeBusy(null);
      }
    },
    [code?.attendanceId],
  );

  // Countdown ticker — state updates happen inside the interval callback only.
  useEffect(() => {
    if (!code) return;
    const iv = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((new Date(code.until).getTime() - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0) setCode(null);
    }, 500);
    return () => clearInterval(iv);
  }, [code]);

  const summary = useMemo(() => {
    const counts = new Map<AttendanceStatus, number>();
    let verified = 0;
    for (const r of data?.items ?? []) {
      counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
      if (r.verified) verified++;
    }
    return { counts, verified };
  }, [data?.items]);

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle={
          isParent
            ? 'Live boarding status for your children, with verification codes for the driver.'
            : isAdmin
              ? 'School-wide attendance — marking happens through driver verification and the trip lifecycle.'
              : 'Attendance for the trips you drive — verify students with their codes.'
        }
        actions={
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setPage(1);
                setDate(e.target.value);
              }}
              aria-label="Filter by date"
              className="min-h-11 w-40"
            />
            {date && (
              <Button
                variant="ghost"
                onClick={() => {
                  setDate('');
                  setPage(1);
                }}
                className="min-h-11"
              >
                All dates
              </Button>
            )}
          </div>
        }
      />

      {/* Admin read-only summary — no direct attendance PATCH endpoint exists (contract §7). */}
      {isAdmin && data && data.items.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 text-sm">
          <span className="font-semibold text-muted-foreground">Summary (this page):</span>
          {[...summary.counts.entries()].map(([s, n]) => (
            <StatusBadge key={s} status={s} />
          ))}
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" /> {summary.verified} verified · read-only view
          </span>
        </div>
      )}

      {error ? (
        <ErrorState message={error} retry={() => void load(page, date)} />
        ) : data === null ? (
        <PageSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No attendance records"
          body="Records appear here once trips start and students are verified on board."
        />
      ) : (
        <>
          <ul className="space-y-2" aria-label="Attendance records">
            {data.items.map((r) => {
              const codeShown = code?.attendanceId === r.id;
              return (
                <li key={r.id}>
                  <div className="nu-raised rounded-2xl border bg-card p-4">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{r.student?.name ?? 'Student'}</p>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide',
                              r.type === 'pickup'
                                ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                                : 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
                            )}
                          >
                            {TRIP_TYPE_SHORT[r.type as TripType] ?? r.type}
                          </span>
                          <StatusBadge status={r.status} />
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span>{r.date}</span>
                          {r.stopName && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {r.stopName}
                            </span>
                          )}
                          <span
                            className={cn(
                              'inline-flex items-center gap-1',
                              r.verified && 'text-emerald-700 dark:text-emerald-400',
                            )}
                          >
                            {r.verified ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                              </>
                            ) : (
                              'Awaiting verification'
                            )}
                          </span>
                        </p>
                      </div>

                      {isParent && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            onClick={() => void revealCode(r)}
                            disabled={codeBusy === r.id}
                            className="min-h-11"
                            aria-expanded={codeShown}
                            aria-label={codeShown ? `Hide code for ${r.student?.name ?? 'student'}` : `Show code for ${r.student?.name ?? 'student'}`}
                          >
                            {codeBusy === r.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : codeShown ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                            {codeShown ? 'Hide code' : 'Show code'}
                          </Button>
                        </div>
                      )}
                    </div>

                    {isParent && codeShown && code && (
                      <div
                        className="nu-inset mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-brand-500/[0.06] p-3"
                        role="status"
                        aria-live="polite"
                      >
                        <KeyRound className="h-5 w-5 text-brand-500" aria-hidden />
                        <span className="font-mono text-2xl font-bold tracking-[0.3em] tabular-nums">
                          {code.code}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {TRIP_TYPE_SHORT[code.type as TripType] ?? code.type} code · expires in {left}s
                        </span>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {data.pages > 1 && (
            <nav aria-label="Attendance pages" className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                className="min-h-10"
                disabled={data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                Page {data.page} of {data.pages} · {data.total} record{data.total === 1 ? '' : 's'}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="min-h-10"
                disabled={data.page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
