import type { Metadata } from 'next';

import { HistoryList } from '../history-list';

export const metadata: Metadata = { title: 'Route History' };

/** Thin wrapper — the client feature owns fetching/pagination. */
export default function RouteHistoryPage() {
  return <HistoryList kind="routes" />;
}
