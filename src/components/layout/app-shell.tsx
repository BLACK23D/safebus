'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  Bus,
  BusFront,
  ChevronDown,
  LogOut,
  Moon,
  Settings,
  Sun,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { NAV, BOTTOM_NAV } from '@/lib/nav';
import { ROLE_LABEL, ROLE_HOME } from '@/lib/auth/access';
import type { AppSession } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { http } from '@/lib/api/client';
import {
  SE,
  useSocket,
  useSocketEvent,
  useSocketStatus,
  socketStatusLabel,
  useOnline,
} from '@/components/providers/socket-provider';
import { ScrollLockCleanup } from '@/components/layout/scroll-lock-cleanup';
import { toast } from 'sonner';

/**
 * Role-aware shell: desktop sidebar + mobile bottom navigation + top bar with
 * live status, unread badge, theme toggle and logout.
 */
export function AppShell({ session, children }: { session: AppSession; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { connected } = useSocket();
  const online = useOnline();
  const [unread, setUnread] = useState(0);

  // Unread notifications: reset when viewing the page, +1 per live event.
  useEffect(() => {
    let alive = true;
    const loadUnread = () => {
      http
        .get<{ unread?: number }>('/notifications/unread-count')
        .then((d) => alive && setUnread(d.unread ?? 0))
        .catch(() => {});
    };
    loadUnread();
    window.addEventListener('auth:ready', loadUnread); // refresh after in-app login
    return () => {
      alive = false;
      window.removeEventListener('auth:ready', loadUnread);
    };
  }, []);
  useEffect(() => {
    if (path.startsWith('/notifications')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnread(0);
    }
  }, [path]);
  useSocketEvent(SE.NOTIFICATION_NEW, () => setUnread((n) => n + 1), []);

  const logout = useCallback(async () => {
    try {
      await http.post('/auth/logout');
    } catch {
      /* clear locally regardless */
    }
    router.replace('/login');
    router.refresh();
  }, [router]);

  const sections = NAV.map((s) => ({
    ...s,
    items: s.items.filter(
      (i) => s.roles.includes(session.role) && (i.href !== '/schools' || session.role === 'superadmin'),
    ),
  })).filter((s) => s.items.length && s.roles.includes(session.role));

  const bottom = (BOTTOM_NAV[session.role] ?? []).filter((i) =>
    i.href === '/schools' ? session.role === 'superadmin' : true,
  );
  const isActive = (href: string) =>
    href === '/driver' ? path.startsWith('/driver') : path === href || path.startsWith(href + '/');

  return (
    <div className="min-h-dvh bg-background">
      <ScrollLockCleanup />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card/60 backdrop-blur lg:flex">
        <Link href={ROLE_HOME[session.role]} className="flex h-16 items-center gap-2.5 border-b px-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-white shadow-[0_4px_12px_-2px_rgba(25,118,210,.5)]">
            <Bus className="h-5 w-5" />
          </span>
          <span className="text-lg font-black tracking-tight">
            Safe<span className="text-brand-500">Bus</span>
          </span>
        </Link>
        <nav aria-label="Primary" className="flex-1 space-y-4 overflow-y-auto p-3 pb-24">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="px-3 pb-1.5 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                      className={cn(
                        'group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                        isActive(item.href)
                          ? 'bg-brand-500/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.href === '/notifications' && unread > 0 && (
                        <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t p-3">
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-700 dark:text-brand-300">
              {session.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{session.name}</p>
              <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[session.role]}</p>
            </div>
          </div>
          <div className="mt-1 flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-start"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              <Sun className="h-4 w-4 dark:hidden" />
              <Moon className="hidden h-4 w-4 dark:block" />
              Theme
            </Button>
            <Button variant="ghost" size="sm" onClick={logout} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur lg:hidden">
        <Link href={ROLE_HOME[session.role]} className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-white">
            <Bus className="h-4.5 w-4.5" />
          </span>
          <span className="text-base font-black tracking-tight">
            Safe<span className="text-brand-500">Bus</span>
          </span>
        </Link>
        <div className="flex-1" />
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold',
            online && connected ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400',
          )}
          title={online && connected ? 'Live — connected' : 'Reconnecting — live updates paused'}
        >
          <span className={cn('status-light', online && connected ? 'text-emerald-600' : 'text-amber-600')} />
          {socketStatusLabel(connected, online)}
        </span>
        <Link
          href="/notifications"
          className="relative grid h-11 w-11 place-items-center rounded-xl hover:bg-accent"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        >
          <BellIcon />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Link>
        {/* Radix DropdownMenu: Escape + outside-click + focus management for free (QA #24). */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Account menu">
              <ChevronDown className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <span className="block truncate text-sm font-semibold text-foreground">{session.name}</span>
              <span className="block text-xs font-normal text-muted-foreground">{ROLE_LABEL[session.role]}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <BusFront className="h-4 w-4" /> Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="h-4 w-4" /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              className="text-rose-600 focus:text-rose-700 dark:text-rose-400"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Offline ribbon */}
      {!online && (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 py-1.5 text-xs font-semibold text-amber-950 lg:top-0">
          <WifiOff className="h-3.5 w-3.5" />
          You are offline — live tracking and safety actions need a connection.
          <Wifi className="h-3.5 w-3.5 opacity-0" aria-hidden />
        </div>
      )}

      {/* Main */}
      <main
        id="main"
        className="mx-auto w-full max-w-7xl px-4 pb-28 pt-4 md:px-6 lg:pb-10 lg:pl-72 lg:pr-8 lg:pt-8"
      >
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto flex max-w-lg">
          {bottom.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-semibold transition-colors',
                    active ? 'text-brand-600 dark:text-brand-400' : 'text-muted-foreground',
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                  {item.href === '/notifications' && unread > 0 && (
                    <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-rose-500" />
                  )}
                  {active && (
                    <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-brand-500" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function BellIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
