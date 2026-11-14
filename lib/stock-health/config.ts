/**
 * Stock Health screen config + API types. Client-safe (no server imports).
 */

export const STOCK_HEALTH_TABS = ["summary", "out_of_stock"] as const;
export type StockHealthTab = (typeof STOCK_HEALTH_TABS)[number];

export const STOCK_HEALTH_TAB_LABELS: Record<StockHealthTab, string> = {
  summary: "SUMMARY",
  out_of_stock: "OUT OF STOCK",
};

/**
 * Weekly Summary rows, highest priority first. A Common SKU whose variants have
 * different priorities counts once, under the highest one. "Blank" = none of its
 * variants has one of the other statuses (blank or any other ERP priority); its row
 * is only shown when it has Common SKUs.
 */
export const STOCK_HEALTH_STATUSES = ["Top", "Low", "Newly Added", "Discontinue", "Blank"] as const;
export type StockHealthStatus = (typeof STOCK_HEALTH_STATUSES)[number];

/** Brands whose SKUs are not cut to a Common SKU (each SKU is its own Common SKU). */
export const STOCK_HEALTH_UNGROUPED_BRANDS = ["Golden Rose"];

/** Excluded SKUs list (Stock Health → Summary → Excluded SKUs). */
export type StockHealthExcludedSkuDto = {
  /** Common SKU, or a prefix rule ending in `*` (e.g. `BU0*`). */
  sku: string;
  createdAt: string;
  /** For a Common SKU: the prefix rule that matches it (its rows go with the rule). */
  rule: string | null;
  /** Matches `rule` but is still counted (an exception, e.g. a BU0… SKU that is no bundle). */
  countAnyway: boolean;
};

export type StockHealthStatusTotals = {
  status: StockHealthStatus;
  /** Common SKUs in this status. */
  count: number;
  /** Current stock of all variants of those Common SKUs. */
  stock: number;
};

/**
 * Weekly Summary API payload.
 * - `current`: fewer than 2 Monday snapshots yet — live ERP figures.
 * - `weekly`: the latest two Monday snapshots and the change between them.
 */
export type StockHealthWeeklySummary =
  | {
      mode: "current";
      rows: StockHealthStatusTotals[];
      fetchedAt: string;
    }
  | {
      mode: "weekly";
      previousDate: string;
      currentDate: string;
      rows: Array<{
        status: StockHealthStatus;
        previous: { count: number; stock: number };
        current: { count: number; stock: number };
        change: { count: number; stock: number };
      }>;
    };

/** ROP Status rows (Blank only when it has Common SKUs). */
export const STOCK_HEALTH_ROP_ROW_ORDER: StockHealthStatus[] = [
  "Top",
  "Newly Added",
  "Low",
  "Discontinue",
  "Blank",
];

/** Out of Stock tab: one row per Common SKU whose counted variants have no stock. */
export type StockHealthOutOfStockRow = {
  status: StockHealthStatus;
  commonSku: string;
  itemName: string | null;
  /** The variants counted in Stock Health (website drafts with no stock left out), sorted. */
  variantSkus: string[];
};

export type StockHealthOutOfStock = {
  rows: StockHealthOutOfStockRow[];
  fetchedAt: string;
};

/** Stock as % of ROP must be above this to PASS (50% or below = FAIL). */
export const STOCK_HEALTH_ROP_PASS_PERCENT = 50;

/**
 * ROP Status groups. Every Common SKU is in exactly one; `zeroStock` (total stock ≤ 0)
 * overlaps them and is not part of `total`.
 */
export type StockHealthRopCounts = {
  fail: number;
  noRopNoStock: number;
  noRopWithStock: number;
  pass: number;
  /** fail + noRopNoStock + noRopWithStock + pass. */
  total: number;
  zeroStock: number;
};

export type StockHealthRopStatus = {
  /** Current month name (Asia/Colombo), e.g. "November". */
  month: string;
  rows: Array<{ status: StockHealthStatus } & StockHealthRopCounts>;
  grandTotal: StockHealthRopCounts;
  fetchedAt: string;
};
