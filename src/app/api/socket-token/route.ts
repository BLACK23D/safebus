import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Hands the SHORT-LIVED access token to same-origin JS for the Socket.IO handshake
 * only. The refresh token is never exposed. If the backend later accepts cookie auth
 * on /socket.io, this endpoint can be deleted.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get('sb_at')?.value;
  if (!token) {
    return NextResponse.json(
      { success: false, message: 'Not authenticated' },
      { status: 401 },
    );
  }
  return NextResponse.json(
    { success: true, data: { token } },
    { headers: { 'cache-control': 'no-store' } },
  );
}
