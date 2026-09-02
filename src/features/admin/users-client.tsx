'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Copy, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ResourceTable, type Col, type FieldDef } from '@/components/admin/resource-table';
import { useResource, type Row } from '@/features/admin/use-resource';

type UserRow = Row & {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  status?: string;
  schoolId?: string | null;
  inviteToken?: string;
};

/** Copy-to-clipboard chip for invited drivers (backend returns inviteToken on invited rows). */
function InviteLink({ token }: { token: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = React.useCallback(async () => {
    const link = `${window.location.origin}/driver/claim-invite?token=${token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Invite link copied');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Could not copy the invite link');
    }
  }, [token]);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="min-h-11 gap-1.5 px-2 text-brand-600 hover:bg-brand-500/10 hover:text-brand-700 dark:text-brand-400"
      onClick={() => void copy()}
      aria-label="Copy driver invite link"
    >
      <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy link'}
    </Button>
  );
}

export function UsersClient({ isSuper }: { isSuper: boolean }) {
  const res = useResource<UserRow>('/users');
  const [role, setRole] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const [q, setQ] = React.useState('');

  const fields = React.useMemo<FieldDef<UserRow>[]>(() => {
    const base: FieldDef<UserRow>[] = [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'password', label: 'Password', type: 'password', hint: 'New users only — leave blank when editing' },
      { key: 'role', label: 'Role', type: 'select', options: ['parent', 'driver', 'admin'], required: true },
      { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive', 'suspended', 'invited'] },
    ];
    if (isSuper) base.push({ key: 'schoolId', label: 'School', type: 'ref', refPath: '/schools' });
    return base;
  }, [isSuper]);

  const cols = React.useMemo<Col<UserRow>[]>(
    () => [
      { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name ?? '—'}</span> },
      { key: 'email', label: 'Email' },
      { key: 'role', label: 'Role', badge: true },
      { key: 'status', label: 'Status', badge: true },
      { key: 'phone', label: 'Phone' },
      {
        key: 'invite',
        label: 'Invite',
        className: 'w-px',
        render: (r) =>
          r.status === 'invited' && r.inviteToken ? (
            <InviteLink token={r.inviteToken} />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  );

  // Debounced (300 ms) filter sync into the resource query.
  const filterKey = JSON.stringify({
    q: q.trim() || undefined,
    role: role === 'all' ? undefined : role,
    status: status === 'all' ? undefined : status,
  });
  const appliedRef = React.useRef<string>('{}');

  React.useEffect(() => {
    if (appliedRef.current === filterKey) return;
    const t = window.setTimeout(() => {
      if (appliedRef.current === filterKey) return;
      appliedRef.current = filterKey;
      res.setQuery(JSON.parse(filterKey) as Record<string, unknown>);
    }, 300);
    return () => window.clearTimeout(t);
  }, [filterKey, res]);

  const toolbar = (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_11rem]">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email…"
          className="min-h-11 pl-9"
          aria-label="Search users"
        />
      </div>
      <Select value={role} onValueChange={setRole}>
        <SelectTrigger className="min-h-11 w-full" aria-label="Filter by role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All roles</SelectItem>
          <SelectItem value="parent">Parent</SelectItem>
          <SelectItem value="driver">Driver</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
        </SelectContent>
      </Select>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="min-h-11 w-full" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
          <SelectItem value="suspended">Suspended</SelectItem>
          <SelectItem value="invited">Invited</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <ResourceTable
      title="Users"
      subtitle={isSuper ? 'All users across schools (superadmin)' : 'Parents, drivers and admins in your scope'}
      res={res}
      cols={cols}
      fields={fields}
      canWrite
      toolbar={toolbar}
      emptyTitle="No users found"
      emptyBody="Create a user or adjust the filters above."
    />
  );
}
