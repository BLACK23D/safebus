'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { ApiError, http } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  PageSkeleton,
  StatusBadge,
} from '@/components/ui/kit';
import { idOf, type Resource, type Row } from '@/features/admin/use-resource';

/* ------------------------------- types ------------------------------- */

export type Col<T extends Row> = {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  badge?: boolean;
  className?: string;
};

export type FieldDef<T extends Row = Row> = {
  key: string;
  label: string;
  type?:
    | 'text'
    | 'email'
    | 'password'
    | 'number'
    | 'tel'
    | 'date'
    | 'datetime-local'
    | 'select'
    | 'ref'
    | 'textarea';
  options?: (string | { value: string; label: string })[];
  refPath?: string;
  labelKey?: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  /** Custom initial-value extractor (e.g. stops read location.coordinates). */
  valueFrom?: (row: T) => unknown;
};

type RefRow = Row & { name?: string; email?: string; number?: string };
type RefOption = { value: string; label: string };

const NONE = '__none__';

/* ------------------------------ helpers ------------------------------ */

function getPath(obj: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined),
      obj,
    );
}

export function humanize(v: string): string {
  return v.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function singular(title: string): string {
  if (/ies$/.test(title)) return `${title.slice(0, -3)}y`;
  if (/ses$/.test(title)) return title.slice(0, -2);
  if (/s$/.test(title)) return title.slice(0, -1);
  return title;
}

function displayValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '—';
}

