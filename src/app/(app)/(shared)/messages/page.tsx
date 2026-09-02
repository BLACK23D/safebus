import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/api/server';
import { MessagesPage } from '@/features/messaging/messages-page';

export const metadata: Metadata = { title: 'Messages' };

export default async function MessagesRoute() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <MessagesPage session={session} />;
}
