import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSession } from '@/lib/api/server';
import { SchoolsClient } from '@/features/admin/schools-client';

export const metadata: Metadata = { title: 'Schools' };

/** Superadmin-only page — the middleware is UX-only, so re-check server-side (§2). */
export default async function SchoolsPage() {
  const session = await getSession();
  if (session?.role !== 'superadmin') redirect('/dashboard');
  return <SchoolsClient />;
}
