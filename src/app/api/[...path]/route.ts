import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, requestIsSecure } from '@/lib/env';
import {
  applySessionCookies,
  clearSessionCookies,
  decodeSession,
  extractTokens,
  sessionFromUser,
} from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The BFF catch-all — preserves the backend /api contract 1:1 while keeping tokens
 * out of the browser: login/register/refresh/claim-invite bodies are token-stripped,
 * access+refresh live in HttpOnly cookies, 401s trigger single-flight refresh+retry.
 */

/** Auth endpoints that issue token pairs in their response body (contract §1). */
const AUTH_PATHS =
  /^auth\/(login|register|refresh|logout|claim-invite|forgot-password|reset-password)/;

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function sameOrigin(req: NextRequest): boolean {
  if (!MUTATING.has(req.method)) return true;
  const site = req.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'same-site'; // all modern browsers
  const origin = req.headers.get('origin');
  if (!origin) return true; // non-browser client
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  // Behind the sandbox gateway the Host header loses its port; compare hostnames and
  // accept either side riding a default port (X-Forwarded-Host carries the real one).
  const candidates = [req.headers.get('host'), req.headers.get('x-forwarded-host')];
  const hostOf = (h: string) => h.split(':')[0] ?? h;
  const portOf = (h: string) => h.split(':')[1];
  const isDefault = (p?: string) => !p || p === '80' || p === '443';
  for (const c of candidates) {
    if (!c) continue;
    if (c === originHost) return true;
    if (hostOf(c) === hostOf(originHost) && (isDefault(portOf(c)) || isDefault(portOf(originHost)))) {
      return true;
    }
  }
  return false;
}

type RefreshResult = { tokens: ReturnType<typeof extractTokens>; user: unknown } | null;

/**
 * Single-flight refresh, keyed by refresh token (issue #2). The map — not a single
 * global promise — guarantees a caller can only ever receive the rotated session
 * for the refresh token IT presented; a concurrent refresh for another user can
 * no longer leak its tokens across accounts. Every refresh path in this module
 * (401-retry, explicit auth/refresh POSTs, logout body injection) funnels through
 * here so concurrent callers with the same token share one rotation.
 */
const inflight = new Map<string, Promise<RefreshResult>>();

function refreshOnce(refreshToken: string): Promise<RefreshResult> {
  const existing = inflight.get(refreshToken);
  if (existing) return existing;
  const promise = (async (): Promise<RefreshResult> => {
    try {
      const r = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!r.ok) return null;
      const json = await r.json();
      return {
        tokens: extractTokens(json),
        user: (json as { data?: { user?: unknown } })?.data?.user ?? null,
      };
    } catch {
      return null;
    }
  })().finally(() => {
    setTimeout(() => {
      inflight.delete(refreshToken);
    }, 0);
  });
  inflight.set(refreshToken, promise);
  return promise;
}

