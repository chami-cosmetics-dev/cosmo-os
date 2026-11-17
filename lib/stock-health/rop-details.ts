/**
 * Stock Health → ROP Details tab: one row per Common SKU from the same ROP rows as the ROP Status
 * table (same exclusions, same PASS / FAIL rules), so a filtered count equals the number clicked.
 * Client-safe.
 */

import {
  parseShopStockPercentFilter,
  shopStockCellMatches,
  shopStockPercentFilterLabel,
  type ShopStockPercentOp,
} from "@/lib/shop-stock-status/filters";
import type { StockHealthRopGroup, StockHealthRopRow } from "@/lib/stock-health/calc";
import { STOCK_HEALTH_STATUSES, type StockHealthStatus } from "@/lib/stock-health/config";

export type StockHealthRopDetailsRow = {
  commonSku: string;
  itemName: string | null;
  priority: StockHealthStatus;
  status: StockHealthRopGroup;
  stock: number;
  rop: number;
  /** Stock as % of ROP; null when there is no ROP ("-"). */
  percent: number | null;
};

export type StockHealthRopDetails = {
  rows: StockHealthRopDetailsRow[];
  fetchedAt: string;
};

/** Status filter options, in the ROP Status table's column order. */
export const ROP_DETAILS_STATUSES: StockHealthRopGroup[] = ["pass", "fail", "noRopWithStock", "noRopNoStock"];

export const ROP_DETAILS_STATUS_LABELS: Record<StockHealthRopGroup, string> = {
  pass: "Pass",
  fail: "Fail",
  noRopWithStock: "No ROP - With Stock",
  noRopNoStock: "No ROP - No Stock",
};

export type RopDetailsSort = "asc" | "desc";

export const ROP_DETAILS_SORT_LABELS: Record<RopDetailsSort, string> = {
  asc: "Lowest to highest",
  desc: "Highest to lowest",
};

export type RopDetailsFilters = {
  priority: StockHealthStatus | "all";
  status: StockHealthRopGroup | "all";
  percentOp: ShopStockPercentOp;
  /** The number box, as typed (empty = Percentage filter does nothing). */
  percentValue: string;
  sort: RopDetailsSort;
};

export const DEFAULT_ROP_DETAILS_FILTERS: RopDetailsFilters = {
  priority: "all",
  status: "all",
  percentOp: "off",
  percentValue: "",
  sort: "asc",
};

/** True when anything differs from the defaults (shows the Clear button). */
export function ropDetailsFiltersActive(filters: RopDetailsFilters): boolean {
  return (
    filters.priority !== "all" ||
    filters.status !== "all" ||
    filters.percentOp !== "off" ||
    filters.percentValue.trim() !== "" ||
    filters.sort !== "asc"
  );
}

/** ROP Status rows → ROP Details rows (unsorted). */
export function buildRopDetailsRows(ropRows: StockHealthRopRow[]): StockHealthRopDetailsRow[] {
  return ropRows.map((row) => {
    const variants = [...row.variants].sort((a, b) => a.sku.localeCompare(b.sku));
    return {
      commonSku: row.commonSku,
      itemName: variants.find((v) => v.itemName)?.itemName ?? null,
      priority: row.status,
      status: row.group,
      stock: row.stock,
      rop: row.rop,
      percent: row.rop > 0 ? (row.stock / row.rop) * 100 : null,
    };
  });
}

/**
 * Filter + sort. Percentage works like Shop Stock Status (Below / Above strict, Equal to on the
 * shown 1-decimal value, "-" never matches). Rows with no % ("-") always sort last.
 */
export function applyRopDetailsFilters(
  rows: StockHealthRopDetailsRow[],
  filters: RopDetailsFilters,
): StockHealthRopDetailsRow[] {
  const percentFilter = parseShopStockPercentFilter(filters.percentOp, filters.percentValue);
  const dir = filters.sort === "desc" ? -1 : 1;
  return rows
    .filter(
      (row) =>
        (filters.priority === "all" || row.priority === filters.priority) &&
        (filters.status === "all" || row.status === filters.status) &&
        (!percentFilter || shopStockCellMatches(row, "all", percentFilter)),
    )
    .sort((a, b) => {
      if (a.percent == null || b.percent == null) {
        if (a.percent == null && b.percent == null) return a.commonSku.localeCompare(b.commonSku);
        return a.percent == null ? 1 : -1;
      }
      return (a.percent - b.percent) * dir || a.commonSku.localeCompare(b.commonSku);
    });
}

/** The filters in words, for the export. */
export function ropDetailsFilterText(filters: RopDetailsFilters): string {
  const parts: string[] = [];
  if (filters.priority !== "all") parts.push(`Priority = ${filters.priority}`);
  if (filters.status !== "all") parts.push(`Status = ${ROP_DETAILS_STATUS_LABELS[filters.status]}`);
  const percentFilter = parseShopStockPercentFilter(filters.percentOp, filters.percentValue);
  if (percentFilter) parts.push(`Percentage = ${shopStockPercentFilterLabel(percentFilter)}`);
  parts.push(`Sort by % = ${ROP_DETAILS_SORT_LABELS[filters.sort]}`);
  return parts.join(" · ");
}

/** Parse filters sent to the export route; anything unknown falls back to the default. */
export function parseRopDetailsFilters(input: unknown): RopDetailsFilters {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  return {
    priority: pick(raw.priority, ["all", ...STOCK_HEALTH_STATUSES] as const, "all"),
    status: pick(raw.status, ["all", ...ROP_DETAILS_STATUSES] as const, "all"),
    percentOp: pick(raw.percentOp, ["off", "below", "above", "equal"] as const, "off"),
    percentValue: typeof raw.percentValue === "string" ? raw.percentValue.slice(0, 20) : "",
    sort: pick(raw.sort, ["asc", "desc"] as const, "asc"),
  };
}
