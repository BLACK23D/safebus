import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, IS_SECURE } from '@/lib/env';
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

/** Single-flight refresh per server process (rotation-race mitigation). */
let inflight: Promise<RefreshResult> | null = null;

function refreshOnce(refreshToken: string): Promise<RefreshResult> {
  if (inflight) return inflight;
  inflight = (async (): Promise<RefreshResult> => {
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
      inflight = null;
    }, 0);
  });
  return inflight;
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
  let upstream = await forward(req, joined, at, body);

  // Single retry through a refreshed token on 401 (never for the refresh call itself).
  if (upstream.status === 401 && !/^auth\/refresh/.test(joined)) {
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
            IS_SECURE,
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
      if (tokens && newSession) applySessionCookies(res, tokens, newSession, IS_SECURE);
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