function toInputDateTime(v: unknown): string {
  if (typeof v !== 'string' || !v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function optionsOf<T extends Row>(f: FieldDef<T>): RefOption[] {
  return (f.options ?? []).map((o) => (typeof o === 'string' ? { value: o, label: humanize(o) } : o));
}

function defaultFor<T extends Row>(f: FieldDef<T>, row: T | null): string {
  if (!row) return '';
  const v = f.valueFrom ? f.valueFrom(row) : getPath(row, f.key);
  if (v === null || v === undefined) return '';
  if (f.type === 'date' || f.type === 'datetime-local') return toInputDateTime(v);
  return String(v);
}

/* --------------------------- main component --------------------------- */

export function ResourceTable<T extends Row>({
  title,
  subtitle,
  res,
  cols,
  fields = [],
  canWrite = true,
  onRowClick,
  rowActions,
  toolbar,
  newLabel,
  emptyTitle,
  emptyBody,
}: {
  title: string;
  subtitle?: string;
  res: Resource<T>;
  cols: Col<T>[];
  fields?: FieldDef<T>[];
  canWrite?: boolean;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => React.ReactNode;
  toolbar?: React.ReactNode;
  newLabel?: string;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const canForm = canWrite && fields.length > 0;
  const noun = singular(title);
  const newLabelFinal = newLabel ?? `New ${noun}`;

  const [formOpen, setFormOpen] = React.useState(false);
  const [formKey, setFormKey] = React.useState(0);
  const [mode, setMode] = React.useState<'new' | 'edit'>('new');
  const [editing, setEditing] = React.useState<T | null>(null);
  const [sel, setSel] = React.useState<Record<string, string>>({});
  const [refOptions, setRefOptions] = React.useState<Record<string, RefOption[]>>({});
  const [refsLoading, setRefsLoading] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<T | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  function openNew() {
    setMode('new');
    setEditing(null);
    setFieldErrors({});
    setSel(
      Object.fromEntries(
        fields.filter((f) => f.type === 'select' || f.type === 'ref').map((f) => [f.key, '']),
      ),
    );
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }

  function openEdit(row: T) {
    setMode('edit');
    setEditing(row);
    setFieldErrors({});
    setSel(
      Object.fromEntries(
        fields
          .filter((f) => f.type === 'select' || f.type === 'ref')
          .map((f) => {
            const v = f.valueFrom ? f.valueFrom(row) : getPath(row, f.key);
            return [f.key, v === null || v === undefined ? '' : String(v)];
          }),
      ),
    );
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }

  // Fetch ref-select options each time the dialog opens (contract lists cap at 100/req).
  const refsKey = fields
    .filter((f) => f.type === 'ref' && f.refPath)
    .map((f) => `${f.key}:${f.refPath}:${f.labelKey ?? ''}`)
    .join('|');

  React.useEffect(() => {
    if (!formOpen || !refsKey) return;
    let alive = true;
    (async () => {
      setRefsLoading(true);
      const refFields = fields.filter((f) => f.type === 'ref' && f.refPath);
      const entries = await Promise.all(
        refFields.map(async (f): Promise<[string, RefOption[]]> => {
          try {
            const data = await http.get<RefRow[] | { items?: RefRow[] }>(f.refPath!, { limit: 200 });
            const items = Array.isArray(data) ? data : (data.items ?? []);
            return [
              f.key,
              items.map((r) => {
                const id = idOf(r);
                const label =
                  String(
                    (f.labelKey ? getPath(r, f.labelKey) : r.name) ?? r.email ?? r.number ?? id,
                  ) || id;
                return { value: id, label };
              }),
            ];
          } catch {
            return [f.key, []] as [string, RefOption[]];
          }
        }),
      );
      if (!alive) return;
      setRefOptions(Object.fromEntries(entries));
      setRefsLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [formOpen, refsKey]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFieldErrors({});
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    const missing: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === 'select' || f.type === 'ref') {
        const v = sel[f.key] ?? '';
        if (v && v !== NONE) body[f.key] = v;
        else if (f.required) missing[f.key] = 'This field is required';
        continue;
      }
      const raw = String(fd.get(f.key) ?? '').trim();
      if (!raw) {
        if (f.required) missing[f.key] = 'This field is required';
        continue; // omit empty optional fields (e.g. password on edit)
      }
      if (f.type === 'number') {
        const n = Number(raw);
        if (Number.isNaN(n)) missing[f.key] = 'Enter a valid number';
        else body[f.key] = n;
      } else if (f.type === 'date' || f.type === 'datetime-local') {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) missing[f.key] = 'Enter a valid date';
        else body[f.key] = d.toISOString(); // ISO strings accepted by the backend
      } else {
        body[f.key] = raw;
      }
    }
    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing);
      setBusy(false);
      return;
    }
    try {
      if (mode === 'edit' && editing) await res.update(idOf(editing), body);
      else await res.create(body);
      toast.success('Saved');
      setFormOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors);
        toast.error('Please fix the highlighted fields');
      } else {
        toast.error(err instanceof Error ? err.message : 'Request failed');
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await res.remove(idOf(deleteTarget));
      toast.success('Deleted');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  function cell(row: T, col: Col<T>): React.ReactNode {
    if (col.render) return col.render(row);
    const v = getPath(row, col.key);
    if (col.badge) {
      return typeof v === 'string' && v ? (
        <StatusBadge status={v} />
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    }
    return <span className="whitespace-nowrap">{displayValue(v)}</span>;
  }

  const empty = !res.loading && !res.error && res.rows.length === 0;
  const showError = Boolean(res.error) && res.rows.length === 0;
  const showActions = canForm || Boolean(rowActions);

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          canForm ? (
            <Button onClick={openNew} className="min-h-11">
              <Plus className="h-4 w-4" /> {newLabelFinal}
            </Button>
          ) : undefined
        }
      />
      {toolbar}

      {showError ? (
        <ErrorState message={res.error ?? 'Something went wrong'} retry={res.reload} />
      ) : res.loading && res.rows.length === 0 ? (
        <PageSkeleton />
      ) : empty ? (
        <EmptyState
          title={emptyTitle ?? `No ${title.toLowerCase()} yet`}
          body={emptyBody}
          action={
            canForm ? (
              <Button onClick={openNew} className="min-h-11">
                <Plus className="h-4 w-4" /> {newLabelFinal}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop — dense table */}
          <div
            className={cn(
              'hidden overflow-x-auto rounded-2xl border bg-card md:block',
              res.loading && 'pointer-events-none opacity-60',
            )}
            aria-busy={res.loading}
          >
            <Table>
              <TableCaption className="sr-only">{title} list</TableCaption>
              <TableHeader>
                <TableRow>
                  {cols.map((c) => (
                    <TableHead key={c.key} className={c.className}>
                      {c.label}
                    </TableHead>
                  ))}
                  {showActions && (
                    <TableHead className="w-px">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {res.rows.map((row) => (
                  <TableRow
                    key={idOf(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(onRowClick && 'cursor-pointer')}
                  >
                    {cols.map((c) => (
                      <TableCell key={c.key} className={c.className}>
                        {cell(row, c)}
                      </TableCell>
                    ))}
                    {showActions && (
                      <TableCell
                        className="whitespace-nowrap text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          {rowActions?.(row)}
                          {canForm && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11"
                                aria-label={`Edit ${noun.toLowerCase()}`}
                                onClick={() => openEdit(row)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
                                aria-label={`Delete ${noun.toLowerCase()}`}
                                onClick={() => setDeleteTarget(row)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile — stacked cards */}
          <div className={cn('space-y-3 md:hidden', res.loading && 'pointer-events-none opacity-60')}>
            {res.rows.map((row) => (
              <div
                key={idOf(row)}
                className={cn('rounded-2xl border bg-card p-4', onRowClick && 'cursor-pointer')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                <div className="space-y-2.5">
                  {cols.map((c) => (
                    <div key={c.key} className="flex items-start justify-between gap-3">
                      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {c.label}
                      </span>
                      <span className="break-words text-right text-sm font-medium">{cell(row, c)}</span>
                    </div>
                  ))}
                </div>
                {showActions && (
                  <div
                    className="mt-3 flex items-center justify-end gap-1 border-t pt-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {rowActions?.(row)}
                    {canForm && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-11 gap-1.5"
                          aria-label={`Edit ${noun.toLowerCase()}`}
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-11 gap-1.5 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
                          aria-label={`Delete ${noun.toLowerCase()}`}
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {res.pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {res.page} of {res.pages} · {res.total} total
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11"
                  aria-label="Previous page"
                  disabled={res.page <= 1 || res.loading}
                  onClick={() => res.setPage(res.page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11"
                  aria-label="Next page"
                  disabled={res.page >= res.pages || res.loading}
                  onClick={() => res.setPage(res.page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create / edit dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => !busy && setFormOpen(o)}>
        <DialogContent key={formKey} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{mode === 'edit' ? `Edit ${noun.toLowerCase()}` : newLabelFinal}</DialogTitle>
            <DialogDescription>
              {mode === 'edit'
                ? `Update the details of this ${noun.toLowerCase()}.`
                : `Fill in the details to create a new ${noun.toLowerCase()}.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
            {fields.map((f) => {
              const err = fieldErrors[f.key];
              const id = `fld-${f.key}`;
              const isChoice = f.type === 'select' || f.type === 'ref';
              const options = f.type === 'ref' ? refOptions[f.key] ?? [] : optionsOf(f);
              return (
                <div key={f.key} className={cn('grid content-start gap-1.5', f.type === 'textarea' && 'sm:col-span-2')}>
                  <Label htmlFor={isChoice ? undefined : id} className="text-sm">
                    {f.label}
                    {f.required && <span className="text-rose-500"> *</span>}
                  </Label>
                  {isChoice ? (
                    <Select
                      value={sel[f.key] ?? ''}
                      onValueChange={(v) => setSel((prev) => ({ ...prev, [f.key]: v === NONE ? '' : v }))}
                      disabled={f.type === 'ref' && refsLoading}
                    >
                      <SelectTrigger id={id} className="min-h-11 w-full" aria-label={f.label}>
                        <SelectValue placeholder={f.type === 'ref' ? 'Select…' : 'Choose…'} />
                      </SelectTrigger>
                      <SelectContent className="max-h-64 overflow-y-auto scrollbar-thin">
                        {f.type === 'ref' && <SelectItem value={NONE}>— None —</SelectItem>}
                        {options.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : f.type === 'textarea' ? (
                    <Textarea
                      id={id}
                      name={f.key}
                      rows={3}
                      required={f.required}
                      placeholder={f.placeholder}
                      defaultValue={defaultFor(f, editing)}
                    />
                  ) : (
                    <Input
                      id={id}
                      name={f.key}
                      type={f.type ?? 'text'}
                      required={f.required}
                      placeholder={f.placeholder}
                      defaultValue={defaultFor(f, editing)}
                      step={f.type === 'number' ? 'any' : undefined}
                      autoComplete={f.type === 'password' ? 'new-password' : 'off'}
                      className="min-h-11"
                    />
                  )}
                  {f.hint && !err && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                  {err && (
                    <p className="text-xs font-medium text-rose-600 dark:text-rose-400" role="alert">
                      {err}
                    </p>
                  )}
                </div>
              );
            })}
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="min-h-11" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {noun.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The {noun.toLowerCase()} will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={deleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-rose-600 text-white hover:bg-rose-700"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
