import { Suspense } from 'react';
import { ClaimForm } from './claim-form';

export const metadata = { title: 'Claim your driver invite' };

export default function ClaimInvitePage() {
  return (
    <Suspense fallback={null}>
      <ClaimForm />
    </Suspense>
  );
}
