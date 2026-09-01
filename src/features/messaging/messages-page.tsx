'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, MessageSquarePlus, MessagesSquare, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import { http } from '@/lib/api/client';
import { SE } from '@/lib/socket/events';
import { useSocketEvent } from '@/components/providers/socket-provider';
import type { AppSession, Role } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmptyState, ErrorState, PageHeader, PageSkeleton, StatusBadge } from '@/components/ui/kit';

type Conversation = {
  userId: string;
  name: string;
  role: Role;
  avatar?: string;
  lastMessage?: string;
  lastAt?: string;
  unread: number;
};

type Contact = { userId: string; name: string; role: Role };

function timeLabel(iso?: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function MessagesPage({ session }: { session: AppSession }) {
  const router = useRouter();
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await http.get<Conversation[]>('/messages/conversations');
      setItems(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load conversations');
    }
  }, []);

  useEffect(() => {
    // Initial fetch deferred to a timer callback (no synchronous setState from the effect body).
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // Live: new message arrives → refresh list; toast when it is not from an open
  // peer (on the list page there is no open peer, so every new message toasts).
  useSocketEvent(
    SE.MESSAGE_NEW,
    (payload) => {
      const p = payload as { senderId?: string; sender?: { name?: string } };
      void load();
      if (p?.senderId && p.senderId !== session.id) {
        toast(`New message from ${p.sender?.name ?? 'someone'}`, {
          description: 'Open Messages to read and reply.',
        });
      }
    },
    [load, session.id],
  );

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle={`Direct, secure messaging for ${session.name.split(' ')[0]} — reachable people are managed by the school.`}
        actions={
          <Button onClick={() => setComposeOpen(true)} className="min-h-11">
            <MessageSquarePlus className="h-4 w-4" /> New message
          </Button>
        }
      />

      {error ? (
        <ErrorState message={error} retry={() => void load()} />
        ) : items === null ? (
        <PageSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No conversations yet"
          body="You can message people linked to your students, routes or school. Start one with the New message button."
        />
      ) : (
        <ul className="space-y-2" aria-label="Conversations">
          {items.map((c) => (
            <li key={c.userId}>
              <Link
                href={`/messages/${c.userId}`}
                className="nu-raised flex min-h-[72px] items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-accent/60 focus-visible:outline-2"
              >
                <span
                  aria-hidden
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-500/15 text-base font-bold text-brand-700 dark:text-brand-300"
                >
                  {c.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold">{c.name}</span>
                    <StatusBadge status={c.role} className="hidden sm:inline-flex" />
                    {c.unread > 0 && (
                      <span
                        className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white tabular-nums"
                        aria-label={`${c.unread} unread`}
                      >
                        {c.unread > 9 ? '9+' : c.unread}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                    <span className={cn('truncate', c.unread > 0 && 'font-medium text-foreground')}>
                      {c.lastMessage ?? 'Say hello — no messages yet.'}
                    </span>
                    {c.lastAt && <span className="ml-auto shrink-0 text-xs">{timeLabel(c.lastAt)}</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} onPick={(id) => router.push(`/messages/${id}`)} />
    </div>
  );
}

function ComposeDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (userId: string) => void;
}) {
  const [q, setQ] = useState('');
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // On-open fetch + 250 ms debounced search — setState happens in async callbacks only.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const t = setTimeout(
      () => {
        http
          .get<Contact[]>('/messages/contacts', q.trim() ? { q: q.trim() } : undefined)
          .then((rows) => {
            if (!alive) return;
            setContacts(rows);
            setError(null);
          })
          .catch((e: unknown) => {
            if (!alive) return;
            setContacts([]);
            setError(e instanceof Error ? e.message : 'Could not load contacts');
          });
      },
      q ? 250 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [open, q]);

  useEffect(() => {
    if (!open) {
      // reset after close for the next compose
      const t = setTimeout(() => {
        setQ('');
        setContacts(null);
        setError(null);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-brand-500" /> New message
          </DialogTitle>
          <DialogDescription>
            Choose someone the school has linked to you. Pick up the conversation right where you left it.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people…"
            aria-label="Search contacts"
            className="pl-9"
          />
        </div>
        <ScrollArea className="max-h-72 pr-2 scrollbar-thin">
          {error ? (
            <p role="alert" className="py-6 text-center text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : contacts === null ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading contacts" />
            </div>
          ) : contacts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No contacts match your search.
            </p>
          ) : (
            <ul className="space-y-1" aria-label="Contacts">
              {contacts.map((c) => (
                <li key={c.userId}>
                  <button
                    type="button"
                    onClick={() => onPick(c.userId)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-2"
                  >
                    <span
                      aria-hidden
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-700 dark:text-brand-300"
                    >
                      {c.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                    <StatusBadge status={c.role} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
