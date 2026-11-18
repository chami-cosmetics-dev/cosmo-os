/**
 * Shop Stock Status → NO ROP tab: per Common SKU, the stock in each location that has no ROP
 * there but stock above 0 ("No ROP - With Stock", as in the Stock Health mail's Company Wise
 * table and the Dashboard's purple count). Client-safe.
 */

import {
  ONLINE_STOCK_COLUMNS,
  SHOP_STOCK_COLUMNS,
  type ShopStockCell,
  type ShopStockColumn,
  type ShopStockRow,
} from "@/lib/shop-stock-status/config";
import { SHOP_STOCK_PERCENT_OP_LABELS, type ShopStockPercentOp } from "@/lib/shop-stock-status/filters";
import { STOCK_HEALTH_STATUSES, type StockHealthStatus } from "@/lib/stock-health/config";

/** The switch at the top of the tab: the shops, or the online channels (companies). */
export type NoRopChannel = "shops" | "online";

export const NO_ROP_CHANNELS: NoRopChannel[] = ["shops", "online"];

export const NO_ROP_CHANNEL_LABELS: Record<NoRopChannel, string> = {
  shops: "Shops",
  online: "Online channels",
};

/**
 * Shops: the Shops + Online tab's columns without the combined Online column. Online channels:
 * the Online tab's columns. Rows come from the matching tab (shops / online).
 */
export const NO_ROP_CHANNEL_COLUMNS: Record<NoRopChannel, ShopStockColumn[]> = {
  shops: SHOP_STOCK_COLUMNS.filter((c) => c.key !== "online"),
  online: ONLINE_STOCK_COLUMNS,
};

export const NO_ROP_COLUMNS: ShopStockColumn[] = NO_ROP_CHANNEL_COLUMNS.shops;

export function parseNoRopChannel(value: unknown): NoRopChannel {
  return value === "online" ? "online" : "shops";
}

export type NoRopRow = {
  commonSku: string;
  itemName: string | null;
  priority: StockHealthStatus;
  /** By column key: stock when the location qualifies, else null ("-"). */
  cells: Record<string, number | null>;
  /** Sum of the qualifying cells. */
  total: number;
};

/** No ROP there and stock above 0 there. */
export function isNoRopWithStock(cell: ShopStockCell | undefined): boolean {
  return !!cell && cell.percent === null && cell.stock > 0;
}

/** The tab rows (shops or online) that are "No ROP - With Stock" in at least one of `columns`. */
export function buildNoRopRows(
  rows: ShopStockRow[],
  columns: ShopStockColumn[] = NO_ROP_COLUMNS,
): NoRopRow[] {
  const out: NoRopRow[] = [];
  for (const row of rows) {
    const cells: Record<string, number | null> = {};
    let total = 0;
    let any = false;
    for (const column of columns) {
      const cell = row.cells[column.key];
      if (isNoRopWithStock(cell)) {
        cells[column.key] = cell.stock;
        total += cell.stock;
        any = true;
      } else {
        cells[column.key] = null;
      }
    }
    if (any) {
      out.push({ commonSku: row.commonSku, itemName: row.itemName, priority: row.priority, cells, total });
    }
  }
  return out;
}

export type NoRopSort = "asc" | "desc";

export const NO_ROP_SORT_LABELS: Record<NoRopSort, string> = {
  asc: "Lowest to highest",
  desc: "Highest to lowest",
};

export type NoRopFilters = {
  search: string;
  priority: StockHealthStatus | "all";
  /** "all" or a column key. */
  location: string;
  sort: NoRopSort;
  stockOp: ShopStockPercentOp;
  stockValue: string;
};

export const DEFAULT_NO_ROP_FILTERS: NoRopFilters = {
  search: "",
  priority: "all",
  location: "all",
  sort: "asc",
  stockOp: "off",
  stockValue: "",
};

export function noRopFiltersActive(filters: NoRopFilters): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.priority !== DEFAULT_NO_ROP_FILTERS.priority ||
    filters.location !== DEFAULT_NO_ROP_FILTERS.location ||
    filters.sort !== DEFAULT_NO_ROP_FILTERS.sort ||
    filters.stockOp !== DEFAULT_NO_ROP_FILTERS.stockOp ||
    filters.stockValue.trim() !== ""
  );
}

