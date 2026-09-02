import type { Metadata } from 'next';

import { DriverDashboard } from '@/features/trips/driver-dashboard';

export const metadata: Metadata = { title: 'Driver Dashboard' };

/** RSC wrapper — metadata lives here; the interactive dashboard is a client component. */
export default function DriverPage() {
  return <DriverDashboard />;
}
