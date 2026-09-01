import type { Metadata } from 'next';
import { AdminDashboardClient } from '@/features/admin/dashboard-client';

export const metadata: Metadata = { title: 'Dashboard' };

/** Admin landing page — the client feature owns all data fetching (§12). */
export default function DashboardPage() {
  return <AdminDashboardClient />;
}
