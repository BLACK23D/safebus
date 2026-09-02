import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bus, MapPin, Route as RouteIcon, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import { listOf, serverApi } from '@/lib/api/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, StatusBadge } from '@/components/ui/kit';

export const metadata: Metadata = { title: 'Student — SafeBus' };

type StudentDetail = {
  id?: string;
  _id?: string;
  name?: string;
  grade?: string;
  studentCode?: string;
  status?: string;
  parentId?: string | null;
  parent?: { id?: string; name?: string; email?: string; phone?: string } | null;
  busId?: string | null;
  bus?: { number?: string; plate?: string } | null;
  routeId?: string | null;
  route?: { name?: string } | null;
  stopId?: string | null;
  stop?: { name?: string; sequence?: number } | null;
};

type AttendanceRow = {
  id?: string;
  _id?: string;
  date?: string;
  type?: string;
  status?: string;
  verified?: boolean;
  stopName?: string;
};

function fmtDate(v?: string): string {
  if (!v) return '—';
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function InfoTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="nu-raised rounded-2xl bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400">
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 font-semibold">{value}</p>
      {sub && <p className="truncate text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [student, attendanceRes] = await Promise.all([
    serverApi<StudentDetail>(`/students/${id}`),
    serverApi<{ items?: AttendanceRow[] }>('/attendance', { studentId: id, limit: 20 }),
  ]).catch(() => [null, null] as const);

  if (!student) notFound();
  const attendance = listOf<AttendanceRow>(attendanceRes);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/students"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to students
        </Link>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">{student.name ?? 'Student'}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {student.grade && <Badge variant="outline">Grade {student.grade}</Badge>}
            <StatusBadge status={student.status} />
            {student.studentCode && (
              <span className="text-sm text-muted-foreground">Code #{student.studentCode}</span>
            )}
          </div>
        </div>
      </header>

      {/* Assignments — Parent / Bus / Route / Stop */}
      <section aria-label="Assignments" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoTile
          icon={UserRound}
          label="Parent"
          value={student.parent?.name ?? '—'}
          sub={student.parent?.phone ?? student.parent?.email}
        />
        <InfoTile
          icon={Bus}
          label="Bus"
          value={student.bus?.number ?? '—'}
          sub={student.bus?.plate ? `Plate ${student.bus.plate}` : undefined}
        />
        <InfoTile
          icon={RouteIcon}
          label="Route"
          value={
            student.routeId ? (
              <Link href={`/routes/${student.routeId}`} className="text-brand-600 hover:underline dark:text-brand-400">
                {student.route?.name ?? 'View route'}
              </Link>
            ) : (
              '—'
            )
          }
          sub={student.stop ? `Stop: ${student.stop.name ?? '—'}${student.stop.sequence ? ` (#${student.stop.sequence})` : ''}` : undefined}
        />
        <InfoTile icon={MapPin} label="Stop" value={student.stop?.name ?? '—'} sub={student.stop?.sequence ? `Sequence #${student.stop.sequence}` : undefined} />
      </section>

      {/* Recent attendance */}
      <Card className="py-5">
        <CardHeader>
          <CardTitle>Recent attendance</CardTitle>
        </CardHeader>
        <CardContent>
          {attendance.length === 0 ? (
            <EmptyState title="No attendance records" body="Records appear once the student rides a trip." />
          ) : (
            <ul className="max-h-96 space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
              {attendance.map((a) => (
                <li
                  key={a.id ?? a._id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm"
                >
                  <span className="font-medium">{fmtDate(a.date)}</span>
                  <span className="inline-flex items-center gap-2">
                    {a.stopName && <span className="text-muted-foreground">{a.stopName}</span>}
                    <Badge variant="outline" className="capitalize">
                      {a.type ?? 'trip'}
                    </Badge>
                    <StatusBadge status={a.status} />
                    {a.verified && (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                        verified
                      </Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
