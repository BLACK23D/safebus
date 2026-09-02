'use client';

/** Email verification. With `?token=<t>` it verifies automatically on mount;
 *  without a token it explains what to do (and acknowledges `?sent=1` from
 *  registration). The token itself is never rendered or logged. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, MailCheck } from 'lucide-react';
import { http } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { PageSkeleton } from '@/components/ui/kit';
import { AuthShell, LogoMark } from '@/components/auth/auth-parts';

type VerifyState = 'idle' | 'busy' | 'ok' | 'fail';

export function VerifyClient() {
  const params = useSearchParams();
  const token = params.get('token');
  const sent = params.get('sent') === '1';

  // Token present → verification starts immediately; first paint is "busy"
  // both on the server and the client (no hydration mismatch).
  const [state, setState] = useState<VerifyState>(token ? 'busy' : 'idle');

  useEffect(() => {
    if (!token) return;
    let alive = true;
    http
      .post('/auth/verify-email', { token })
      .then(() => {
        if (alive) setState('ok');
      })
      .catch(() => {
        if (alive) setState('fail');
      });
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <AuthShell
      title={
        state === 'ok'
          ? 'Email verified'
          : state === 'fail'
            ? 'Verification failed'
            : 'Verify your email'
      }
    >
      {state === 'busy' && <PageSkeleton />}

      {state === 'ok' && (
        <div className="flex flex-col items-center text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-8 w-8" aria-hidden />
          </span>
          <p className="mt-4 text-sm text-muted-foreground">
            Your email is confirmed. Everything is set — you can sign in now.
          </p>
          <Button asChild className="mt-5 min-h-11 w-full rounded-xl font-semibold">
            <Link href="/login">Continue to sign in</Link>
          </Button>
        </div>
      )}

      {state === 'fail' && (
        <div role="alert" className="flex flex-col items-center text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="h-8 w-8" aria-hidden />
          </span>
          <p className="mt-4 text-sm text-muted-foreground">
            That link is invalid or expired. Request a new one by signing in — we'll resend
            verification if it's still needed.
          </p>
          <Button asChild variant="outline" className="mt-5 min-h-11 w-full rounded-xl">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      )}

      {state === 'idle' && (
        <div className="flex flex-col items-center text-center">
          <LogoMark className="h-16 w-16 rounded-3xl" />
          <p className="mt-4 text-sm text-muted-foreground">
            {sent
              ? 'We sent a verification link to your inbox.'
              : 'Open the link we emailed you.'}{' '}
            Didn't get it? Check your spam folder, then try signing in — we'll offer to resend.
          </p>
          <p className="mt-2 rounded-lg border border-dashed px-3 py-1.5 text-[11px] leading-snug text-muted-foreground">
            Sandbox only — this environment has no mail service, so new accounts are verified
            automatically and this page previews the real flow.
          </p>
          <Button asChild variant="outline" className="mt-5 min-h-11 w-full rounded-xl">
            <Link href="/login">
              <MailCheck className="h-4 w-4" /> Back to sign in
            </Link>
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
