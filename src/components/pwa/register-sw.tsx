'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

/** Module-level guard: the controllerchange reload fires exactly once, even if
 *  this component remounts (e.g. Strict Mode double-effects, layout re-renders). */
let reloadedOnce = false;

/**
 * PWA layer (blueprint §12):
 * - Registers /sw.js on HTTPS or localhost only.
 * - Polls reg.update() every 60s; a `waiting` worker raises the update banner.
 * - Consent-gated updates: the SW never auto-activates; "Reload app" posts
 *   SKIP_WAITING to the waiting worker, and controllerchange reloads the page once.
 */
export function RegisterSW() {
  const pathname = usePathname();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

    let poll: ReturnType<typeof setInterval> | undefined;

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        const check = () => {
          // Only treat it as an UPDATE when a controller already exists
          // (first install must stay silent).
          if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        };
        check();
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          installing?.addEventListener('statechange', check);
        });
        poll = setInterval(() => {
          check();
          reg.update().catch(() => {});
        }, 60_000);
      })
      .catch(() => {
        /* registration is best-effort; the app works without a SW */
      });

    const onControllerChange = () => {
      if (reloadedOnce) return;
      reloadedOnce = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      if (poll) clearInterval(poll);
    };
  }, []);

  if (!waiting || dismissed) return null;

  const activeTrip = pathname?.startsWith('/driver/trips') ?? false;

  return (
    <div
      role="alertdialog"
      aria-labelledby="sw-update-title"
      aria-describedby="sw-update-body"
      className="fixed bottom-24 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border bg-card p-4 shadow-lg md:bottom-6 md:right-6"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400">
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p id="sw-update-title" className="text-sm font-semibold">
            Update available
          </p>
          <p id="sw-update-body" className="mt-1 text-xs text-muted-foreground">
            A new version of SafeBus is ready. Reload to apply it — it only takes a second.
          </p>
          {activeTrip && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              You have an active trip open. Finish or hand off the trip before updating.
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setDismissed(true)}>
              Later
            </Button>
            <Button size="sm" className="min-h-11" onClick={() => waiting.postMessage('SKIP_WAITING')}>
              Reload app
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
