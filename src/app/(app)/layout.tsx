import { redirect } from 'next/navigation';
import { getSession } from '@/lib/api/server';
import { AppShell } from '@/components/layout/app-shell';

/** Authenticated shell: server-validated session feeds the role-aware AppShell. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  return <AppShell session={session}>{children}</AppShell>;
}
