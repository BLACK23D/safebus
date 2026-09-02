import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/api/server';
import { EmergencyPage } from '@/features/emergency/emergency-page';

export const metadata: Metadata = { title: 'Emergency' };

export default async function EmergencyRoute() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <EmergencyPage session={session} />;
}
