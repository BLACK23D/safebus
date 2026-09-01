'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { http } from '@/lib/api/client';

/**
 * Generic admin CRUD engine (docs/CONTRACTS.md §3–§6, §11).
 * GET `${path}` → { items, total, page, pages } (raw arrays tolerated),
 * POST/PATCH/DELETE then reload. All admin list pages and dialogs build on this.
 */

/** Minimal id-bearing shape every contract entity satisfies (§0: id alias of _id). */
export type Row = { id?: string; _id?: string };

type ListEnvelope<T> = {
  items?: T[];
  results?: T[];
  total?: number;
  page?: number;
  pages?: number;
};

const PAGE_SIZE = 10;

/** Stable id accessor — entities expose both `id` and `_id`. */
export function idOf<T extends Row>(row?: T | null): string {
  return row?.id ?? row?._id ?? '';
}

export function useResource<T extends Row>(path: string, baseQuery: Record<string, unknown> = {}) {
  const [rows, setRows] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQueryState] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const seqRef = useRef(0);

  // Latest-value ref so an unstable baseQuery literal never re-triggers the fetch.
  const baseRef = useRef(baseQuery);
  baseRef.current = baseQuery;

  useEffect(() => {
    let alive = true;
    const seq = ++seqRef.current;
    (async () => {
      setLoading(true);
      try {
        const data = await http.get<ListEnvelope<T> | T[]>(path, {
          ...baseRef.current,
          ...query,
          page,
          limit: PAGE_SIZE,
        });
        if (!alive || seq !== seqRef.current) return;
        if (Array.isArray(data)) {
          setRows(data);
          setTotal(data.length);
          setPages(1);
        } else {
          const items = data.items ?? data.results ?? [];
          const dTotal = data.total ?? items.length;
          const dPage = data.page ?? page;
          const dPages = Math.max(1, data.pages ?? 1);
          // Page fell off the end (e.g. after deleting the last row) → snap back.
          if (items.length === 0 && dPage > 1 && dTotal > 0 && dPages < dPage) {
            setPage(Math.max(1, dPages));
            return;
          }
          setRows(items);
          setTotal(dTotal);
          setPages(dPages);
        }
        setError(null);
      } catch (e) {
        if (!alive || seq !== seqRef.current) return;
        setRows([]);
        setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        if (alive && seq === seqRef.current) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [path, page, query, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  /** Merge a filter patch, jump back to page 1. */
  const setQuery = useCallback((patch: Record<string, unknown>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      for (const k of Object.keys(next)) {
        if (next[k] === undefined || next[k] === null || next[k] === '') delete next[k];
      }
      return next;
    });
    setPage(1);
  }, []);

  const create = useCallback(
    async (body: Record<string, unknown>) => {
      const row = await http.post<T>(path, body);
      reload();
      return row;
    },
    [path, reload],
  );

  const update = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const row = await http.patch<T>(`${path}/${id}`, body);
      reload();
      return row;
    },
    [path, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      const row = await http.del<T>(`${path}/${id}`);
      reload();
      return row;
    },
    [path, reload],
  );

  return useMemo(
    () => ({
      rows,
      page,
      pages,
      total,
      query,
      loading,
      error,
      setQuery,
      setPage,
      reload,
      create,
      update,
      remove,
      idOf: (row: T) => idOf(row),
    }),
    [rows, page, pages, total, query, loading, error, setQuery, setPage, reload, create, update, remove],
  );
}

export type Resource<T extends Row> = ReturnType<typeof useResource<T>>;
