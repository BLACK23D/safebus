'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BellOff,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Megaphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { http } from '@/lib/api/client';
import { SE } from '@/lib/socket/events';
import { useSocketEvent } from '@/components/providers/socket-provider';
import type { Role } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from '@/components/ui/kit';

type NotificationItem = {
  id: string;
  title: string;
  body?: string;
  type: string;
  read: boolean;
  createdAt: string;
};

type Page = { items: NotificationItem[]; unread: number; total: number; page: number; pages: number };

const LIMIT = 30;

const TYPE_TONES: Record<string, string> = {
  trip: 'bg-brand-500/15 text-brand-700 dark:text-brand-400',
  eta: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
  arrival: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
  attendance: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  emergency: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
  broadcast: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  'edit-request': 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
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

export default function NotificationsPage() {
  const [role, setRole] = useState<Role | null>(null);
  const [data, setData] = useState<Page | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  const load = useCallback(async (p: number) => {
    try {
      const d = await http.get<Page>('/notifications', { page: p, limit: LIMIT });
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notifications');
    }
  }, []);

  useEffect(() => {
    // Initial/page fetch deferred to a timer callback (no synchronous setState in effects).
    const t = setTimeout(() => void load(page), 0);
    return () => clearTimeout(t);
  }, [load, page]);

  // Role decides whether the Broadcast action is available (contract §9: admin+).
  useEffect(() => {
    let alive = true;
    http
      .get<{ role: Role }>('/auth/me')
      .then((u) => alive && setRole(u.role))
      .catch(() => {
        /* role stays null → broadcast hidden */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Live: prepend new notifications (the shell owns the badge count).
  useSocketEvent(
    SE.NOTIFICATION_NEW,
    (payload) => {
      const n = payload as NotificationItem;
      if (!n || typeof n.id !== 'string') return;
      setData((prev) => {
        if (!prev) return prev;
        if (prev.items.some((x) => x.id === n.id)) return prev;
        return { ...prev, items: [n, ...prev.items], unread: prev.unread + 1, total: prev.total + 1 };
      });
      toast(n.title ?? 'New notification', { description: n.body });
    },
    [],
  );

  const markRead = useCallback(async (id: string) => {
    setMarking(id);
    try {
      await http.patch(`/notifications/${id}/read`);
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((x) => (x.id === id ? { ...x, read: true } : x)),
              unread: Math.max(0, prev.unread - (prev.items.find((x) => x.id === id && !x.read) ? 1 : 0)),
            }
          : prev,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark as read');
    } finally {
      setMarking(null);
    }
  }, []);

  const markAll = useCallback(async () => {
    try {
      await http.patch('/notifications/read-all');
      setData((prev) => (prev ? { ...prev, items: prev.items.map((x) => ({ ...x, read: true })), unread: 0 } : prev));
      toast.success('All notifications marked as read');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark all as read');
    }
  }, []);

  const canBroadcast = role === 'admin' || role === 'superadmin';
  const unread = data?.unread ?? 0;

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'Everything is read'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canBroadcast && (
              <Button variant="outline" onClick={() => setBroadcastOpen(true)} className="min-h-11">
                <Megaphone className="h-4 w-4" /> Broadcast
              </Button>
            )}
            <Button onClick={() => void markAll()} disabled={unread === 0} className="min-h-11">
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          </div>
        }
      />

      {error ? (
        <ErrorState message={error} retry={() => void load(page)} />
        ) : data === null ? (
        <PageSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="You're all caught up"
          body="New alerts, trip updates and messages will appear here."
        />
      ) : (
        <>
          <ul className="space-y-2" aria-label="Notifications">
            {data.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => !n.read && void markRead(n.id)}
                  disabled={n.read || marking === n.id}
                  aria-label={
                    n.read ? `${n.title} (read)` : `Mark "${n.title}" as read${marking === n.id ? ' — marking' : ''}`
                  }
                  className={cn(
                    'flex w-full items-start gap-3 rounded-2xl border bg-card p-4 text-left transition-colors focus-visible:outline-2',
                    n.read
                      ? 'border-border'
                      : 'border-l-4 border-l-brand-500 border-y-border border-r-border bg-brand-500/[0.04] hover:bg-accent/60',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={cn('font-semibold', !n.read && 'font-bold')}>{n.title}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'capitalize',
                          TYPE_TONES[n.type] ?? 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
                        )}
                      >
                        {n.type.replace(/_/g, ' ')}
                      </Badge>
                      {!n.read && <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                    </span>
                    {n.body && <span className="mt-1 block text-sm text-muted-foreground">{n.body}</span>}
                    <span className="mt-1 block text-xs text-muted-foreground">{when(n.createdAt)}</span>
                  </span>
                  {!n.read && marking === n.id && (
                    <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>

          {data.pages > 1 && (
            <nav aria-label="Notification pages" className="mt-4 flex items-center justify-between">
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
                Page {data.page} of {data.pages}
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

      {canBroadcast && (
        <BroadcastDialog open={broadcastOpen} onOpenChange={setBroadcastOpen} onSent={() => void load(page)} />
      )}
    </div>
  );
}

function BroadcastDialog({
  open,
  onOpenChange,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSent: () => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState('all');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setTitle('');
        setBody('');
        setTarget('all');
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const res = await http.post<{ created?: number }>('/notifications/broadcast', {
        title: title.trim(),
        body: body.trim() || undefined,
        targetRole: target === 'all' ? undefined : target,
      });
      toast.success('Broadcast sent', {
        description: res.created
          ? `Delivered to ${res.created} recipient${res.created === 1 ? '' : 's'}.`
          : undefined,
      });
      onOpenChange(false);
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send the broadcast');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-brand-500" /> Broadcast to your school
          </DialogTitle>
          <DialogDescription>
            Sends a notification to every active user in your scope. Use it for schedule changes, weather
            notices and school announcements.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bc-title">Title</Label>
            <Input
              id="bc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Route A delayed 10 minutes"
              className="min-h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bc-body">Message (optional)</Label>
            <Textarea
              id="bc-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add details parents and drivers should know…"
              className="min-h-20"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bc-target">Audience</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="bc-target" className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="parent">Parents only</SelectItem>
                <SelectItem value="driver">Drivers only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void submit()} disabled={!title.trim() || busy} className="min-h-11 w-full">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send broadcast
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
