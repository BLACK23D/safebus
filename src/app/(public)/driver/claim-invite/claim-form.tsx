'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

export function ClaimForm() {
  const router = useRouter();
  const params = useSearchParams();

  // Invitation code arrives pre-filled from the emailed link (?token=…).
  const [token, setToken] = useState(() => params.get('token') ?? '');
  const [name, setName] = useState('');
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
      // Contract §1: activates the invited driver and logs them in (BFF sets the
      // HttpOnly session cookies and strips the tokens from the response body).
      await http.post('/auth/claim-invite', { token, name, phone, password });
      window.dispatchEvent(new Event('auth:ready'));
      router.replace('/driver');
      router.refresh();
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
      title="Set up your driver account"
      subtitle="Use the invitation code from your school administrator"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field
          label="Invitation code"
          name="token"
          placeholder="INV-XXXX-XXXX"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          error={fieldErrors.token}
          required
          autoFocus={!token}
        />
        <Field
          label="Full name"
          name="name"
          autoComplete="name"
          placeholder="David Wilson"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
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
          label="Choose password"
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
              <Loader2 className="h-4 w-4 animate-spin" /> Activating…
            </>
          ) : (
            'Activate account'
          )}
        </Button>
      </form>

      <div className="mt-6">
        <AuthLinks links={[{ href: '/login', text: 'Already have an account?', cta: 'Sign in' }]} />
      </div>
    </AuthShell>
  );
}
