import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/api/server';
import { ChatThread } from '@/features/messaging/chat-thread';
import type { AppSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Chat' };

export default async function ChatRoute({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const session = await getSession();
  if (!session) redirect('/login');
  return <ChatThread session={session} userId={userId} />;
}
