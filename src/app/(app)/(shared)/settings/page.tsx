'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
  BellRing,
  Info,
  Monitor,
  Moon,
  Radio,
  ShieldCheck,
  Sun,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSocketStatus, socketStatusLabel, useOnline } from '@/components/providers/socket-provider';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/kit';

type ThemeChoice = 'light' | 'dark' | 'system';

const THEME_OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const socketConnected = useSocketStatus();
  const online = useOnline();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Deferred mount flag keeps the theme control hydration-safe without a
    // synchronous setState in the effect body.
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  const enablePush = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.info('Push notifications are not supported in this browser.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        toast.success('Notifications enabled', {
          description:
            'Device registration activates automatically once push credentials are configured for SafeBus.',
        });
      } else {
        toast.info('Push notifications stayed off', {
          description: 'You can enable them any time from browser site settings.',
        });
      }
    } catch {
      toast.info('This browser blocked the notification permission prompt.');
    }
  };

  const current = mounted ? (theme as ThemeChoice) : 'system';

  return (
    <div>
      <PageHeader title="Settings" subtitle="Appearance, connection health and device notifications." />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Appearance */}
        <section aria-label="Appearance" className="nu-raised rounded-2xl border bg-card p-6">
          <h2 className="font-bold">Appearance</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose how SafeBus looks on this device.</p>
          <div
            role="radiogroup"
            aria-label="Theme"
            className="nu-inset mt-4 grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1"
          >
            {THEME_OPTIONS.map((opt) => {
              const active = current === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(opt.value)}
                  className={cn(
                    'flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-2',
                    active ? 'bg-brand-500 text-white shadow-sm' : 'text-muted-foreground hover:bg-accent',
                  )}
                >
                  <opt.icon className="h-4 w-4" /> {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Connection */}
        <section aria-label="Connection" className="nu-raised rounded-2xl border bg-card p-6">
          <h2 className="font-bold">Connection</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Safety actions (emergencies, attendance, trip controls) never run offline or queue automatically.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex min-h-10 items-center gap-2 rounded-xl border bg-background/50 px-3">
              {online ? (
                <Wifi className="h-4 w-4 text-emerald-600" aria-hidden />
              ) : (
                <WifiOff className="h-4 w-4 text-rose-600" aria-hidden />
              )}
              <span className="font-medium">Internet</span>
              <span className={cn('ml-auto font-semibold', online ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                {online ? 'Online' : 'Offline'}
              </span>
            </li>
            <li className="flex min-h-10 items-center gap-2 rounded-xl border bg-background/50 px-3">
              <Radio
                className={cn('h-4 w-4', socketConnected ? 'text-emerald-600' : 'text-amber-600')}
                aria-hidden
              />
              <span className="font-medium">Live updates</span>
              <span className={cn('ml-auto font-semibold', socketConnected ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400')}>
                {socketStatusLabel(socketConnected, online)}
              </span>
            </li>
          </ul>
          {!online && (
            <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300">
              You are offline — emergency reporting and attendance verification are paused until the connection
              returns.
            </p>
          )}
        </section>

        {/* Notifications */}
        <section aria-label="Notifications" className="nu-raised rounded-2xl border bg-card p-6">
          <h2 className="flex items-center gap-2 font-bold">
            <BellRing className="h-4 w-4 text-brand-500" /> Push notifications
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Get trip alerts, attendance confirmations and emergency notices even when the app is in the
            background.
          </p>
          <Button onClick={() => void enablePush()} className="mt-4 min-h-11">
            <BellRing className="h-4 w-4" /> Enable push notifications
          </Button>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            In-app alerts always work. Push delivery on this device activates when the school enables push
            credentials.
          </p>
        </section>

        {/* About */}
        <section aria-label="About" className="nu-raised rounded-2xl border bg-card p-6">
          <h2 className="flex items-center gap-2 font-bold">
            <ShieldCheck className="h-4 w-4 text-brand-500" /> About SafeBus
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            SafeBus PWA v1.0.0 — safe school transport, tracked live.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Losing connection in a tunnel or dead zone? SafeBus keeps working with cached pages and never
            fakes safety data.
          </p>
          <Button asChild variant="outline" className="mt-4 min-h-11">
            <Link href="/offline">How offline mode works</Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