/** An active Stock quantity filter, or null when Off / the number box is empty or invalid. */
function stockFilterOf(filters: NoRopFilters): { op: Exclude<ShopStockPercentOp, "off">; value: number } | null {
  if (filters.stockOp === "off") return null;
  const raw = filters.stockValue.trim();
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? { op: filters.stockOp, value } : null;
}

/** The value Sort and Stock quantity use: the Total, or the chosen location's stock. */
export function noRopValueOf(row: NoRopRow, location: string): number | null {
  return location === "all" ? row.total : (row.cells[location] ?? null);
}

/** Filters, then sorts by stock (ties keep Common SKU order). Does not change `rows`. */
export function applyNoRopFilters(rows: NoRopRow[], filters: NoRopFilters): NoRopRow[] {
  const q = filters.search.trim().toLowerCase();
  const stock = stockFilterOf(filters);
  const shown = rows.filter((row) => {
    if (q && !row.commonSku.toLowerCase().includes(q) && !(row.itemName ?? "").toLowerCase().includes(q)) {
      return false;
    }
    if (filters.priority !== "all" && row.priority !== filters.priority) return false;
    const value = noRopValueOf(row, filters.location);
    if (value === null) return false;
    if (stock) {
      if (stock.op === "below" && !(value < stock.value)) return false;
      if (stock.op === "above" && !(value > stock.value)) return false;
      if (stock.op === "equal" && value !== stock.value) return false;
    }
    return true;
  });
  const dir = filters.sort === "desc" ? -1 : 1;
  return shown
    .map((row, i) => ({ row, i, v: noRopValueOf(row, filters.location) ?? 0 }))
    .sort((a, b) => (a.v - b.v) * dir || a.i - b.i)
    .map(({ row }) => row);
}

/** "View = Shops · Priority = Top · Location = OGF · …" for the filtered export. */
export function noRopFilterText(filters: NoRopFilters, channel: NoRopChannel = "shops"): string {
  const columns = NO_ROP_CHANNEL_COLUMNS[channel];
  const parts: string[] = [`View = ${NO_ROP_CHANNEL_LABELS[channel]}`];
  if (filters.search.trim()) parts.push(`SKU / item contains "${filters.search.trim()}"`);
  if (filters.priority !== "all") parts.push(`Priority = ${filters.priority}`);
  if (filters.location !== "all") {
    parts.push(`Location = ${columns.find((c) => c.key === filters.location)?.label ?? filters.location}`);
  }
  const stock = stockFilterOf(filters);
  if (stock) parts.push(`Stock quantity = ${SHOP_STOCK_PERCENT_OP_LABELS[stock.op]} ${stock.value}`);
  parts.push(`Sort by stock = ${NO_ROP_SORT_LABELS[filters.sort]}`);
  return parts.join(" · ");
}

const MAX_ROWS = 20_000;

/** The rows sent by the page for "Export filtered", re-typed; null when invalid. */
export function readNoRopRows(value: unknown, columns: ShopStockColumn[] = NO_ROP_COLUMNS): NoRopRow[] | null {
  if (!Array.isArray(value) || value.length > MAX_ROWS) return null;
  const rows: NoRopRow[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.commonSku !== "string") return null;
    const source = (r.cells && typeof r.cells === "object" ? r.cells : {}) as Record<string, unknown>;
    const cells: Record<string, number | null> = {};
    let total = 0;
    for (const column of columns) {
      const v = source[column.key];
      cells[column.key] = typeof v === "number" && Number.isFinite(v) ? v : null;
      total += cells[column.key] ?? 0;
    }
    rows.push({
      commonSku: r.commonSku,
      itemName: typeof r.itemName === "string" ? r.itemName : null,
      priority: STOCK_HEALTH_STATUSES.includes(r.priority as StockHealthStatus)
        ? (r.priority as StockHealthStatus)
        : "Blank",
      cells,
      total,
    });
  }
  return rows;
}
