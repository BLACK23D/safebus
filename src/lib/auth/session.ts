import type { NextResponse } from 'next/server';
import { EMBEDDED_COOKIES } from '@/lib/env';

export const COOKIES = { at: 'sb_at', rt: 'sb_rt', session: 'sb_session' } as const;

export type Role = 'parent' | 'driver' | 'admin' | 'superadmin';
export type AppSession = { id: string; name: string; role: Role; schoolId?: string | null };
export type Tokens = { accessToken: string; refreshToken?: string };

/** Refresh cookie TTL: 7 days. VERIFY against backend refresh TTL (7d per contract). */
export const REFRESH_TTL_S = 60 * 60 * 24 * 7;

export function jwtMaxAge(jwt: string): number {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
    return Math.max(60, (payload.exp ?? 0) - Math.floor(Date.now() / 1000));
  } catch {
    return 900;
  }
}

export function jwtExpired(jwt?: string): boolean {
  if (!jwt) return true;
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split('.')[1], 'base64url').toString(),
    ) as { exp?: number };
    return (payload.exp ?? 0) * 1000 <= Date.now() + 30_000; // refresh 30s early
  } catch {
    return true;
  }
}

export function encodeSession(s: AppSession): string {
  return encodeURIComponent(JSON.stringify(s));
}

export function decodeSession(v?: string | null): AppSession | null {
  if (!v) return null;
  try {
    return JSON.parse(decodeURIComponent(v)) as AppSession;
  } catch {
    return null;
  }
}

export function sessionFromUser(u: unknown): AppSession | null {
  if (!u || typeof u !== 'object') return null;
  const rec = u as Record<string, unknown>;
  const id = (rec.id ?? rec._id) as string | undefined;
  if (!id) return null;
  return {
    id,
    name: (rec.name as string) ?? '',
    role: rec.role as Role,
    schoolId: ((rec.schoolId ?? rec.school) as string | null) ?? null,
  };
}

/** Sets the full auth cookie set on a response (BFF + middleware share this shape). */
export function applySessionCookies(
  res: NextResponse,
  t: Tokens,
  s: AppSession | null | undefined,
  secure: boolean,
) {
  // Embedded mode (default; opt out with AUTH_COOKIE_EMBEDDED=0): cross-site iframe hosts drop
  // SameSite=Lax/Strict Set-Cookie, so use CHIPS (None + Secure + Partitioned).
  // Secure is mandatory for SameSite=None; allowed on http only for localhost.
  const base = EMBEDDED_COOKIES
    ? {
        httpOnly: true as const,
        secure: true,
        sameSite: 'none' as const,
        partitioned: true,
        path: '/',
      }
    : {
        httpOnly: true as const,
        secure,
        sameSite: 'lax' as const,
        path: '/',
      };
  res.cookies.set(COOKIES.at, t.accessToken, { ...base, maxAge: jwtMaxAge(t.accessToken) });
  if (t.refreshToken) {
    // Refresh cookie is scoped to the BFF path: never readable by page JS. In
    // first-party mode it is SameSite=strict; in embedded mode it rides the
    // partitioned None base above (strict would be dropped in the iframe).
    res.cookies.set(COOKIES.rt, t.refreshToken, {
      ...base,
      sameSite: EMBEDDED_COOKIES ? ('none' as const) : ('strict' as const),
      path: '/api',
      maxAge: REFRESH_TTL_S,
    });
  }
  if (s) {
    res.cookies.set(COOKIES.session, encodeSession(s), { ...base, maxAge: REFRESH_TTL_S });
  }
}

export function clearSessionCookies(res: NextResponse) {
  const drop = EMBEDDED_COOKIES
    ? { httpOnly: true as const, secure: true, sameSite: 'none' as const, partitioned: true }
    : { httpOnly: true as const };
  for (const name of [COOKIES.at, COOKIES.rt, COOKIES.session]) {
    res.cookies.set(name, '', { ...drop, path: '/', maxAge: 0 });
  }
  res.cookies.set(COOKIES.rt, '', { ...drop, path: '/api', maxAge: 0 });
}

/** Extracts the token pair from any auth endpoint body ({data:{...}} or raw). */
export function extractTokens(json: unknown): Tokens | null {
  const d =
    (json as { data?: { accessToken?: string; token?: string; refreshToken?: string } })?.data ??
    (json as { accessToken?: string; token?: string; refreshToken?: string });
  const accessToken = d?.accessToken ?? d?.token;
  if (!accessToken) return null;
  return { accessToken, refreshToken: d?.refreshToken };
}
