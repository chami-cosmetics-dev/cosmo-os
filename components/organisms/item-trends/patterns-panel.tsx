"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PatternAnnotation } from "@/lib/item-trends/types";

type Props = {
  patterns: PatternAnnotation[];
  available: boolean;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type KindFilter = "all" | "recurring" | "one_off";

function WeekStrip({
  units,
  dominantDays,
}: {
  units: number[];
  dominantDays: number[];
}) {
  const max = Math.max(1, ...units);
  const dominant = new Set(dominantDays);

  return (
    <div className="flex items-end gap-1" role="img" aria-label="Weekday sales mix">
      {DAY_LABELS.map((label, day) => {
        const value = units[day] ?? 0;
        const heightPct = Math.max(value > 0 ? 12 : 4, Math.round((value / max) * 100));
        const isPeak = dominant.has(day);
        return (
          <div key={label} className="flex w-7 flex-col items-center gap-1 sm:w-8">
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {value > 0 ? value : ""}
            </span>
            <div className="flex h-14 w-full items-end rounded-sm bg-muted/40 px-0.5">
              <div
                className={`w-full rounded-sm transition-colors ${
                  isPeak
                    ? "bg-primary"
                    : value > 0
                      ? "bg-primary/35"
                      : "bg-transparent"
                }`}
                style={{ height: `${heightPct}%` }}
                title={`${label}: ${value}`}
              />
            </div>
            <span
              className={`text-[10px] font-medium ${
                isPeak ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PatternCard({ row }: { row: PatternAnnotation }) {
  const share =
    row.totalUnits > 0 && row.dominantDays.length > 0
      ? Math.round(
          (row.dominantDays.reduce((s, d) => s + (row.weekdayUnits[d] ?? 0), 0) /
            row.totalUnits) *
            100,
        )
      : 0;

  return (
    <article className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold tracking-tight text-foreground">{row.sku}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Peak {row.dominantDayLabels.join(" · ")}
            {share > 0 ? ` · ${share}% of sales` : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              row.recurring
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-500/15 text-amber-800 dark:text-amber-200"
            }`}
          >
            {row.recurring ? "Recurring" : "One-off"}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
            {row.totalUnits} units
          </span>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <WeekStrip units={row.weekdayUnits ?? []} dominantDays={row.dominantDays} />
      </div>
    </article>
  );
}

export function PatternsPanel({ patterns, available }: Props) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [dayFilter, setDayFilter] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    let recurring = 0;
    let oneOff = 0;
    for (const row of patterns) {
      if (row.recurring) recurring += 1;
      else oneOff += 1;
    }
    return { recurring, oneOff, all: patterns.length };
  }, [patterns]);

  const dayCounts = useMemo(() => {
    const countsByDay = Array.from({ length: 7 }, () => 0);
    for (const row of patterns) {
      for (const d of row.dominantDays) countsByDay[d] += 1;
    }
    return countsByDay;
  }, [patterns]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return patterns.filter((row) => {
      if (kind === "recurring" && !row.recurring) return false;
      if (kind === "one_off" && row.recurring) return false;
      if (dayFilter != null && !row.dominantDays.includes(dayFilter)) return false;
      if (q && !row.sku.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [patterns, kind, dayFilter, query]);

  if (!available) {
    return (
      <div className="rounded-md border border-dashed border-border px-3 py-6 text-center">
        <p className="text-sm font-medium text-foreground">Need a longer window</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Weekday spikes need From/To spanning at least 28 days so the mix can settle.
        </p>
      </div>
    );
  }

  if (patterns.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-3 py-6 text-center">
        <p className="text-sm font-medium text-foreground">No spikes found</p>
        <p className="mt-1 text-xs text-muted-foreground">
          No SKU put ≥35% of its sales on one weekday in this range.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={kind === "all" ? "default" : "outline"}
          onClick={() => setKind("all")}
        >
          All ({counts.all})
        </Button>
        <Button
          type="button"
          size="sm"
          variant={kind === "recurring" ? "default" : "outline"}
          onClick={() => setKind("recurring")}
        >
          Recurring ({counts.recurring})
        </Button>
        <Button
          type="button"
          size="sm"
          variant={kind === "one_off" ? "default" : "outline"}
          onClick={() => setKind("one_off")}
        >
          One-off ({counts.oneOff})
        </Button>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter SKU…"
          className="ml-auto h-8 max-w-[200px]"
          autoComplete="off"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="self-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Peak day
        </span>
        <Button
          type="button"
          size="sm"
          variant={dayFilter == null ? "secondary" : "ghost"}
          className="h-7 px-2 text-xs"
          onClick={() => setDayFilter(null)}
        >
          Any
        </Button>
        {DAY_LABELS.map((label, day) => (
          <Button
            key={label}
            type="button"
            size="sm"
            variant={dayFilter === day ? "secondary" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => setDayFilter((cur) => (cur === day ? null : day))}
            disabled={dayCounts[day] === 0}
          >
            {label}
            {dayCounts[day] > 0 ? (
              <span className="ml-1 tabular-nums text-muted-foreground">{dayCounts[day]}</span>
            ) : null}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No patterns match these filters.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((row) => (
            <PatternCard key={row.sku} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
