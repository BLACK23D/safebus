import {
  Bell,
  Bus,
  BusFront,
  Calendar,
  ClipboardCheck,
  Contact,
  History,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Route as RouteIcon,
  School,
  Settings,
  Siren,
  UserRound,
  Users,
} from 'lucide-react';
import type { Role } from '@/lib/auth/session';

export type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
export type NavSection = { label: string; roles: Role[]; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    label: 'Tracking',
    roles: ['parent'],
    items: [
      { href: '/track', label: 'Live Map', icon: MapPin },
      { href: '/attendance', label: 'Attendance', icon: ClipboardCheck },
      { href: '/schedule', label: 'Schedule', icon: Calendar },
      { href: '/history/trips', label: 'Trip History', icon: History },
      { href: '/history/routes', label: 'Route History', icon: RouteIcon },
    ],
  },
  {
    label: 'Driver',
    roles: ['driver'],
    items: [{ href: '/driver', label: 'Dashboard', icon: BusFront }],
  },
  {
    label: 'Administration',
    roles: ['admin', 'superadmin'],
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/users', label: 'Users', icon: Users },
      { href: '/students', label: 'Students', icon: UserRound },
      { href: '/edit-requests', label: 'Edit Requests', icon: Contact },
      { href: '/attendance', label: 'Attendance', icon: ClipboardCheck },
      { href: '/buses', label: 'Buses', icon: Bus },
      { href: '/routes', label: 'Routes', icon: RouteIcon },
      { href: '/stops', label: 'Stops', icon: MapPin },
      { href: '/trips', label: 'Trips', icon: Calendar },
      { href: '/schools', label: 'Schools', icon: School }, // superadmin-only, filtered below
    ],
  },
  {
    label: 'Account',
    roles: ['parent', 'driver', 'admin', 'superadmin'],
    items: [
      { href: '/messages', label: 'Messages', icon: MessageSquare },
      { href: '/emergency', label: 'Emergency', icon: Siren },
      { href: '/notifications', label: 'Notifications', icon: Bell },
      { href: '/profile', label: 'Profile', icon: UserRound },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

/** Mobile bottom navigation: the 4-5 highest-value destinations per role. */
export const BOTTOM_NAV: Record<Role, NavItem[]> = {
  parent: [
    { href: '/track', label: 'Track', icon: MapPin },
    { href: '/attendance', label: 'Attendance', icon: ClipboardCheck },
    { href: '/schedule', label: 'Schedule', icon: Calendar },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/notifications', label: 'Notifications', icon: Bell },
  ],
  driver: [
    { href: '/driver', label: 'Trips', icon: BusFront },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/emergency', label: 'Emergency', icon: Siren },
    { href: '/notifications', label: 'Notifications', icon: Bell },
    { href: '/profile', label: 'Profile', icon: UserRound },
  ],
  admin: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/students', label: 'Students', icon: UserRound },
    { href: '/trips', label: 'Trips', icon: Calendar },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/notifications', label: 'Notifications', icon: Bell },
  ],
  superadmin: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/schools', label: 'Schools', icon: School },
    { href: '/users', label: 'Users', icon: Users },
    { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/notifications', label: 'Notifications', icon: Bell },
  ],
};
