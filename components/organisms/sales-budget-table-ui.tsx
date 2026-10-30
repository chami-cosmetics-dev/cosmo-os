"use client";

import { cn } from "@/lib/utils";
import {
  SALES_BUDGET_ALL_OPTION,
  SALES_BUDGET_NO_PRIORITY,
} from "@/lib/sales-budget/config";

/** Shared look of the live Sales Budget screen and the Saved Budgets viewer. */

export const SELECT_CLASS =
  "flex h-9 min-w-[180px] rounded-md border border-input bg-background px-3 text-sm";

export const COLUMN_COUNT = 11;

/** Options for a filter dropdown; keeps the current pick listed even if this view lacks it. */
export function withSelected(options: string[], selected: string): string[] {
  if (
    selected === SALES_BUDGET_ALL_OPTION ||
    selected === SALES_BUDGET_NO_PRIORITY
  ) {
    return options;
  }
  return options.includes(selected) ? options : [selected, ...options];
}

/** Scrolls inside the card so the header can stick. */
export const TABLE_CONTAINER_CLASS =
  "max-h-[70vh] overflow-auto rounded-md border";

/** Grid lines. `border-separate` keeps the sticky header's borders visible while scrolling. */
export const TABLE_CLASS = [
  "border-separate border-spacing-0",
  "[&_th]:border-b [&_th]:border-r [&_th:last-child]:border-r-0",
  "[&_td]:border-b [&_td]:border-r [&_td:last-child]:border-r-0",
  "[&_tbody_tr:last-child_td]:border-b-0",
].join(" ");

/** Shaded, bold headers that wrap so the table fits without horizontal scrolling. */
export const HEAD_CLASS =
  "h-auto whitespace-normal bg-muted py-2 text-center align-middle text-xs font-semibold leading-tight";
export const NUM_HEAD_CLASS = `${HEAD_CLASS} w-[90px]`;

export function formatPrice(min: number | null, max: number | null): string {
  if (min == null || max == null) return "-";
  const fmt = (v: number) =>
    v.toLocaleString("en-LK", { maximumFractionDigits: 2 });
  return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
}

/** 50 → "50%", 12.46 → "12.5%"; missing → "-". */
export function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${(Math.round(value * 10) / 10).toLocaleString("en-LK", { maximumFractionDigits: 1 })}%`;
}

export function formatNumber(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toLocaleString("en-LK", { maximumFractionDigits: 2 });
}

/**
 * Fetches a file and saves it under the server's Content-Disposition name. Throws the
 * server's error message (e.g. "The saved file could not be found").
 */
export async function downloadFile(url: string, fallbackName: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Download failed");
  }
  const blob = await res.blob();
  const name =
    res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
    fallbackName;
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

/** Month target chip, e.g. "Online total · LKR 18,000,000"; missing / 0 → "-". */
export function TargetChip({
  label,
  value,
  allowZero = false,
  highlight = false,
}: {
  label: string;
  value: number | null;
  /** Show "LKR 0" instead of "-" for a real zero (e.g. a revenue total). */
  allowZero?: boolean;
  highlight?: boolean;
}) {
  const show = value != null && (value > 0 || (allowZero && value === 0));
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-1.5",
        highlight ? "border-primary/40 bg-primary/10" : "bg-muted/40",
      )}
    >
      <div className="text-[11px] leading-tight text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums">
        {show
          ? `LKR ${value.toLocaleString("en-LK", { maximumFractionDigits: 0 })}`
          : "-"}
      </div>
    </div>
  );
}
