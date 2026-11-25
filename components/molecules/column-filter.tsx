"use client";

import { useMemo, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Shown for empty values in the list (Excel's "(Blanks)"). */
export const BLANK_FILTER_VALUE = "(Blank)";

export type ColumnSortDir = "asc" | "desc";

/**
 * Excel-style column filter: a funnel button that opens the column's values as a checklist
 * (with search, Select all) plus A→Z / Z→A sort. `selected` null = no filter (everything shown).
 */
export function ColumnFilter({
  label,
  values,
  selected,
  onChange,
  sortDir,
  onSort,
  numeric = false,
}: {
  label: string;
  /** Distinct values in this column (blank → BLANK_FILTER_VALUE). */
  values: string[];
  selected: Set<string> | null;
  onChange: (next: Set<string> | null) => void;
  /** This column's sort, when it is the sorted column. */
  sortDir: ColumnSortDir | null;
  onSort: (dir: ColumnSortDir | null) => void;
  /** Sort the value list (and labels) as numbers: "Smallest to Largest". */
  numeric?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Working copy while the popover is open; applied on OK (like Excel).
  const [draft, setDraft] = useState<Set<string>>(new Set());

  const sortedValues = useMemo(() => {
    const list = [...new Set(values)];
    return list.sort((a, b) => {
      if (a === BLANK_FILTER_VALUE) return 1;
      if (b === BLANK_FILTER_VALUE) return -1;
      return numeric ? Number(a) - Number(b) : a.localeCompare(b, undefined, { numeric: true });
    });
  }, [values, numeric]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sortedValues.filter((v) => v.toLowerCase().includes(q)) : sortedValues;
  }, [sortedValues, query]);

  const active = selected !== null;
  const allVisibleChecked = visible.length > 0 && visible.every((v) => draft.has(v));

  function openChange(next: boolean) {
    if (next) {
      setDraft(new Set(selected ?? sortedValues));
      setQuery("");
    }
    setOpen(next);
  }

  function toggle(value: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function toggleAllVisible() {
    setDraft((prev) => {
      const next = new Set(prev);
      for (const v of visible) {
        if (allVisibleChecked) next.delete(v);
        else next.add(v);
      }
      return next;
    });
  }

  /**
   * What OK applies. With a search typed, only the ticked search results (like Excel): values
   * hidden by the search are left out, even though they were ticked when the filter opened.
   */
  const toApply = useMemo(
    () => (query.trim() ? new Set(visible.filter((v) => draft.has(v))) : draft),
    [query, visible, draft],
  );

  function apply() {
    // Everything ticked = no filter.
    const everything = sortedValues.every((v) => toApply.has(v));
    onChange(everything ? null : new Set(toApply));
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded border align-middle transition-colors",
            active || sortDir
              ? "border-primary/60 bg-primary/20 text-primary"
              : "border-transparent text-muted-foreground hover:border-border hover:bg-background/60",
          )}
          aria-label={`Filter ${label}`}
          title={active ? `${label}: filtered` : `Filter ${label}`}
        >
          <Filter className="size-3" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2 text-left text-xs font-normal">
        <div className="space-y-1 border-b pb-2">
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-muted",
              sortDir === "asc" && "bg-muted font-semibold",
            )}
            onClick={() => {
              onSort(sortDir === "asc" ? null : "asc");
              setOpen(false);
            }}
          >
            <ArrowDownAZ className="size-3.5" aria-hidden />
            {numeric ? "Sort Smallest to Largest" : "Sort A to Z"}
          </button>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-muted",
              sortDir === "desc" && "bg-muted font-semibold",
            )}
            onClick={() => {
              onSort(sortDir === "desc" ? null : "desc");
              setOpen(false);
            }}
          >
            <ArrowUpAZ className="size-3.5" aria-hidden />
            {numeric ? "Sort Largest to Smallest" : "Sort Z to A"}
          </button>
        </div>
        <div className="space-y-2 pt-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="h-7 text-xs"
          />
          <div className="max-h-56 space-y-0.5 overflow-y-auto rounded border p-1">
            <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 font-semibold hover:bg-muted">
              <input type="checkbox" checked={allVisibleChecked} onChange={toggleAllVisible} />
              {query ? "Select all search results" : "Select all"}
            </label>
            {visible.length === 0 ? (
              <p className="px-1.5 py-1 text-muted-foreground">No matches</p>
            ) : (
              visible.map((value) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-muted"
                >
                  <input type="checkbox" checked={draft.has(value)} onChange={() => toggle(value)} />
                  <span className={cn("truncate", value === BLANK_FILTER_VALUE && "italic text-muted-foreground")}>
                    {value}
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={!active}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear filter
            </Button>
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" className="h-7 px-3 text-xs" onClick={apply} disabled={toApply.size === 0}>
                OK
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
