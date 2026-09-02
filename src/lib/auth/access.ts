import type { Role } from './session';

export const ROLES: Role[] = ['parent', 'driver', 'admin', 'superadmin'];
export const ROLE_HOME: Record<Role, string> = {
  parent: '/track',
  driver: '/driver',
  admin: '/dashboard',
  superadmin: '/dashboard',
};

export const ROLE_LABEL: Record<Role, string> = {
  parent: 'Parent',
  driver: 'Driver',
  admin: 'School Admin',
  superadmin: 'Super Admin',
};

/** [pathRegex, allowedRoles]. First match wins. UX layer only — the backend
 *  remains the authorization boundary (UI hiding is not security). */
export const ROUTE_RULES: [RegExp, Role[]][] = [
  [/^\/(track|schedule|history)\b/, ['parent']],
  [/^\/attendance/, ['parent', 'admin', 'superadmin']],
  [/^\/driver\b/, ['driver']],
  [/^\/schools\b/, ['superadmin']],
  [/^\/(dashboard|users|edit-requests|buses|stops|trips)\b/, ['admin', 'superadmin']],
  [/^\/routes\/[^/]+/, ['parent', 'driver', 'admin', 'superadmin']], // route detail (read)
  [/^\/routes\b/, ['admin', 'superadmin']], // admin CRUD list
  [/^\/students\/[^/]+/, ['admin', 'superadmin']],
  [/^\/students\b/, ['admin', 'superadmin']],
  [/^\/(messages|emergency|notifications|profile|settings)\b/, ROLES],
];

export function canAccess(pathname: string, role: Role): boolean {
  const rule = ROUTE_RULES.find(([re]) => re.test(pathname));
  return !rule || rule[1].includes(role);
}
