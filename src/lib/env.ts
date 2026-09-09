// lib/env.ts — server-only env access. No secrets are ever NEXT_PUBLIC.
// The reference backend URL; in production point BACKEND_URL at the real Express backend.
export const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:5000';

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
export const IS_SECURE = APP_URL.startsWith('https');

/**
 * Per-request secure derivation: an HTTPS deployment that forgets to set
 * NEXT_PUBLIC_APP_URL must still get Secure cookies (issue #6 / SEC-6). Trust the
 * first `x-forwarded-proto` entry when present, falling back to the configured URL.
 */
export function requestIsSecure(headers: Headers): boolean {
  const proto = headers.get('x-forwarded-proto');
  if (proto) return proto.split(',')[0].trim() === 'https';
  return IS_SECURE;
}

/**
 * Embedded (iframe) deployments — e.g. the preview panel hosting the app cross-site —
 * cannot set SameSite=Lax/Strict cookies: browsers drop them in third-party contexts,
 * so login "succeeds" but the session never sticks. In embedded mode the auth cookie
 * set is CHIPS: SameSite=None; Secure; Partitioned, which browsers accept in
 * cross-site iframes (partitioned per top-level site) and treat as ordinary cookies
 * in top-level contexts. Requires a trustworthy context (HTTPS, or http://localhost
 * which browsers exempt from the Secure requirement).
 *
 * Default ON: this deployment is served inside the sandbox preview iframe, and the
 * sandbox has regenerated .env before — silently reverting the flag and re-breaking
 * login (Task 9.3). First-party deployments that want Lax/Strict cookies opt out
 * explicitly with AUTH_COOKIE_EMBEDDED=0.
 */
export const EMBEDDED_COOKIES = process.env.AUTH_COOKIE_EMBEDDED !== '0';

/**
 * Browser Socket.IO origin/path. In the sandbox the Caddy gateway forwards any request
 * carrying `?XTransformPort=` to that port, so the browser connects same-origin and the
 * backend port rides the query string. In a same-origin production deployment the BFF
 * host would proxy /socket.io directly; NEXT_PUBLIC_SOCKET_URL overrides both.
 */
export const PUBLIC_SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? '/?XTransformPort=5000';
