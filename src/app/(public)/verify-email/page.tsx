import { Suspense } from 'react';
import { VerifyClient } from './verify-client';

export const metadata = { title: 'Verify email' };

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyClient />
    </Suspense>
  );
}
