'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  Camera,
  Loader2,
  LogOut,
  PencilLine,
  School,
} from 'lucide-react';
import { toast } from 'sonner';
import { http } from '@/lib/api/client';
import type { AppSession, Role } from '@/lib/auth/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ErrorState, PageHeader, PageSkeleton, StatusBadge } from '@/components/ui/kit';

type Me = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  avatar?: string;
  verified: boolean;
  status: string;
  createdAt?: string;
  school?: { id: string; name: string };
};

type Student = { id: string; name: string; grade?: string };

type EditRequest = {
  id: string;
  studentName?: string;
  field: 'name' | 'grade';
  oldValue?: string;
  newValue: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
};

function when(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ProfilePage({ session }: { session: AppSession }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const u = await http.get<Me>('/auth/me');
      setMe(u);
      setName(u.name ?? '');
      setPhone(u.phone ?? '');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your profile');
    }
  }, []);

  useEffect(() => {
    // Initial fetch deferred to a timer callback (no synchronous setState from the effect body).
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const u = await http.patch<Me>('/users/me', { name: name.trim(), phone: phone.trim() || undefined });
      setMe((prev) => (prev ? { ...prev, ...u } : prev));
      toast.success('Profile saved');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your profile');
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    const preview = URL.createObjectURL(file);
    setAvatarPreview(preview);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await http.post<{ avatarUrl: string }>('/users/me/avatar', fd);
      setMe((prev) => (prev ? { ...prev, avatar: res.avatarUrl } : prev));
      setAvatarPreview(null);
      toast.success('Profile photo updated');
      router.refresh();
    } catch (e) {
      setAvatarPreview(null);
      toast.error(e instanceof Error ? e.message : 'Could not upload the photo');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const signOut = async () => {
    setLoggingOut(true);
    try {
      await http.post('/auth/logout');
    } catch {
      /* clear locally regardless */
    }
    router.replace('/login');
    router.refresh();
  };

  return (
    <div>
      <PageHeader title="Profile" subtitle="Your account details, photo and (for parents) your children." />

      {error ? (
        <ErrorState message={error} retry={() => void load()} />
      ) : me === null ? (
        <PageSkeleton />
      ) : me ? (
        <div className="grid gap-4 lg:grid-cols-5">
          {/* Identity card */}
          <section aria-label="Account identity" className="nu-raised rounded-2xl border bg-card p-6 lg:col-span-2">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="h-20 w-20 border">
                  {avatarPreview ? (
                    <AvatarImage src={avatarPreview} alt="New profile photo preview" />
                  ) : (
                    <>
                      {me.avatar && <AvatarImage src={me.avatar} alt={`${me.name}'s profile photo`} />}
                      <AvatarFallback className="bg-brand-500/15 text-xl font-bold text-brand-700 dark:text-brand-300">
                        {me.name.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </>
                  )}
                </Avatar>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Upload profile photo"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadAvatar(f);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-2 disabled:opacity-60"
                  aria-label={uploading ? 'Uploading photo' : 'Change profile photo'}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </button>
              </div>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
                  {me.name}
                  {me.verified && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
                      title="Email verified"
                    >
                      <BadgeCheck className="h-3.5 w-3.5" /> Verified
                    </span>
                  )}
                </p>
                <p className="truncate text-sm text-muted-foreground">{me.email}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <StatusBadge status={me.role} />
                  {me.school?.name && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <School className="h-3.5 w-3.5" /> {me.school.name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <Separator className="my-5" />

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              className="space-y-4"
              aria-label="Edit profile"
            >
              <div className="space-y-1.5">
                <Label htmlFor="pf-name">Full name</Label>
                <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} className="min-h-11" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-phone">Phone</Label>
                <Input
                  id="pf-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 010 0000"
                  className="min-h-11"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Email and role are managed by the school. Member since {when(me.createdAt) || '—'}
              </p>
              <Button type="submit" disabled={!name.trim() || saving} className="min-h-11 w-full sm:w-auto">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
              </Button>
            </form>

            <Separator className="my-5" />

            <Button
              variant="outline"
              onClick={() => void signOut()}
              disabled={loggingOut}
              className="min-h-11 w-full text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
            >
              {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Sign out
            </Button>
          </section>

          {/* Parent-only: children + edit requests */}
          {session.role === 'parent' ? (
            <section aria-label="Linked children" className="lg:col-span-3">
              <ChildrenPanel onChanged={() => void load()} />
            </section>
          ) : (
            <section aria-label="Account security" className="nu-raised h-fit rounded-2xl border bg-card p-6 lg:col-span-3">
              <h2 className="font-bold">Account &amp; data</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                You are signed in as <strong className="capitalize">{me.role}</strong>
                {me.school?.name ? ` at ${me.school.name}` : ''}. Contact your school office to change your role,
                linked routes or notification preferences — school administrators manage those for you.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Photo, name and phone are the only details you can change here. All safety-critical actions are
                logged against your account.
              </p>
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ChildrenPanel({ onChanged }: { onChanged: () => void }) {
  const [children, setChildren] = useState<Student[] | null>(null);
  const [requests, setRequests] = useState<EditRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogFor, setDialogFor] = useState<Student | null>(null);

  const load = useCallback(async () => {
    try {
      const [kidsRaw, reqsRaw] = await Promise.all([
        http.get<unknown>('/students', { parent: 'me' }),
        http.get<unknown>('/edit-requests', { mine: 1, limit: 10 }),
      ]);
      // Contract §0: list endpoints may return {items:[...]} envelopes or raw arrays.
      const listOf = <T,>(d: unknown): T[] => {
        if (Array.isArray(d)) return d as T[];
        const j = d as { items?: T[]; results?: T[] } | null;
        return j?.items ?? j?.results ?? [];
      };
      setChildren(listOf<Student>(kidsRaw));
      setRequests(listOf<EditRequest>(reqsRaw));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your children');
    }
  }, []);

  useEffect(() => {
    // Initial fetch deferred to a timer callback (no synchronous setState from the effect body).
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="nu-raised rounded-2xl border bg-card p-6">
        <h2 className="font-bold">Linked children</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Names and grades can be corrected by request — an administrator reviews every change before it is
          applied.
        </p>
        {error ? (
          <div className="mt-4">
            <ErrorState message={error} retry={() => void load()} />
          </div>
        ) : children === null ? (
          <div className="mt-4 grid place-items-center py-8" aria-busy="true">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading children" />
          </div>
        ) : children.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
            No children are linked to your account yet — contact the school office.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {children.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border bg-background/50 p-3"
              >
                <span
                  aria-hidden
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cyan-500/15 text-sm font-bold text-cyan-700 dark:text-cyan-300"
                >
                  {s.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.grade ? `Grade ${s.grade}` : 'Grade not set'}</p>
                </div>
                <Button variant="outline" size="sm" className="min-h-10" onClick={() => setDialogFor(s)}>
                  <PencilLine className="h-4 w-4" /> Request edit
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="nu-raised rounded-2xl border bg-card p-6">
        <h2 className="font-bold">My requests</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your latest change requests and their review status.</p>
        {requests === null ? null : requests.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
            No change requests yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-2" aria-label="My edit requests">
            {requests.map((r) => (
              <li key={r.id} className="rounded-xl border bg-background/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">
                    {r.studentName ?? 'Child'} — {r.field === 'grade' ? 'Grade change' : r.field === 'name' ? 'Name change' : `${r.field} change`}
                  </p>
                  <StatusBadge status={r.status} />
                  <span className="ml-auto text-xs text-muted-foreground">{when(r.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.oldValue ? `“${r.oldValue}” → ` : ''}
                  “{r.newValue}”
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <EditRequestDialog
        student={dialogFor}
        onClose={() => setDialogFor(null)}
        onSubmitted={() => {
          setDialogFor(null);
          void load();
          onChanged();
        }}
      />
    </div>
  );
}

function EditRequestDialog({
  student,
  onClose,
  onSubmitted,
}: {
  student: Student | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [field, setField] = useState<'name' | 'grade'>('name');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  // Pre-fill when a child is chosen.
  useEffect(() => {
    if (student) {
      setField('name');
      setValue(student.name);
    }
  }, [student]);

  useEffect(() => {
    if (!student) {
      const t = setTimeout(() => {
        setValue('');
        setField('name');
      }, 200);
      return () => clearTimeout(t);
    }
  }, [student]);

  const submit = async () => {
    if (!student || !value.trim() || busy) return;
    setBusy(true);
    try {
      await http.post('/edit-requests', { studentId: student.id, field, newValue: value.trim() });
      toast.success('Request submitted — an administrator will review your change.');
      onSubmitted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not submit the request');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!student} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Request a profile change</DialogTitle>
          <DialogDescription>
            {student ? `Propose a corrected ${field === 'grade' ? 'grade' : 'name'} for ${student.name}.` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="er-field">Field</Label>
            <Select
              value={field}
              onValueChange={(v) => {
                setField(v as 'name' | 'grade');
                setValue(v === 'grade' ? '' : (student?.name ?? ''));
              }}
            >
              <SelectTrigger id="er-field" className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="grade">Grade</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="er-value">New value</Label>
            <Input
              id="er-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={field === 'grade' ? 'e.g. 4' : 'Full name'}
              className="min-h-11"
            />
            {field === 'grade' && (
              <p className="text-xs text-muted-foreground">Grade is a single number, e.g. 3 for third grade.</p>
            )}
          </div>
          <Button onClick={() => void submit()} disabled={!value.trim() || busy} className="min-h-11 w-full">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
