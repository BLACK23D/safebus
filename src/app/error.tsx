'use client';

import { Button } from '@/components/ui/button';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="nu-raised max-w-md rounded-2xl bg-card p-8 text-center">
        <p className="text-4xl font-black text-brand-500">Oops</p>
        <p className="mt-2 font-semibold">Something went wrong</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <Button className="mt-5" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
