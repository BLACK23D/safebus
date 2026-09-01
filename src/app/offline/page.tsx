'use client';

import { Button } from '@/components/ui/button';
import { Bus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/** Served from the service worker cache when a navigation fails offline. */
export default function OfflinePage() {
  const [online, setOnline] = useState(false);
  useEffect(() => {
    const set = () => setOnline(navigator.onLine);
    set();
    addEventListener('online', set);
    return () => removeEventListener('online', set);
  }, []);
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-500/10 text-brand-600">
          <Bus className="h-8 w-8" />
        </span>
        <h1 className="mt-5 text-2xl font-bold">You&apos;re offline</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Live bus tracking, messages and safety actions need a connection. Nothing you did
          before is lost{online ? ' — connection restored, reload to continue.' : '.'}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Safety writes (emergencies, attendance, trip actions) are never queued for replay.
        </p>
        <Button className="mt-5" onClick={() => location.reload()} disabled={!online}>
          {online ? 'Reload' : 'Waiting for connection…'}
        </Button>
        {online && (
          <Link
            href="/"
            className="mt-3 block text-sm font-medium text-brand-600 underline-offset-4 hover:underline"
          >
            Try the home page
          </Link>
        )}
      </div>
    </div>
  );
}
