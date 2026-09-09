import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Exchanges the browser's HttpOnly access cookie for a 60-second SOCKET-SCOPED
 * JWT (scope:'socket') minted by the backend. That token works only for the
 * Socket.IO handshake — REST routes reject it (requireAuth scope check), so a
 * leaked socket token can never be replayed against the API. The refresh token
 * is never exposed.
 */
export async function GET(req: NextRequest) {
  const at = req.cookies.get('sb_at')?.value;
  if (!at) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 },
    );
  }
  try {
    const r = await fetch(`${BACKEND_URL}/api/auth/socket-token`, {
      headers: { authorization: `Bearer ${at}`, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      return NextResponse.json(
        { success: false, message: 'Not authenticated' },
        { status: r.status },
      );
    }
    const json = (await r.json().catch(() => null)) as { data?: { token?: string } } | null;
    const token = json?.data?.token;
    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Socket token unavailable' },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { success: true, data: { token } },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { success: false, message: 'Socket token unavailable' },
      { status: 502 },
    );
  }
}
