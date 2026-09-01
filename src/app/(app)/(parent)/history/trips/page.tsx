import type { Metadata } from 'next';

import { HistoryList } from '../history-list';

export const metadata: Metadata = { title: 'Trip History' };

/** Thin wrapper — the client feature owns fetching/pagination. */
export default function TripHistoryPage() {
  return <HistoryList kind="trips" />;
}
