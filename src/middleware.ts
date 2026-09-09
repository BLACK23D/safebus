import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, requestIsSecure } from '@/lib/env';
import { ROLE_HOME, canAccess } from '@/lib/auth/access';
import {
  COOKIES,
  applySessionCookies,
  decodeSession,
  extractTokens,
  jwtExpired,
  type AppSession,
  type Tokens,
} from '@/lib/auth/session';

/**
 * UX-layer middleware: session refresh + role redirects. NOT the security boundary —
 * every request is authorized by the backend; admin pages re-check server-side.
 */

const PUBLIC = [
  /^\/$/,
  /^\/login/,
  /^\/register/,
  /^\/onboarding/,
  /^\/forgot-password/,
  /^\/reset-password\//,
  /^\/verify-email/,
  /^\/driver\/claim-invite/,
  /^\/offline/,
];

function setCookies(res: NextResponse, t: Tokens, s: AppSession | null, req: NextRequest) {
  applySessionCookies(res, t, s, requestIsSecure(req.headers));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC.some((re) => re.test(pathname));
  let session = decodeSession(req.cookies.get(COOKIES.session)?.value);
  let res: NextResponse | null = null;

  // Refresh an expiring access token BEFORE rendering so this same request's
  // RSC cookies() see the fresh value (request-cookie mutation pattern).
  if (session && jwtExpired(req.cookies.get(COOKIES.at)?.value)) {
    const rt = req.cookies.get(COOKIES.rt)?.value;
    if (rt) {
      try {
        const r = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
          cache: 'no-store',
        });
        if (r.ok) {
          const t = extractTokens(await r.json());
          if (t) {
            req.cookies.set(COOKIES.at, t.accessToken);
            if (t.refreshToken) req.cookies.set(COOKIES.rt, t.refreshToken);
            res = NextResponse.next({ request: { headers: req.headers } });
            setCookies(res, t, session, req);
          }
        } else {
          session = null;
        }
      } catch {
        /* backend down: page error state handles it */
      }
    } else {
      session = null;
    }
  }
  res = res ?? NextResponse.next();

  // Fully open paths: the offline shell + verification links (they must work for
  // anonymous visitors — e.g. straight after registering — and for logged-in users).
  if (pathname === '/offline' || pathname.startsWith('/verify-email')) return res;

  // Logged-in users bounce off public pages.
  if (isPublic) {
    if (session) {
      return NextResponse.redirect(new URL(ROLE_HOME[session.role], req.url));
    }
    return res;
  }

  // Protected pages require a session.
  if (!session) {
    const login = new URL('/login', req.url);
    login.searchParams.set('next', pathname);
    if (pathname !== '/') login.searchParams.set('reason', 'signin');
    return NextResponse.redirect(login);
  }

  // Role guard (UX only).
  if (!canAccess(pathname, session.role)) {
    return NextResponse.redirect(new URL(ROLE_HOME[session.role], req.url));
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|icons|manifest.webmanifest|sw.js|sitemap.xml|robots.txt|favicon.ico|logo.svg).*)',
  ],
};
