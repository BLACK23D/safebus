'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SE } from '@/lib/socket/events';
import { PUBLIC_SOCKET_URL } from '@/lib/env';

// Re-export so consumers can import both hooks and event names from the provider.
export { SE };

type SocketCtx = { socket: Socket | null; connected: boolean };
const Ctx = createContext<SocketCtx>({ socket: null, connected: false });
export const useSocket = () => useContext(Ctx);
export const useSocketStatus = () => useContext(Ctx).connected;

/* ── Shared connection vocabulary (QA M10) ───────────────────────────────
 * One set of labels for every live-status chip: "Live" (connected),
 * "Reconnecting…" (socket down, browser online), "Offline" (browser offline). */
export const SOCKET_STATUS = {
  LIVE: 'Live',
  RECONNECTING: 'Reconnecting…',
  OFFLINE: 'Offline',
} as const;

export function socketStatusLabel(connected: boolean, online: boolean): string {
  if (!online) return SOCKET_STATUS.OFFLINE;
  return connected ? SOCKET_STATUS.LIVE : SOCKET_STATUS.RECONNECTING;
}

/** Browser network state shared by the status chips (replaces per-page listeners). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    addEventListener('online', sync);
    addEventListener('offline', sync);
    return () => {
      removeEventListener('online', sync);
      removeEventListener('offline', sync);
    };
  }, []);
  return online;
}

/**
 * Socket.IO provider v2 — fetches a fresh handshake token on EVERY connect/reconnect
 * via the auth callback (access tokens expire). Browser connects same-origin through
 * the sandbox gateway (?XTransformPort=5000) or NEXT_PUBLIC_SOCKET_URL in production.
 */
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let s: Socket | undefined;
    let cancelled = false;
    s = io(PUBLIC_SOCKET_URL, {
      auth: (cb) => {
        fetch('/api/socket-token', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no token'))))
          .then(({ data }) => cb({ token: data?.token ?? '' }))
          .catch(() => cb({}));
      },
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 15_000,
    });
    s.on('connect', () => !cancelled && setConnected(true));
    s.on('disconnect', () => !cancelled && setConnected(false));
    s.on('connect_error', () => !cancelled && setConnected(false));
    // In-app login: the first handshake ran while logged out. When a session becomes
    // available, force a fresh connect attempt (auth callback re-fetches the token).
    const onAuthReady = () => {
      if (!cancelled && !s.connected) s.connect();
    };
    window.addEventListener('auth:ready', onAuthReady);
    // Socket creation is an external-system sync; setState here is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(s);
    return () => {
      cancelled = true;
      window.removeEventListener('auth:ready', onAuthReady);
      s?.disconnect();
    };
  }, []);

  return <Ctx.Provider value={{ socket, connected }}>{children}</Ctx.Provider>;
}

/** Subscribe with duplicate-event suppression (250 ms payload-hash window, §13). */
export function useSocketEvent(
  event: string,
  handler: (payload: unknown) => void,
  deps: unknown[] = [],
) {
  const { socket } = useSocket();
  const last = useRef<{ hash: string; at: number }>({ hash: '', at: 0 });
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler, ...deps]);

  useEffect(() => {
    if (!socket) return;
    const fn = (payload: unknown) => {
      let hash = '';
      try {
        hash = JSON.stringify(payload);
      } catch {
        hash = String(Math.random());
      }
      const now = Date.now();
      if (hash === last.current.hash && now - last.current.at < 250) return; // dedupe
      last.current = { hash, at: now };
      handlerRef.current(payload);
    };
    socket.on(event, fn);
    return () => {
      socket.off(event, fn);
    };
  }, [socket, event, ...deps]);
}

/** Ask the server to add this socket to a trip room (authorized server-side). */
export function useJoinTrip(tripId?: string | null) {
  const { socket, connected } = useSocket();
  useEffect(() => {
    if (!socket || !connected || !tripId) return;
    socket.emit(SE.JOIN_TRIP, { tripId });
  }, [socket, connected, tripId]);
}
