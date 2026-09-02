import { Suspense } from 'react';
import { RegisterForm } from './register-form';

export const metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
