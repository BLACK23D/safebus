import type { Metadata } from 'next';
import Link from 'next/link';

import { serverApi } from '@/lib/api/server';
import { ErrorState } from '@/components/ui/kit';
import { Button } from '@/components/ui/button';
import { TripConsole } from '@/features/trips/trip-console';
import type { Trip } from '@/features/trips/shared';

export const metadata: Metadata = { title: 'Trip Console' };

type MapsConfig = { apiKey: string; provider?: 'google' | 'none' };

/**
 * RSC shell: parallel trip detail (populated route.stops/bus/driver/attendance, §6)
 * + maps config (§12), then hands off to the client lifecycle console.
 */
export default async function DriverTripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;

  let trip: Trip | null = null;
  let apiKey = '';
  let errorMessage: string | null = null;
  try {
    const [t, maps] = await Promise.all([
      serverApi<Trip>(`/trips/${tripId}`),
      serverApi<MapsConfig>('/config/maps'),
    ]);
    trip = t;
    apiKey = maps.apiKey;
  } catch (err) {
    // 403 (not your trip) / 404 (unknown id) / backend unreachable — degrade gracefully.
    errorMessage = err instanceof Error ? err.message : 'Could not load this trip.';
  }

  if (trip === null) {
    return (
      <div className="space-y-4">
        <ErrorState message={errorMessage ?? 'Could not load this trip.'} />
        <div className="flex justify-center">
          <Button asChild variant="outline" className="h-11">
            <Link href="/driver">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <TripConsole trip={trip} apiKey={apiKey} />;
}
