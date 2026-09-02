'use client';

import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { http, ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { EmptyState, LinkButton } from '@/components/ui/kit';
import { AuthShell, Field } from '@/components/auth/auth-parts';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      // Contract §1: always succeeds — never reveals whether the account exists.
      await http.post('/auth/forgot-password', { email });
      setSentTo(email);
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

  if (sentTo) {
    return (
      <main className="flex min-h-dvh flex-col justify-center px-4 py-10 sm:px-6">
        <div className="reveal mx-auto w-full max-w-md">
          <div className="nu-raised rounded-2xl border bg-card p-6 sm:p-8">
            <EmptyState
              icon={MailCheck}
              title="Check your inbox"
              body={`If ${sentTo} belongs to an account, a reset link is on its way.`}
              action={<LinkButton href="/login">Back to sign in</LinkButton>}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
          autoFocus
        />

        {formError && (
          <p role="alert" className="text-sm font-medium text-rose-600 dark:text-rose-400">
            {formError}
          </p>
        )}

        <Button
          type="submit"
          className="min-h-11 w-full rounded-xl text-sm font-semibold"
          disabled={busy}
        >
          {busy ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
    </AuthShell>
  );
}
