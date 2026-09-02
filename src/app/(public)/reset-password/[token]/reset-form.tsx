'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { http, ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import {
  AuthShell,
  Field,
  PASSWORD_HINT,
  PasswordField,
  TopError,
} from '@/components/auth/auth-parts';

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();

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
      // Contract §1 — the reset token lives only in the request; never rendered.
      await http.post(`/auth/reset-password/${encodeURIComponent(token)}`, { password });
      toast.success('Password updated — sign in with your new password.');
      router.replace('/login?reset=1');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fieldErrors?.password) {
          setFieldErrors(err.fieldErrors);
        } else {
          setFieldErrors({});
          setFormError(err.message);
        }
      } else {
        setFormError('Something went wrong — please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Pick something strong you don't use elsewhere">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <PasswordField
          label="New password"
          name="password"
          autoComplete="new-password"
          placeholder="Create a strong password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          hint={PASSWORD_HINT}
          required
          autoFocus
        />
        <PasswordField
          label="Confirm new password"
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
              <Loader2 className="h-4 w-4 animate-spin" /> Updating…
            </>
          ) : (
            'Update password'
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
