'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { http, ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import {
  AuthLinks,
  AuthShell,
  Field,
  PASSWORD_HINT,
  PasswordField,
  TopError,
} from '@/components/auth/auth-parts';

export function RegisterForm() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const errors: Record<string, string> = {};
    if (password !== confirm) errors.confirm = 'Passwords don’t match';
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      // Contract §1: parent self-registration only.
      await http.post('/auth/register', { name, email, phone, password, role: 'parent' });
      router.replace('/verify-email?sent=1');
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors ?? {});
        if (!err.fieldErrors) setFormError(err.message);
      } else {
        setFormError('Something went wrong — please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Parents: sign up to follow your child's ride"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field
          label="Full name"
          name="name"
          autoComplete="name"
          placeholder="Maria Johnson"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          required
        />
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          required
        />
        <Field
          label="Phone"
          type="tel"
          name="phone"
          autoComplete="tel"
          inputMode="tel"
          placeholder="+1 555 010 2030"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={fieldErrors.phone}
          required
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          placeholder="Create a strong password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          hint={PASSWORD_HINT}
          required
        />
        <PasswordField
          label="Confirm password"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="Repeat your password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={fieldErrors.confirm}
          required
        />

        <TopError message={formError} />

        <Button
          type="submit"
          className="min-h-11 w-full rounded-xl text-sm font-semibold"
          disabled={busy}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Creating account…
            </>
          ) : (
            'Create account'
          )}
        </Button>
      </form>

      <div className="mt-6">
        <AuthLinks
          links={[
            { href: '/login', text: 'Already have an account?', cta: 'Sign in' },
            { href: '/driver/claim-invite', text: 'Driver with an invite?', cta: 'Claim your invite' },
          ]}
        />
      </div>
    </AuthShell>
  );
}
