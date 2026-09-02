import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/api/server';
import { ProfilePage } from '@/features/profile/profile-page';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfileRoute() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <ProfilePage session={session} />;
}
