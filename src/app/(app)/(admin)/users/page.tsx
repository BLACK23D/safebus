import type { Metadata } from 'next';
import { getSession } from '@/lib/api/server';
import { UsersClient } from '@/features/admin/users-client';

export const metadata: Metadata = { title: 'Users' };

/**
 * The school field is superadmin-only (backend scope rule §2) — resolve it on the
 * server from the signed session cookie instead of a client-side /auth/me probe.
 */
export default async function UsersPage() {
  const session = await getSession();
  return <UsersClient isSuper={session?.role === 'superadmin'} />;
}
