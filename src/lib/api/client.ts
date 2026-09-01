'use client';

/** Browser API client — same-origin only. Tokens never touch JS (HttpOnly cookies). */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let redirecting = false;
function onAuthExpired() {
  if (redirecting) return;
  redirecting = true;
  window.dispatchEvent(new CustomEvent('auth:expired'));
  location.assign(`/login?session=expired&next=${encodeURIComponent(location.pathname)}`);
}

/** The contract wraps everything in { success, data } (docs/CONTRACTS.md §0). */
function unwrap<T>(json: unknown): T {
  const j = json as { success?: boolean; data?: unknown; message?: string };
  if (j && typeof j === 'object' && 'success' in j && 'data' in j) return j.data as T;
  return json as T;
}

function normalize(json: unknown, status: number): ApiError {
  const body = (json ?? {}) as {
    message?: string;
    error?: { message?: string; code?: string; details?: { path?: (string | number)[]; message?: string }[] };
  };
  const e = body.error;
  const fieldErrors: Record<string, string> = {};
  for (const d of e?.details ?? []) {
    if (d?.path) fieldErrors[String(d.path[0] ?? d.path)] = d.message ?? 'Invalid value';
  }
  return new ApiError(
    status,
    e?.message ?? body.message ?? 'Request failed',
    e?.code,
    Object.keys(fieldErrors).length ? fieldErrors : undefined,
  );
}

function clean(q: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== '') out[k] = String(v);
  }
  return out;
}

/** Auth endpoints whose 401s mean "bad credentials / bad token", NOT an expired
 *  session (contract §1: invalid login → 401). Bouncing these to /login?session=expired
 *  would break the login form's own error UX. */
const AUTH_FAIL_PATH =
  /^\/auth\/(login|register|claim-invite|verify-email|resend-verification|reset-password)/;

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: isForm ? init.headers : { 'content-type': 'application/json', ...init.headers },
      ...init,
    });
  } catch {
    throw new ApiError(0, 'Network error — you appear to be offline.');
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    if (res.status === 401 && !AUTH_FAIL_PATH.test(path)) onAuthExpired();
    throw normalize(json, res.status);
  }
  return unwrap<T>(json);
}

function withQuery(path: string, q?: Record<string, unknown>): string {
  if (!q) return path;
  const qs = new URLSearchParams(clean(q)).toString();
  if (!qs) return path;
  return path + (path.includes('?') ? '&' : '?') + qs;
}

export const http = {
  get: <T,>(p: string, q?: Record<string, unknown>) => api<T>(withQuery(p, q)),
  post: <T,>(p: string, body?: unknown) =>
    api<T>(p, {
      method: 'POST',
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T,>(p: string, body?: unknown) =>
    api<T>(p, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T,>(p: string, body?: unknown) =>
    api<T>(p, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T,>(p: string) => api<T>(p, { method: 'DELETE' }),
};
