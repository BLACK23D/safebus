import { Suspense } from 'react';
import { ResetForm } from './reset-form';

export const metadata = { title: 'Reset password' };

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params; // Next 16: params is a Promise
  return (
    <Suspense fallback={null}>
      <ResetForm token={token} />
    </Suspense>
  );
}
