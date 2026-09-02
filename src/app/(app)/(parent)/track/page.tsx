import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getSession, listOf, serverApi } from '@/lib/api/server';
import { ErrorState } from '@/components/ui/kit';
import { TrackingClient, type TrackingChild } from '@/features/tracking/tracking-client';

export const metadata: Metadata = { title: 'Live Map' };

type MapsConfig = { apiKey: string; provider?: 'google' | 'none' };

/**
 * RSC shell for parent tracking: parallel maps config (§12) + linked children
 * (§4 `GET /students?parent=me`). Both fetches are wrapped independently:
 * children failure → ErrorState; maps failure → schematic-map degradation.
 */
export default async function TrackPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Parallel — start both before awaiting either.
  const mapsPromise: Promise<MapsConfig | null> = serverApi<MapsConfig>('/config/maps').catch(() => null);
  const studentsPromise = serverApi<unknown>('/students', { parent: 'me', limit: 50 });

  let kids: TrackingChild[] = [];
  let errorMessage: string | null = null;
  try {
    kids = listOf<TrackingChild>(await studentsPromise);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Could not load your children.';
  }

  const maps = await mapsPromise;
  const apiKey = maps?.apiKey ?? '';

  if (errorMessage !== null) {
    return <ErrorState message={errorMessage} />;
  }

  return <TrackingClient apiKey={apiKey} session={session} children_={kids} />;
}
