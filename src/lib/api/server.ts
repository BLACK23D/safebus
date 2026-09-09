import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { BACKEND_URL } from '@/lib/env';
import { COOKIES, decodeSession, type AppSession } from '@/lib/auth/session';

export class ServerFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerFetchError';
  }
}

export async function getSession(): Promise<AppSession | null> {
  const c = await cookies();
  return decodeSession(c.get(COOKIES.session)?.value);
}

/**
 * Server Component fetch. The middleware guarantees a fresh access token via the
 * request-cookie mutation pattern; if upstream still 401s we redirect to login
 * (RSC cannot rotate cookies mid-render — by design).
 */
export async function serverApi<T>(path: string, q?: Record<string, unknown>): Promise<T> {
  const c = await cookies();
  const at = c.get(COOKIES.at)?.value;
  const search = q
    ? '?' +
      new URLSearchParams(
        Object.entries(q)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : '';
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api${path}${search}`, {
      headers: { authorization: `Bearer ${at ?? ''}`, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ServerFetchError('Backend unreachable — please try again shortly.');
  }
  if (res.status === 401) {
    redirect(`/login?session=expired&next=${encodeURIComponent(path)}`);
  }
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: unknown; message?: string; error?: { message?: string } }
    | null;
  if (!res.ok) {
    throw new ServerFetchError(
      json?.error?.message ??
        json?.message ??
        'The server is having trouble right now — please try again in a minute.',
    );
  }
  return (json && 'data' in json ? json.data : json) as T;
}

/** Extracts {items,total,page,pages} lists or raw arrays from any list endpoint. */
export function listOf<T>(d: unknown): T[] {
  if (Array.isArray(d)) return d as T[];
  const j = d as { items?: T[]; results?: T[] } | null;
  return j?.items ?? j?.results ?? [];
}
