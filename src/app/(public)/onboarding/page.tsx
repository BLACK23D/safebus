'use client';

/** 3-step welcome tour (blueprint §7). Resumable: the current step is stored in
 *  localStorage under `sb.onboarding.step`, so a visitor who leaves mid-tour
 *  continues where they stopped. */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ChevronLeft, ChevronRight, MapPin, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/auth/auth-parts';
import { cn } from '@/lib/utils';

const STEP_KEY = 'sb.onboarding.step';

const STEPS = [
  {
    icon: MapPin,
    title: 'Follow the bus live',
    body: 'Watch your child’s bus move along its route in real time, with ETAs for each stop and an alert the moment it arrives.',
  },
  {
    icon: ShieldCheck,
    title: 'Verified handoffs',
    body: 'Every pickup and drop-off is confirmed with a personal verification code — the right child, off with the right person, every time.',
  },
  {
    icon: Bell,
    title: 'Instant alerts',
    body: 'Get notified when the trip starts, when the bus is 10 then 5 minutes away, and the second your child is safely handed over.',
  },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;

  // Restore a saved position. Deferred off the effect body (and off the first
  // paint) so SSR/hydration always render step 0 first.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const raw = Number(localStorage.getItem(STEP_KEY));
      if (Number.isInteger(raw) && raw >= 0 && raw < STEPS.length) setStep(raw);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  function finish() {
    localStorage.removeItem(STEP_KEY);
    router.replace('/login');
  }

  function next() {
    if (last) {
      finish();
      return;
    }
    const n = step + 1;
    localStorage.setItem(STEP_KEY, String(n));
    setStep(n);
  }

  function back() {
    if (step === 0) return;
    const n = step - 1;
    localStorage.setItem(STEP_KEY, String(n));
    setStep(n);
  }

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <main className="flex min-h-dvh flex-col justify-center px-4 py-10 sm:px-6">
      <div className="relative mx-auto w-full max-w-md">
        <button
          type="button"
          onClick={finish}
          className="absolute -top-1 right-0 flex min-h-11 items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip
        </button>

        <div className="flex flex-col items-center text-center">
          <LogoMark />
          <p className="mt-3 text-sm font-medium text-brand-600 dark:text-brand-400">SafeBus</p>
        </div>

        {/* key={step} re-runs the reveal animation on every step change.
            Steps sit on a bg-card panel (QA #20) so body text never sits on the aurora. */}
        <div
          key={step}
          className="reveal nu-raised mt-8 flex flex-col items-center rounded-2xl border bg-card p-6 text-center sm:p-8"
        >
          <span className="grid h-24 w-24 place-items-center rounded-3xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
            <Icon className="h-11 w-11" aria-hidden />
          </span>
          <h1 className="mt-6 text-2xl font-bold tracking-tight">{current.title}</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {current.body}
          </p>
        </div>

        {/* Dot progress */}
        <div className="mt-8 flex items-center justify-center gap-2" role="group" aria-label="Onboarding progress">
          {STEPS.map((s, i) => (
            <span
              key={s.title}
              aria-current={i === step ? 'step' : undefined}
              aria-label={`Step ${i + 1} of ${STEPS.length}`}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                i === step ? 'w-6 bg-brand-500' : 'w-2 bg-muted-foreground/25',
              )}
            />
          ))}
        </div>

        <div className="mt-8 flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={back}
            disabled={step === 0}
            className="min-h-11 flex-1 rounded-xl"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <Button
            type="button"
            onClick={next}
            className="min-h-11 flex-1 rounded-xl font-semibold"
          >
            {last ? 'Get started' : 'Next'} <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </main>
  );
}
