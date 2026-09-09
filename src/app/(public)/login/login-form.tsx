'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BusFront, ChevronDown, LayoutDashboard, Loader2, UserRound } from 'lucide-react';
import { http, ApiError } from '@/lib/api/client';
import { ROLE_HOME } from '@/lib/auth/access';
import type { Role } from '@/lib/auth/session';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AuthLinks,
  AuthShell,
  Field,
  PasswordField,
  SegmentedRoles,
  SoftBanner,
  TopError,
} from '@/components/auth/auth-parts';
import { cn } from '@/lib/utils';

const ROLE_OPTIONS = [
  { value: 'parent', label: 'Parent', icon: UserRound },
  { value: 'driver', label: 'Driver', icon: BusFront },
  { value: 'admin', label: 'Admin', icon: LayoutDashboard },
] as const;

/** Sandbox convenience — seeded demo credentials (see worklog). Visually muted.
 * Gated behind NEXT_PUBLIC_DEMO_MODE=1 so production bundles carry NO credentials
 * (issue #3). The sandbox preview sets the flag in .env. */
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === '1';
const DEMO_ACCOUNTS: { pickerRole: Role; label: string; email: string; password: string }[] = DEMO_MODE
  ? [
      { pickerRole: 'parent', label: 'Parent', email: 'maria.demo@safebus.app', password: 'Parent123!' },
      { pickerRole: 'driver', label: 'Driver', email: 'david.demo@safebus.app', password: 'Driver123!' },
      { pickerRole: 'admin', label: 'School Admin', email: 'admin.demo@safebus.app', password: 'Admin123!' },
      { pickerRole: 'admin', label: 'Super Admin', email: 'super.demo@safebus.app', password: 'Super123!' },
    ]
  : [];

/** Only same-origin relative paths may be used as a post-login target. */
function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  return next;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [role, setRole] = useState<Role>('parent');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [demoOpen, setDemoOpen] = useState(false);

  const sessionExpired = params.get('session') === 'expired';
  const reasonSignin = params.get('reason') === 'signin';
  const justReset = params.get('reset') === '1';

  function fill(acc: (typeof DEMO_ACCOUNTS)[number]) {
    setRole(acc.pickerRole);
    setEmail(acc.email);
    setPassword(acc.password);
    setFormError(null);
    setFieldErrors({});
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      // Role is informational (contract §1) — the returned user is authoritative.
      const data = await http.post<{ user?: { role?: Role } }>('/auth/login', {
        email,
        password,
        role,
      });
      const finalRole = (data?.user?.role as Role | undefined) ?? role;
      window.dispatchEvent(new Event('auth:ready'));
      router.replace(safeNext(params.get('next')) ?? ROLE_HOME[finalRole] ?? ROLE_HOME[role]);
      router.refresh(); // server components re-read the session cookie
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors ?? {});
        if (!err.fieldErrors?.email && !err.fieldErrors?.password) {
          setFormError(err.status === 401 ? 'Incorrect email or password.' : err.message);
        }
      } else {
        setFormError('Something went wrong — please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to follow your child's ride">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {sessionExpired && (
          <SoftBanner>Your session expired — please sign in again.</SoftBanner>
        )}
        {!sessionExpired && reasonSignin && (
          <SoftBanner>Please sign in to continue.</SoftBanner>
        )}
        {justReset && (
          <SoftBanner tone="success">
            Password updated — sign in with your new password.
          </SoftBanner>
        )}

        <SegmentedRoles
          label="Sign in as"
          value={role}
          onChange={(v) => setRole(v as Role)}
          options={ROLE_OPTIONS.map((o) => ({ ...o }))}
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

        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          required
        />

        <TopError message={formError} />

        <Button type="submit" className="min-h-11 w-full rounded-xl text-sm font-semibold" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>

      {/* Sandbox convenience — muted, collapsible demo credentials (demo mode only). */}
      {DEMO_ACCOUNTS.length > 0 && (
      <Collapsible open={demoOpen} onOpenChange={setDemoOpen} className="mt-5">
        <CollapsibleTrigger
          className={cn(
            'flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg text-xs text-muted-foreground',
            'transition-colors hover:text-foreground',
          )}
        >
          Demo accounts
          <ChevronDown
            aria-hidden
            className={cn('h-3.5 w-3.5 transition-transform', demoOpen && 'rotate-180')}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="nu-inset mt-2 space-y-1 rounded-xl border border-dashed p-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => fill(acc)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 text-left transition-colors hover:bg-muted/70"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-medium">{acc.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{acc.email}</span>
                </span>
                <span className="shrink-0 text-xs font-medium text-brand-600 dark:text-brand-400">
                  Fill
                </span>
              </button>
            ))}
            <p className="px-2 pb-1 pt-0.5 text-[11px] leading-snug text-muted-foreground">
              Sandbox only — one click fills the form with the seeded credentials.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
      )}

      <div className="mt-6">
        <AuthLinks
          links={[
            { href: '/forgot-password', cta: 'Forgot password?' },
            { href: '/register', text: 'New to SafeBus?', cta: 'Create a parent account' },
            { href: '/driver/claim-invite', text: 'Driver with an invite?', cta: 'Claim your invite' },
          ]}
        />
      </div>
    </AuthShell>
  );
}
