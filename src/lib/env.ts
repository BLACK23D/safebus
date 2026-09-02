// lib/env.ts — server-only env access. No secrets are ever NEXT_PUBLIC.
// The reference backend URL; in production point BACKEND_URL at the real Express backend.
export const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:5000';

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
export const IS_SECURE = APP_URL.startsWith('https');

/**
 * Embedded (iframe) deployments — e.g. the preview panel hosting the app cross-site —
 * cannot set SameSite=Lax/Strict cookies: browsers drop them in third-party contexts,
 * so login "succeeds" but the session never sticks. Setting AUTH_COOKIE_EMBEDDED=1
 * switches the auth cookie set to CHIPS: SameSite=None; Secure; Partitioned, which
 * browsers accept in cross-site iframes (partitioned per top-level site) and treat
 * as ordinary cookies in top-level contexts. Requires a trustworthy context (HTTPS,
 * or http://localhost which browsers exempt from the Secure requirement).
 */
export const EMBEDDED_COOKIES = process.env.AUTH_COOKIE_EMBEDDED === '1';

/**
 * Browser Socket.IO origin/path. In the sandbox the Caddy gateway forwards any request
 * carrying `?XTransformPort=` to that port, so the browser connects same-origin and the
 * backend port rides the query string. In a same-origin production deployment the BFF
 * host would proxy /socket.io directly; NEXT_PUBLIC_SOCKET_URL overrides both.
 */
export const PUBLIC_SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? '/?XTransformPort=5000';
