import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/api/server';
import { AttendanceClient } from '@/features/attendance/attendance-client';

export const metadata: Metadata = { title: 'Attendance' };

export default async function AttendanceRoute() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <AttendanceClient session={session} />;
}
