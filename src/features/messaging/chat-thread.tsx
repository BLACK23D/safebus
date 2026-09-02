'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, CheckCheck, HandHeart, Loader2, SendHorizonal } from 'lucide-react';
import { toast } from 'sonner';
import { http } from '@/lib/api/client';
import { SE } from '@/lib/socket/events';
import { useSocketEvent } from '@/components/providers/socket-provider';
import type { AppSession, Role } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { formatTime } from '@/features/trips/shared';
import { Button } from '@/components/ui/button';
import { StatusBadge, EmptyState, ErrorState } from '@/components/ui/kit';

type Msg = {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  read: boolean;
  createdAt: string;
  temp?: boolean;
};

type Peer = { id: string; name: string; role: Role };


export function ChatThread({ session, userId }: { session: AppSession; userId: string }) {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await http.get<{ user: Peer; messages: Msg[] }>('/messages', { userId, limit: 50 });
      setPeer(d.user);
      setMessages(d.messages);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this conversation');
    }
  }, [userId]);

  useEffect(() => {
    // Initial fetch deferred to a timer callback (no synchronous setState from the effect body).
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // Keep the thread pinned to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length, peer?.id]);

  const appendUnique = useCallback((m: Msg) => {
    setMessages((prev) => (prev?.some((x) => x.id === m.id) ? prev : [...(prev ?? []), m]));
  }, []);

  // Live incoming: append the peer's messages; toast only when the tab is hidden.
  useSocketEvent(
    SE.MESSAGE_NEW,
    (payload) => {
      const p = payload as Msg & { sender?: { name?: string } };
      if (!p || typeof p.id !== 'string') return;
      const fromPeer = p.senderId === userId && p.recipientId === session.id;
      const mirrorFromOtherDevice = p.senderId === session.id && p.recipientId === userId;
      if (!fromPeer && !mirrorFromOtherDevice) return;
      appendUnique({ ...p, temp: false });
      if (fromPeer && document.hidden) {
        toast('New message', { description: p.sender?.name ?? peer?.name ?? 'New message received' });
      }
    },
    [userId, session.id, appendUnique, peer?.name],
  );

  // Read receipts: { userId: <reader>, peerId: <notified peer> } — when the peer
  // reads, every outgoing message in this thread becomes read.
  useSocketEvent(
    SE.MESSAGE_READ,
    (payload) => {
      const p = payload as { userId?: string; peerId?: string };
      if (p?.peerId === session.id && p?.userId === userId) {
        setMessages((prev) =>
          prev
            ? prev.map((m) =>
                m.senderId === session.id && m.recipientId === userId && !m.read ? { ...m, read: true } : m,
              )
            : prev,
        );
      }
    },
    [userId, session.id],
  );

  /**
   * Send is never queued for offline replay (contract §8): optimistic append with a
   * temporary id; on failure the draft is restored to the input and the bubble removed.
   */
  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: Msg = {
      id: tempId,
      senderId: session.id,
      recipientId: userId,
      body,
      read: false,
      createdAt: new Date().toISOString(),
      temp: true,
    };
    setDraft('');
    if (draftRef.current) draftRef.current.style.height = 'auto';
    setMessages((prev) => [...(prev ?? []), optimistic]);
    setSending(true);
    try {
      const saved = await http.post<Msg>('/messages', { recipientId: userId, body });
      setMessages((prev) => {
        if (!prev) return prev;
        if (prev.some((m) => m.id === saved.id)) return prev.filter((m) => m.id !== tempId);
        return prev.map((m) => (m.id === tempId ? saved : m));
      });
    } catch (e) {
      setMessages((prev) => (prev ? prev.filter((m) => m.id !== tempId) : prev));
      setDraft(body);
      toast.error(e instanceof Error ? e.message : 'Message failed to send — restored as a draft.');
    } finally {
      setSending(false);
    }
  }, [draft, sending, session.id, userId]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <div className="flex flex-col">
      {/* Thread header */}
      <header className="nu-raised mb-3 flex items-center gap-3 rounded-2xl border bg-card p-4">
        <Link
          href="/messages"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors hover:bg-accent focus-visible:outline-2"
          aria-label="Back to all conversations"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-700 dark:text-brand-300"
        >
          {(peer?.name ?? '?').slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{peer?.name ?? 'Conversation'}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <StatusBadge status={peer?.role} />
            <span className="text-xs text-muted-foreground">
              {messages ? `${messages.length} message${messages.length === 1 ? '' : 's'}` : 'Loading…'}
            </span>
          </div>
        </div>
      </header>

      {/* Messages */}
      {error ? (
        <ErrorState message={error} retry={() => void load()} />
      ) : messages === null ? (
        <div className="grid h-56 place-items-center rounded-2xl border bg-card" aria-busy="true" aria-label="Loading messages">
          <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="scrollbar-thin h-[max(380px,calc(100dvh-19rem))] overflow-y-auto rounded-2xl border bg-card p-4"
          role="log"
          aria-label={`Messages with ${peer?.name ?? 'peer'}`}
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <EmptyState
              icon={HandHeart}
              title="Say hello"
              body="This is the beginning of your conversation — send the first message below."
            />
          ) : (
            <ul className="space-y-2.5">
              {messages.map((m) => {
                const mine = m.senderId === session.id;
                return (
                  <li key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[85%] sm:max-w-[70%]')}>
                      <div
                        className={cn(
                          'whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                          mine
                            ? 'rounded-br-md bg-brand-500 text-white'
                            : 'nu-inset rounded-bl-md bg-muted text-foreground',
                          m.temp && 'opacity-70',
                        )}
                      >
                        {m.body}
                      </div>
                      <div
                        className={cn(
                          'mt-1 flex items-center gap-1 text-[11px] text-muted-foreground',
                          mine && 'justify-end',
                        )}
                      >
                        <span>{formatTime(m.createdAt)}</span>
                        {mine && (
                          <span aria-label={m.read ? 'Read' : 'Sent'}>
                            {m.read ? (
                              <CheckCheck className="h-3.5 w-3.5 text-brand-500" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Composer */}
      <div className="nu-raised mt-3 flex items-end gap-2 rounded-2xl border bg-card p-3">
        <textarea
          ref={draftRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            autoGrow(e.target);
          }}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
          aria-label="Message text"
          className="max-h-[120px] min-h-11 flex-1 resize-none rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-2"
        />
        <Button
          onClick={() => void send()}
          disabled={!draft.trim() || sending}
          className="min-h-11 px-4"
          aria-label="Send message"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
          <span className="hidden sm:inline">Send</span>
        </Button>
      </div>
    </div>
  );
}
