'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Defensive cleanup for the Radix nested-modal scroll-lock leak (QA M8).
 * When Dialog+Select close out of order (e.g. Escape through nested layers, or an
 * unmount during the close animation), Radix can leave `document.body` with
 * `pointer-events: none` and `data-scroll-locked` — freezing every click until a
 * full reload. This component clears that stuck state whenever no dialog exists.
 *
 * Checks run on pathname change and on a lightweight 1 s interval; both bail out
 * immediately when a dialog is actually open, so normal Radix behavior is untouched.
 */
export function ScrollLockCleanup() {
  const pathname = usePathname();
  useEffect(() => {
    const clear = () => {
      const dialogOpen = document.querySelector(
        '[role="dialog"], [role="alertdialog"], [data-state="open"][class*="overlay"]',
      );
      if (dialogOpen) return;
      if (document.body.style.pointerEvents === 'none') document.body.style.pointerEvents = '';
      if (document.body.hasAttribute('data-scroll-locked')) document.body.removeAttribute('data-scroll-locked');
    };
    clear();
    const iv = window.setInterval(clear, 1000);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', clear);
    };
  }, [pathname]);
  return null;
}
