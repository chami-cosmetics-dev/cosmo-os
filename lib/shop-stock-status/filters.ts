/**
 * Shop Stock Status table: the per-cell filters (Colour, Percentage). Client-safe.
 * "-" cells (no ROP there, percent null) never match any of them.
 */

import {
  SHOP_STOCK_BAND_LABELS,
  shopStockBandOf,
  type ShopStockBand,
  type ShopStockCell,
  type ShopStockRow,
} from "@/lib/shop-stock-status/config";

/** Colour dropdown: a band, Zero stock (exactly 0%), or All. */
export type ShopStockColourFilter = ShopStockBand | "zero" | "all";

export const SHOP_STOCK_ZERO_LABEL = "Zero stock · 0%";

export function shopStockColourLabel(colour: Exclude<ShopStockColourFilter, "all">): string {
  return colour === "zero" ? SHOP_STOCK_ZERO_LABEL : SHOP_STOCK_BAND_LABELS[colour];
}

export type ShopStockPercentOp = "off" | "below" | "above" | "equal";

export const SHOP_STOCK_PERCENT_OP_LABELS: Record<ShopStockPercentOp, string> = {
  off: "Off",
  below: "Below",
  above: "Above",
  equal: "Equal to",
};

/** An active Percentage filter, or null when it is Off or the number box is empty / invalid. */
export type ShopStockPercentFilter = { op: Exclude<ShopStockPercentOp, "off">; value: number };

export function parseShopStockPercentFilter(
  op: ShopStockPercentOp,
  raw: string,
): ShopStockPercentFilter | null {
  if (op === "off") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? { op, value } : null;
}

/** "Below 25%" etc., for the filter summary / filtered export. */
export function shopStockPercentFilterLabel(filter: ShopStockPercentFilter): string {
  return `${SHOP_STOCK_PERCENT_OP_LABELS[filter.op]} ${filter.value}%`;
}

/** Rounded as the cell shows it (1 decimal), so "Equal to 25" matches a cell showing 25%. */
function shownPercent(percent: number): number {
  return Math.round(percent * 10) / 10;
}

/** One cell against the Colour and Percentage filters (both must hold). */
export function shopStockCellMatches(
  cell: ShopStockCell | undefined,
  colour: ShopStockColourFilter,
  percentFilter: ShopStockPercentFilter | null,
): boolean {
  const percent = cell?.percent;
  if (percent == null) return false;
  if (colour === "zero" && percent !== 0) return false;
  if (colour !== "all" && colour !== "zero" && shopStockBandOf(percent) !== colour) return false;
  if (percentFilter) {
    const { op, value } = percentFilter;
    if (op === "below" && !(percent < value)) return false;
    if (op === "above" && !(percent > value)) return false;
    if (op === "equal" && shownPercent(percent) !== value) return false;
  }
  return true;
}

/**
 * Whether a row passes the Location / Colour / Percentage filters. With a Colour or Percentage
 * filter on, some cell in scope (the chosen location, or every column when Location is All)
 * must match it; Location alone keeps rows with a ROP there.
 */
export function shopStockRowMatchesCells(
  row: ShopStockRow,
  columnKeys: string[],
  location: string,
  colour: ShopStockColourFilter,
  percentFilter: ShopStockPercentFilter | null,
): boolean {
  const inScope = location === "all" ? columnKeys : [location];
  if (colour !== "all" || percentFilter) {
    return inScope.some((key) => shopStockCellMatches(row.cells[key], colour, percentFilter));
  }
  if (location !== "all") return row.cells[location]?.percent != null;
  return true;
}
