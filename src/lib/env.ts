// lib/env.ts — server-only env access. No secrets are ever NEXT_PUBLIC.
// The reference backend URL; in production point BACKEND_URL at the real Express backend.
export const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:5000';

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
export const IS_SECURE = APP_URL.startsWith('https');

/**
 * Browser Socket.IO origin/path. In the sandbox the Caddy gateway forwards any request
 * carrying `?XTransformPort=` to that port, so the browser connects same-origin and the
 * backend port rides the query string. In a same-origin production deployment the BFF
 * host would proxy /socket.io directly; NEXT_PUBLIC_SOCKET_URL overrides both.
 */
export const PUBLIC_SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? '/?XTransformPort=5000';