async function forward(
  req: NextRequest,
  path: string,
  accessToken: string | undefined,
  body?: BodyInit,
): Promise<Response> {
  const url = `${BACKEND_URL}/api/${path}${req.nextUrl.search}`;
  const headers = new Headers();
  const isFormData = body instanceof FormData;
  for (const h of ['content-type', 'accept']) {
    // FormData bodies get a fresh multipart boundary from fetch — never copy the
    // incoming content-type or the stale boundary breaks upstream parsing.
    if (h === 'content-type' && isFormData) continue;
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  return fetch(url, { method: req.method, headers, body, cache: 'no-store' });
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params;
  const joined = (path ?? []).join('/');
  const session = decodeSession(req.cookies.get('sb_session')?.value);

  if (!sameOrigin(req)) {
    return NextResponse.json(
      { success: false, message: 'Cross-origin request blocked', error: { code: 'CSRF' } },
      { status: 403 },
    );
  }

  // Body: JSON passthrough (text) or FormData passthrough (avatar upload).
  let body: BodyInit | undefined;
  const isForm = req.headers.get('content-type')?.includes('multipart/form-data');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = isForm ? await req.formData() : await req.text();
  }

  let at = req.cookies.get('sb_at')?.value;

  const secure = requestIsSecure(req.headers);

  // Explicit refresh POSTs are intercepted and funneled through the keyed
  // single-flight so every refresh path (client retry, page shell, middleware)
  // shares one rotation per refresh token. Response bodies stay token-stripped;
  // the browser receives the new session exclusively via HttpOnly cookies.
  if (joined === 'auth/refresh' && req.method === 'POST') {
    const rt = req.cookies.get('sb_rt')?.value ?? bodyRefreshToken(body);
    if (!rt) {
      return NextResponse.json(
        { success: false, message: 'Refresh token required', error: { code: 'UNAUTHORIZED' } },
        { status: 401 },
      );
    }
    const refreshed = await refreshOnce(rt);
    if (!refreshed?.tokens) {
      return NextResponse.json(
        { success: false, message: 'Invalid refresh token', error: { code: 'UNAUTHORIZED' } },
        { status: 401 },
      );
    }
    const json = { success: true, data: { ...refreshed.tokens, user: refreshed.user } };
    const res = NextResponse.json(stripTokens(json), { status: 200 });
    applySessionCookies(res, refreshed.tokens, sessionFromUser(refreshed.user) ?? session, secure);
    return res;
  }

  // Logout: inject the refresh token from its cookie so the backend can actually
  // revoke it server-side (previously the BFF forwarded no sb_rt → no-op revoke).
  if (joined === 'auth/logout' && req.method === 'POST') {
    const rt = req.cookies.get('sb_rt')?.value;
    if (rt) body = JSON.stringify({ refreshToken: rt });
  }

  let upstream = await forward(req, joined, at, body);

  // Single retry through a refreshed token on 401 (never for the refresh call itself).
  if (upstream.status === 401 && !/^auth\/(refresh|logout)/.test(joined)) {
    const rt = req.cookies.get('sb_rt')?.value;
    if (rt) {
      const refreshed = await refreshOnce(rt);
      if (refreshed?.tokens) {
        at = refreshed.tokens.accessToken;
        upstream = await forward(req, joined, at, body);
        if (upstream.ok) {
          const res = new NextResponse(upstream.body, {
            status: upstream.status,
            headers: passthroughHeaders(upstream),
          });
          applySessionCookies(
            res,
            refreshed.tokens,
            sessionFromUser(refreshed.user) ?? session,
            secure,
          );
          return res;
        }
      }
    }
  }

  // Auth endpoints: set/clear cookies and strip token bodies.
  if (AUTH_PATHS.test(joined)) {
    const json = await upstream.json().catch(() => null);
    if (joined === 'auth/logout') {
      const res = NextResponse.json(json ?? { success: true, data: { ok: true } }, {
        status: upstream.ok ? 200 : upstream.status,
      });
      clearSessionCookies(res);
      return res;
    }
    if (upstream.ok) {
      const tokens = extractTokens(json);
      const user = (json as { data?: { user?: unknown } })?.data?.user;
      const newSession = sessionFromUser(user) ?? session;
      const res = NextResponse.json(stripTokens(json), { status: upstream.status });
      if (tokens && newSession) applySessionCookies(res, tokens, newSession, secure);
      return res;
    }
    return NextResponse.json(json, { status: upstream.status });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: passthroughHeaders(upstream),
  });
}

function passthroughHeaders(upstream: Response): Headers {
  const h = new Headers();
  const ct = upstream.headers.get('content-type');
  if (ct) h.set('content-type', ct);
  h.set('cache-control', 'no-store');
  return h;
}

/** Reads refreshToken from a raw JSON body (explicit refresh POSTs that carry no sb_rt cookie). */
function bodyRefreshToken(body: BodyInit | undefined): string | undefined {
  if (typeof body !== 'string') return undefined;
  try {
    const rt = (JSON.parse(body) as { refreshToken?: unknown })?.refreshToken;
    return typeof rt === 'string' && rt ? rt : undefined;
  } catch {
    return undefined;
  }
}

/** Removes accessToken/refreshToken/token from auth response bodies. */
function stripTokens(json: unknown): unknown {
  const j = JSON.parse(JSON.stringify(json ?? {})) as {
    data?: Record<string, unknown>;
    accessToken?: unknown;
    refreshToken?: unknown;
    token?: unknown;
  };
  if (j.data) {
    delete j.data.accessToken;
    delete j.data.refreshToken;
    delete j.data.token;
  }
  delete j.accessToken;
  delete j.refreshToken;
  delete j.token;
  return j;
}

export {
  handle as GET,
  handle as POST,
  handle as PATCH,
  handle as PUT,
  handle as DELETE,
};
