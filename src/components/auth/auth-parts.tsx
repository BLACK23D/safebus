'use client';

/** Shared building blocks for the (public) auth flows — shell, fields, banners.
 *  Kept in one place so every flow looks and behaves identically. */

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, Bus, CheckCircle2, Eye, EyeOff, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/* ── Logo mark ──────────────────────────────────────────────────────────── */

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid h-12 w-12 place-items-center rounded-2xl bg-brand-500 text-white nu-raised',
        className,
      )}
    >
      <Bus className="h-6 w-6" />
    </span>
  );
}

/* ── Card shell (aurora backdrop comes from the (public) layout) ────────── */

export function AuthShell({
  title,
  subtitle,
  children,
  below,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  below?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="reveal nu-raised rounded-2xl border bg-card p-6 sm:p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <LogoMark />
            <h1 className="mt-4 text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </div>
        {below && <div className="mt-6">{below}</div>}
      </div>
    </main>
  );
}

/* ── Banners ────────────────────────────────────────────────────────────── */

export function TopError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function SoftBanner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success';
  children: React.ReactNode;
}) {
  const Icon = tone === 'success' ? CheckCircle2 : Info;
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm',
        tone === 'success'
          ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
          : 'border-brand-200 bg-brand-50/70 text-brand-800 dark:border-brand-900/60 dark:bg-brand-950/30 dark:text-brand-200',
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/* ── Fields ─────────────────────────────────────────────────────────────── */

type BaseFieldProps = {
  label: string;
  error?: string;
  hint?: React.ReactNode;
};

function FieldBits({
  label,
  error,
  hint,
  id,
  errorId,
  hintId,
}: BaseFieldProps & { id: string; errorId: string; hintId: string }) {
  return (
    <>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </>
  );
}

function describe(
  id: string,
  error?: string,
  hint?: React.ReactNode,
): string | undefined {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return [error ? errorId : null, hint && !error ? hintId : null].filter(Boolean).join(' ') || undefined;
}

export function Field({
  label,
  error,
  hint,
  ...inputProps
}: BaseFieldProps & Omit<React.ComponentProps<typeof Input>, 'className'>) {
  const autoId = useId();
  const id = inputProps.id ?? autoId;
  return (
    <div className="space-y-1.5">
      <FieldBits
        label={label}
        error={error}
        hint={hint}
        id={id}
        errorId={`${id}-error`}
        hintId={`${id}-hint`}
      />
      <Input
        id={id}
        className="min-h-11 rounded-xl"
        aria-invalid={error ? true : undefined}
        aria-describedby={describe(id, error, hint)}
        {...inputProps}
      />
    </div>
  );
}

export function PasswordField({
  label,
  error,
  hint,
  ...inputProps
}: BaseFieldProps & Omit<React.ComponentProps<typeof Input>, 'className' | 'type'>) {
  const autoId = useId();
  const id = inputProps.id ?? autoId;
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <FieldBits
        label={label}
        error={error}
        hint={hint}
        id={id}
        errorId={`${id}-error`}
        hintId={`${id}-hint`}
      />
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          className="min-h-11 rounded-xl pr-12"
          aria-invalid={error ? true : undefined}
          aria-describedby={describe(id, error, hint)}
          {...inputProps}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-0.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl text-muted-foreground transition-colors hover:text-foreground"
        >
          {show ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
        </button>
      </div>
    </div>
  );
}

/** Backend-enforced strong-password rule (contract §1), shown as a hint. */
export const PASSWORD_HINT = (
  <>Min 8 chars with uppercase, lowercase, number and symbol (backend-validated)</>
);

/* ── Role segmented control (login) ─────────────────────────────────────── */

export type RoleOption = {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function SegmentedRoles({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: RoleOption[];
  label: string;
}) {
  const reduced = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="nu-inset grid grid-flow-col auto-cols-fr gap-1 rounded-xl bg-muted p-1"
    >
      {options.map((opt, i) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              const dir =
                e.key === 'ArrowRight' || e.key === 'ArrowDown'
                  ? 1
                  : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                    ? -1
                    : 0;
              if (!dir) return;
              e.preventDefault();
              const next = (i + dir + options.length) % options.length;
              onChange(options[next].value);
              refs.current[next]?.focus();
            }}
            className="relative min-h-11 rounded-lg px-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {active && (
              <motion.span
                layoutId="sb-role-pill"
                aria-hidden
                className="absolute inset-0 rounded-lg border bg-card nu-raised"
                transition={
                  reduced ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 42 }
                }
              />
            )}
            <span
              className={cn(
                'relative z-10 flex items-center justify-center gap-1.5 transition-colors',
                active ? 'text-brand-600 dark:text-brand-400' : 'text-muted-foreground',
              )}
            >
              <opt.icon className="h-4 w-4" />
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Footer links row ───────────────────────────────────────────────────── */

export function AuthLinks({
  links,
}: {
  links: { href: string; text?: string; cta: string }[];
}) {
  return (
    <div className="space-y-1.5 text-center text-sm text-muted-foreground">
      {links.map((l) => (
        <p key={l.href}>
          {l.text ? `${l.text} ` : ''}
          <Link
            href={l.href}
            className="font-medium text-brand-600 underline-offset-4 hover:underline dark:text-brand-400"
          >
            {l.cta}
          </Link>
        </p>
      ))}
    </div>
  );
}
