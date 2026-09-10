"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const ITEM_TRENDS_PAGE_SIZE = 100;

export function filterByQuery<T>(
  rows: T[],
  query: string,
  fields: (row: T) => Array<string | null | undefined>,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    fields(row).some((value) => (value ?? "").toLowerCase().includes(q)),
  );
}

export function pageRows<T>(rows: T[], page: number, pageSize = ITEM_TRENDS_PAGE_SIZE) {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
    slice: rows.slice(start, start + pageSize),
  };
}

export function usePagedRows<T>(
  rows: T[],
  fields: (row: T) => Array<string | null | undefined>,
  pageSize = ITEM_TRENDS_PAGE_SIZE,
) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => filterByQuery(rows, query, fields), [rows, query, fields]);

  useEffect(() => {
    setPage(1);
  }, [query, rows]);

  const paged = useMemo(() => pageRows(filtered, page, pageSize), [filtered, page, pageSize]);

  return { query, setQuery, ...paged, setPage };
}

type PagerProps = {
  query: string;
  onQueryChange: (value: string) => void;
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  onPage: (page: number) => void;
  searchPlaceholder?: string;
  hideSearch?: boolean;
};

export function ListPager({
  query,
  onQueryChange,
  page,
  pageCount,
  total,
  from,
  to,
  onPage,
  searchPlaceholder = "Search SKU…",
  hideSearch = false,
}: PagerProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      {hideSearch ? (
        <span />
      ) : (
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 max-w-xs"
        />
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {total === 0 ? "0 items" : `${from}–${to} of ${total}`}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Prev
        </Button>
        <span>
          {page}/{pageCount}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
