import { redirect } from 'next/navigation';
import { getSession } from '@/lib/api/server';
import { ROLE_HOME } from '@/lib/auth/access';

/** Root: role-aware redirect — onboarding for guests, role home for signed-in users. */
export default async function RootPage() {
  const s = await getSession();
  redirect(s ? ROLE_HOME[s.role] : '/onboarding');
}
