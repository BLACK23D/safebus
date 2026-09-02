'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertTriangle, Inbox, RefreshCw, WifiOff } from 'lucide-react';
import Link from 'next/link';

/** Shared state/feedback primitives used across every feature area. */

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-4 flex flex-wrap items-center justify-between gap-3', className)}>
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  icon: Icon = Inbox,
  action,
}: {
  title: string;
  body?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-3 font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  retry,
  offline,
}: {
  message: string;
  retry?: () => void;
  offline?: boolean;
}) {
  return (
    <div
      role="alert"
      className="grid place-items-center rounded-2xl border border-rose-200 bg-rose-50/60 py-12 text-center dark:border-rose-900/50 dark:bg-rose-950/20"
    >
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
        {offline ? <WifiOff className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
      </span>
      <p className="mt-3 font-semibold">{offline ? 'You are offline' : 'Something went wrong'}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      {retry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={retry}>
          <RefreshCw className="h-4 w-4" /> Retry
        </Button>
      )}
    </div>
  );
}

const STATUS_TONES: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent',
  approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent',
  present: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent',
  picked_up: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent',
  dropped_off: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent',
  resolved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent',
  verified: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent',
  scheduled: 'bg-brand-500/15 text-brand-700 dark:text-brand-400 border-transparent',
  invited: 'bg-brand-500/15 text-brand-700 dark:text-brand-400 border-transparent',
  in_transit: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-transparent',
  returned_to_school: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-transparent',
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent',
  maintenance: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent',
  suspended: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent',
  inactive: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-transparent',
  cancelled: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-transparent',
  rejected: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-transparent',
  absent: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-transparent',
  emergency: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-transparent',
  driver: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-transparent',
  parent: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-transparent',
  admin: 'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-transparent',
  superadmin: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-400 border-transparent',
};

export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  if (!status) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        'capitalize',
        STATUS_TONES[status] ?? 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-transparent',
        className,
      )}
    >
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'brand',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: 'brand' | 'emerald' | 'amber' | 'rose' | 'indigo';
}) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-500/10 text-brand-600 dark:text-brand-400',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  };
  return (
    <div className="nu-raised rounded-2xl bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn('grid h-9 w-9 place-items-center rounded-xl', tones[tone])}>
            <Icon className="h-4.5 w-4.5" />
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-black tabular-nums md:text-3xl">{value ?? '—'}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function LinkButton({
  href,
  children,
  variant = 'default',
  size = 'default',
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}) {
  return (
    <Button asChild variant={variant} size={size} className={className}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}
