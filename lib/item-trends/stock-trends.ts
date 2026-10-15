import "server-only";

import { resolveProductPriority } from "@/lib/osf/assist-window";
import { getAllOsfErpInstances, OsfErpError, type OsfErpCredentials } from "@/lib/osf/erp-stock";

import { loadSkuCatalog, type SkuCatalogEntry } from "@/lib/item-trends/catalog";
import { parentSkuStem } from "@/lib/item-trends/sku-group";
import { computeMovementFields, type StockTrendMovementFields } from "@/lib/item-trends/stock-trend-movement";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { getLiveStockBalances, type StockBalanceRow } from "@/lib/item-trends/stock-balance-report";

/** Voucher Types that count as a genuine purchase stock-in (not a transfer, adjustment, or sales return). */
const PURCHASE_VOUCHER_TYPES = new Set(["Purchase Receipt", "Purchase Invoice"]);

/**
 * Stock Trends only shows movement driven by sales and purchases — Stock
 * Reconciliation (manual adjustments) and Stock Entry (warehouse/company
 * transfers) are excluded from the fetch entirely so they never appear as
 * noise on the chart. Current stock isn't taken from these rows — it's read
 * from the live Stock Balance report (see getLiveStockBalances), so movements
 * after a warehouse's last sale/purchase are still counted.
 */
const STOCK_TREND_VOUCHER_TYPES = ["Sales Invoice", "Purchase Receipt", "Purchase Invoice"];

/**
 * Runs `fn` over `items` with at most `limit` in flight at once, preserving
 * result order. Used to parallelize ERP batch/instance fetches without
 * opening dozens of concurrent HTTP requests against ERPNext at once.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * "Stock Trends" reads ERPNext's Stock Ledger Entry doctype live (no Postgres
 * mirror exists for it — see ErpStockSnapshot for the current-qty-only snapshot
 * this app already persists). Entries are fetched per SKU across every
 * configured ERP instance for the company and merged before computing metrics,
 * the same multi-instance pattern used by fetchBinActualQty.
 */

/**
 * Channel allocation, by warehouse name (per the business's warehouse list):
 * - Every Cosmo warehouse ("… - Cosmo", ERP 1) is ONLINE — including its shop
 *   warehouses (GCC, Kiribathgoda, Maharagama, Negombo, OGF, Pepiliyana, Cool
 *   Planet Nugegoda).
 * - Other companies (ERP 2): "Main Warehouse(s) - X" is ONLINE,
 *   "Shop Warehouse - X" is SHOP.
 * Matched by name, not an explicit list, so a new warehouse following the
 * naming convention is covered automatically.
 */
export type StockChannel = "online" | "shop" | "all";

const COSMO_WAREHOUSE = /-\s*cosmo\s*$/i;

function isShopChannelWarehouse(warehouse: string): boolean {
  return /shop warehouse/i.test(warehouse) && !COSMO_WAREHOUSE.test(warehouse);
}

function isOnlineChannelWarehouse(warehouse: string): boolean {
  return /main warehouse/i.test(warehouse) || COSMO_WAREHOUSE.test(warehouse);
}

/**
 * ERPNext `like` pre-filter for a channel, or null to fetch every warehouse.
 * Online spans two name patterns (Main Warehouse + anything "- Cosmo"), which a
 * single AND-ed `like` can't express, so it fetches unfiltered and relies on
 * warehouseMatchesChannel. Always pair this with warehouseMatchesChannel.
 */
export function warehouseFilterForChannel(channel: StockChannel | null | undefined): unknown[] | null {
  if (channel === "shop") return ["warehouse", "like", "%Shop Warehouse%"];
  return null;
}

/** The exact channel rule (see StockChannel), applied in memory. */
export function warehouseMatchesChannel(warehouse: string, channel: StockChannel | null | undefined): boolean {
  if (channel === "online") return isOnlineChannelWarehouse(warehouse);
  if (channel === "shop") return isShopChannelWarehouse(warehouse);
  return true;
}

/**
 * Per-SKU current stock from live "Stock Balance Summary - Item Wise" rows,
 * summed across the channel's warehouses. SKUs with no row are absent
 * (callers treat that as 0).
 */
export function currentStockBySku(
  rows: StockBalanceRow[],
  channel: StockChannel | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!warehouseMatchesChannel(row.warehouse, channel)) continue;
    map.set(row.sku, (map.get(row.sku) ?? 0) + row.qty);
  }
  return map;
}

export type StockTrendFilters = {
  /** Vendor/brand name, or "all". */
  brand?: string | null;
  /**
   * Inclusive, "YYYY-MM-DD". Does double duty: (1) only SKUs whose computed
   * createdDate falls in this range are returned at all, and (2)
   * unitsPurchased/unitsSold/wasRestocked are summed from ledger rows in this
   * range only, not the item's whole history.
   */
  createdDateFrom: string;
  createdDateTo: string;
  /** Online (Main Warehouse) vs Shop (Shop Warehouse) vs "all" (every warehouse, aggregated — the default). */
  channel?: StockChannel | null;
  /** Sort by createdDate. "asc" (oldest first) is the default. */
  sortOrder?: "asc" | "desc" | null;
};

/** Per-SKU metrics as computed (and cached) from the ERP fetch. */
export type StockTrendBaseRow = {
  sku: string;
  productTitle: string | null;
  brand: string | null;
  /** Effective ERP priority (erp1 wins if set, else erp2), or null if neither is set. Not filtered server-side — see getStockTrendItems. */
  priorityStatus: string | null;
  /** "YYYY-MM-DD" of the SKU's earliest In Qty ledger row (any scoped warehouse), or null if it never had one. */
  createdDate: string | null;
  /** Stock level once everything that arrived on createdDate is in (every warehouse, both ERPs) — see initialStockLevel. */
  initialStock: number;
  /**
   * Live cross-warehouse Balance Qty from a freshly generated "Stock Balance
   * Summary - Item Wise" report, scoped to the channel's warehouses.
   * computeStockTrendMetrics alone fills this from the last ledger row;
   * getStockTrendItems overrides it with the report value.
   */
  currentStock: number;
  /** Most recent date the cross-warehouse total Balance Qty hit exactly 0, across the SKU's whole history. */
  latestStockoutDate: string | null;
  /**
   * Sum of In Qty on voucher_type "Purchase Receipt" or "Purchase Invoice",
   * cancelled vouchers excluded. Excludes Stock Entry transfers, Stock
   * Reconciliation adjustments, and Sales Invoice returns.
   */
  unitsPurchased: number;
  /** Sum of Out Qty with voucher_type "Sales Invoice", rows within [createdDateFrom, createdDateTo] only. */
  unitsSold: number;
  /**
   * True if a Purchase Receipt/Purchase Invoice In Qty row within the date
   * range is the first stock-in after the cross-warehouse total Balance Qty
   * dropped to 0 or below because of a Sales Invoice Out Qty row (stock
   * transfers/adjustments/returns don't count as either the depleting or the
   * restocking event). Each stockout-then-restock cycle only flags its first
   * qualifying In Qty row.
   */
  wasRestocked: boolean;
};

/**
 * What getStockTrendItems returns: the base row plus age / sell-through /
 * movement, derived fresh on every call (not cached) so ageDays tracks today.
 */
export type StockTrendItemRow = StockTrendBaseRow & StockTrendMovementFields;

/** One Stock Ledger Entry row, normalized from the ERPNext resource API. */
export type StockLedgerEntry = {
  itemCode: string;
  warehouse: string;
  postingDate: string;
  postingAt: Date;
  /** Row creation timestamp — tie-breaks rows with an identical postingAt (same posting_date + posting_time). */
  creationAt: Date;
  inQty: number;
  outQty: number;
  balanceQty: number;
  voucherType: string;
  voucherNo: string;
  /** Which ERP instance the row came from (its label) — set by callers that chart stock per ERP. */
  erp?: string;
};

type RawStockLedgerEntry = {
  item_code?: string;
  warehouse?: string;
  posting_date?: string;
  posting_time?: string;
  actual_qty?: number | string;
  qty_after_transaction?: number | string;
  voucher_type?: string;
  voucher_no?: string;
  creation?: string;
  /** 0/1 on Frappe v13+, "No"/"Yes" on v12 — read client-side so either version works. */
  is_cancelled?: number | string;
};

/**
 * Cancelled vouchers leave their ledger rows behind (plus a reversing row on
 * v13+), so counting them would double up a cancelled-then-amended purchase.
 */
function isCancelledRow(raw: RawStockLedgerEntry): boolean {
  const v = String(raw.is_cancelled ?? "").trim().toLowerCase();
  return v === "1" || v === "yes";
}

function toNumber(value: number | string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * ERPNext's posting_time doesn't zero-pad the hour ("5:44:23", not
 * "05:44:23") — the plain `Date` constructor silently returns Invalid Date
 * for that, so pad it before parsing.
 */
function padErpTime(time: string): string {
  const match = time.match(/^(\d{1,2}):(\d{2})(:\d{2}(\.\d+)?)?$/);
  if (!match) return time;
  const [, hour, minute, seconds] = match;
  return `${hour.padStart(2, "0")}:${minute}${seconds ?? ":00"}`;
}

/** posting_date ("YYYY-MM-DD") + posting_time ("H:MM:SS[.ffffff]") → Date. */
function parsePostingAt(dateStr: string, timeStr: string | undefined): Date | null {
  const time = padErpTime(timeStr?.trim() || "00:00:00");
  const parsed = new Date(`${dateStr}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Frappe `creation` timestamp ("YYYY-MM-DD HH:MM:SS.ffffff") → Date. */
function parseCreationAt(creation: string | undefined): Date | null {
  const trimmed = creation?.trim();
  if (!trimmed) return null;
  const [datePart, timePart] = trimmed.split(" ");
  if (!datePart || !timePart) return null;
  return parsePostingAt(datePart, timePart);
}

function normalizeRow(raw: RawStockLedgerEntry): StockLedgerEntry | null {
  const itemCode = raw.item_code?.trim();
  const warehouse = raw.warehouse?.trim();
  const postingDate = raw.posting_date?.trim();
  if (!itemCode || !warehouse || !postingDate) return null;
  if (isCancelledRow(raw)) return null;

  const actualQty = toNumber(raw.actual_qty);
  const postingAt = parsePostingAt(postingDate, raw.posting_time) ?? new Date(`${postingDate}T00:00:00`);
  const creationAt = parseCreationAt(raw.creation) ?? postingAt;

  return {
    itemCode,
    warehouse,
    postingDate,
    postingAt,
    creationAt,
    inQty: actualQty > 0 ? actualQty : 0,
    outQty: actualQty < 0 ? -actualQty : 0,
    balanceQty: toNumber(raw.qty_after_transaction),
    voucherType: raw.voucher_type?.trim() ?? "",
    voucherNo: raw.voucher_no?.trim() ?? "",
  };
}

async function erpGetJson<T>(cfg: OsfErpCredentials, path: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      headers: {
        Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new OsfErpError(`ERPNext GET ${path} [${res.status}]: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new OsfErpError(`ERPNext GET ${cfg.baseUrl}${path} timed out after 20s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

const SLE_ITEM_BATCH = 50;
const SLE_PAGE_LENGTH = 500;
const SLE_MAX_PAGES = 200;

const SLE_FIELDS = [
  "item_code",
  "warehouse",
  "posting_date",
  "posting_time",
  "actual_qty",
  "qty_after_transaction",
  "voucher_type",
  "voucher_no",
  "creation",
  "is_cancelled",
];

const ERP_FETCH_CONCURRENCY = 4;

/** Paginates through every Stock Ledger Entry page for one item-code batch. */
async function fetchStockLedgerBatch(
  cfg: OsfErpCredentials,
  batch: string[],
  channel: StockChannel | null | undefined,
  batchLabel: string,
): Promise<StockLedgerEntry[]> {
  const filters: unknown[] = [
    ["item_code", "in", batch],
    ["voucher_type", "in", STOCK_TREND_VOUCHER_TYPES],
  ];
  const channelFilter = warehouseFilterForChannel(channel);
  if (channelFilter) filters.push(channelFilter);

  const rows: StockLedgerEntry[] = [];
  for (let page = 0; page < SLE_MAX_PAGES; page += 1) {
    const path =
      `/api/resource/Stock Ledger Entry?filters=${encodeURIComponent(JSON.stringify(filters))}` +
      `&fields=${encodeURIComponent(JSON.stringify(SLE_FIELDS))}` +
      `&limit_start=${page * SLE_PAGE_LENGTH}&limit_page_length=${SLE_PAGE_LENGTH}`;

    console.log(`[stock-trends] fetching ${cfg.baseUrl} batch=${batchLabel} page=${page}`);
    const json = await erpGetJson<{ data?: RawStockLedgerEntry[] }>(cfg, path);
    const pageRows = json.data ?? [];
    for (const raw of pageRows) {
      const row = normalizeRow(raw);
      if (!row) continue;
      if (!warehouseMatchesChannel(row.warehouse, channel)) continue;
      rows.push(row);
    }

    if (pageRows.length < SLE_PAGE_LENGTH) break;
    if (page === SLE_MAX_PAGES - 1) {
      throw new OsfErpError(
        `Stock Ledger Entry fetch exceeded ${SLE_MAX_PAGES * SLE_PAGE_LENGTH} rows for one item batch — raise SLE_MAX_PAGES`,
      );
    }
  }
  return rows;
}

/**
 * Full-history Stock Ledger Entry rows for the given SKUs from one ERP
 * instance. Aggregates across every warehouse by default — pass `channel` to
 * scope to Online (Main Warehouse) or Shop (Shop Warehouse) instead. No date
 * bound — callers need the SKU's whole history to find its first ever entry
 * and its true current balance.
 *
 * Item-code batches are fetched with up to `ERP_FETCH_CONCURRENCY` in flight
 * at once (pages within a batch stay sequential — you don't know how many
 * pages exist until you've fetched the previous one).
 */
export async function fetchStockLedgerEntries(
  cfg: OsfErpCredentials,
  itemCodes: string[],
  channel?: StockChannel | null,
): Promise<StockLedgerEntry[]> {
  const items = [...new Set(itemCodes.map((s) => s.trim()).filter(Boolean))];
  if (items.length === 0) return [];

  const batches: string[][] = [];
  for (let i = 0; i < items.length; i += SLE_ITEM_BATCH) {
    batches.push(items.slice(i, i + SLE_ITEM_BATCH));
  }

  const batchResults = await mapWithConcurrency(batches, ERP_FETCH_CONCURRENCY, (batch, i) =>
    fetchStockLedgerBatch(cfg, batch, channel, String(i)),
  );

  return batchResults.flat();
}

export type StockTrendComputedMetrics = Omit<
  StockTrendBaseRow,
  "sku" | "productTitle" | "brand" | "priorityStatus"
>;

/** One point in a SKU's chronological cross-warehouse stock series. */
export type StockTrendSeriesPoint = {
  /** "YYYY-MM-DD" (postingDate of the ledger row this point replays). */
  date: string;
  /** Cross-warehouse total Balance Qty immediately after this ledger row. */
  totalBalance: number;
  voucherType: string;
  /**
   * True if this is the first Purchase Receipt/Purchase Invoice In Qty row
   * after the cross-warehouse total dropped to 0 or below via a Sales
   * Invoice Out Qty row — same rule as StockTrendItemRow.wasRestocked, just
   * per-point instead of a single range-bounded boolean.
   */
  isPurchaseRestock: boolean;
  /** True if EVERY warehouse seen so far for this SKU is at 0 — a genuine, company-wide stockout. */
  isStockout: boolean;
  /** True if SOME (but not all) known warehouses are at 0 — the item is still sellable elsewhere. */
  isPartialStockout: boolean;
  /** Every known warehouse's own balance immediately after this ledger row. */
  warehouseBalances: Record<string, number>;
  /**
   * Only on the item's first stock-in row (the createdDate anchor): the stock
   * level once that day's stock-ins are all in — see initialStockLevel.
   */
  initialStock?: number;
  /** Total stock per ERP immediately after this ledger row (only when rows were tagged with `erp`). */
  erpBalances?: Record<string, number>;
  /**
   * Only on the point where an ERP received its FIRST stock: that ERP's stock
   * once all of its stock-ins that day are in (same rule as initialStockLevel,
   * per ERP). Keyed by ERP name; several ERPs can start on the same point.
   */
  erpInitialStock?: Record<string, number>;
};

/**
 * Initial stock for an item: the level before its first stock-in, plus EVERY
 * stock-in on that same day. Both ERPs' rows are merged into one series, so
 * stock arriving in ERP 1 and ERP 2 (or several warehouses) on the first day
 * all counts — and same-day sales don't reduce it.
 */
function initialStockLevel(series: { date: string; totalBalance: number; inQty: number }[], firstInIndex: number): number {
  const first = series[firstInIndex];
  let level = first.totalBalance - first.inQty;
  for (let i = firstInIndex; i < series.length && series[i].date === first.date; i += 1) {
    level += series[i].inQty;
  }
  return level;
}

/** Internal replay point — carries the raw qty split computeStockTrendMetrics still needs. */
type StockTrendReplayPoint = StockTrendSeriesPoint & {
  inQty: number;
  outQty: number;
  erp?: string;
};

/**
 * Each ERP's first stock-in: the ERP's stock before that row plus every
 * stock-in for that ERP on the same day. Returned as replay index → { erp: level }.
 */
function erpInitialStockByIndex(replay: StockTrendReplayPoint[]): Map<number, Record<string, number>> {
  const byIndex = new Map<number, Record<string, number>>();
  const seen = new Set<string>();
  replay.forEach((point, i) => {
    const erp = point.erp;
    if (erp === undefined || seen.has(erp) || point.inQty <= 0) return;
    seen.add(erp);
    let level = (point.erpBalances?.[erp] ?? 0) - point.inQty;
    for (let j = i; j < replay.length && replay[j].date === point.date; j += 1) {
      if (replay[j].erp === erp) level += replay[j].inQty;
    }
    byIndex.set(i, { ...byIndex.get(i), [erp]: level });
  });
  return byIndex;
}

/**
 * Shared chronological replay of one SKU's full ledger history (any order,
 * any warehouse mix already merged — Main + Shop Warehouse per branch are
 * different sales channels for the same physical stock, not separate pools).
 *
 * Balance Qty from ERPNext is a per-warehouse running total, not a company
 * total, so this tracks each warehouse's own latest balance to get a true
 * cross-warehouse total at every point in time, and flags the same
 * restock/stockout events computeStockTrendMetrics and the SKU series
 * endpoint both need — computed once here so neither has to duplicate the
 * merge logic.
 */
function replayStockTrendSeries(entries: StockLedgerEntry[]): StockTrendReplayPoint[] {
  const sorted = [...entries].sort(
    (a, b) => a.postingAt.getTime() - b.postingAt.getTime() || a.creationAt.getTime() - b.creationAt.getTime(),
  );

  const warehouseBalance = new Map<string, number>();
  // A warehouse only counts toward stockout/partial-stockout once it has actually
  // carried stock (balance > 0) at some point — a warehouse that's never been
  // stocked yet hasn't "run out," it just hasn't received its first stock-in,
  // so it shouldn't flag as empty.
  const everStocked = new Set<string>();
  let total = 0;
  let awaitingRestock = false;
  // Per-ERP running totals, kept apart from the warehouse map above so a
  // warehouse name that exists in both ERPs can't mix their balances here.
  const erpWarehouseBalance = new Map<string, Map<string, number>>();
  const erpTotal = new Map<string, number>();

  return sorted.map((row) => {
    const prevWarehouseBalance = warehouseBalance.get(row.warehouse) ?? 0;
    warehouseBalance.set(row.warehouse, row.balanceQty);
    total = total - prevWarehouseBalance + row.balanceQty;
    if (row.balanceQty > 0) everStocked.add(row.warehouse);

    if (row.erp !== undefined) {
      const balances = erpWarehouseBalance.get(row.erp) ?? new Map<string, number>();
      const prev = balances.get(row.warehouse) ?? 0;
      balances.set(row.warehouse, row.balanceQty);
      erpWarehouseBalance.set(row.erp, balances);
      erpTotal.set(row.erp, (erpTotal.get(row.erp) ?? 0) - prev + row.balanceQty);
    }

    const warehouseBalances = Object.fromEntries(
      [...warehouseBalance].filter(([warehouse]) => everStocked.has(warehouse)),
    );
    const zeroCount = Object.values(warehouseBalances).filter((v) => v === 0).length;
    const warehouseCount = Object.keys(warehouseBalances).length;
    // Full stockout = every warehouse that's ever carried this SKU is now at 0;
    // partial = some but not all — the item is still sellable somewhere else.
    // warehouseCount === 0 means nothing has ever been stocked yet, which isn't
    // a stockout either (there's nothing to be "out" of).
    const isStockout = warehouseCount > 0 && zeroCount === warehouseCount;
    const isPartialStockout = zeroCount > 0 && zeroCount < warehouseCount;

    let isPurchaseRestock = false;
    if (row.outQty > 0 && row.voucherType === "Sales Invoice" && isStockout) {
      awaitingRestock = true;
    } else if (row.inQty > 0 && PURCHASE_VOUCHER_TYPES.has(row.voucherType) && awaitingRestock) {
      awaitingRestock = false;
      isPurchaseRestock = true;
    }

    return {
      date: row.postingDate,
      totalBalance: total,
      voucherType: row.voucherType,
      isPurchaseRestock,
      isStockout,
      isPartialStockout,
      warehouseBalances,
      ...(erpTotal.size > 0 ? { erpBalances: Object.fromEntries(erpTotal) } : {}),
      inQty: row.inQty,
      outQty: row.outQty,
      ...(row.erp !== undefined ? { erp: row.erp } : {}),
    };
  });
}

/**
 * A SKU's full chronological cross-warehouse stock series — one point per
 * ledger row, in order. No date bound: callers who need a range (the Stock
 * Trends table) filter/aggregate this themselves; the SKU trend chart wants
 * the whole history.
 */
export function computeStockTrendSeries(entries: StockLedgerEntry[]): StockTrendSeriesPoint[] {
  const replay = replayStockTrendSeries(entries);
  // Same anchor computeStockTrendMetrics uses for createdDate/initialStock.
  const firstInIndex = replay.findIndex((p) => p.inQty > 0);
  const initialStock = firstInIndex >= 0 ? initialStockLevel(replay, firstInIndex) : undefined;
  const erpInitial = erpInitialStockByIndex(replay);
  return replay.map(
    ({ date, totalBalance, voucherType, isPurchaseRestock, isStockout, isPartialStockout, warehouseBalances, erpBalances }, i) => ({
      date,
      totalBalance,
      voucherType,
      isPurchaseRestock,
      isStockout,
      isPartialStockout,
      warehouseBalances,
      ...(i === firstInIndex ? { initialStock } : {}),
      ...(erpBalances ? { erpBalances } : {}),
      ...(erpInitial.has(i) ? { erpInitialStock: erpInitial.get(i) } : {}),
    }),
  );
}

/**
 * Pure computation over one SKU's full ledger history, built on the same
 * replay `computeStockTrendSeries` uses.
 *
 * `range` bounds the wasRestocked trigger only — everything else
 * (createdDate/initialStock/currentStock/latestStockoutDate/unitsPurchased/
 * unitsSold) always looks at the whole history, so these numbers stay
 * accurate regardless of which date range is selected in the UI.
 */
export function computeStockTrendMetrics(
  entries: StockLedgerEntry[],
  range: { fromYmd: string; toYmd: string },
): StockTrendComputedMetrics {
  const series = replayStockTrendSeries(entries);

  if (series.length === 0) {
    return {
      createdDate: null,
      initialStock: 0,
      currentStock: 0,
      latestStockoutDate: null,
      unitsPurchased: 0,
      unitsSold: 0,
      wasRestocked: false,
    };
  }

  const inRange = (ymd: string) => ymd >= range.fromYmd && ymd <= range.toYmd;

  const firstInIndex = series.findIndex((p) => p.inQty > 0);
  const anchor = firstInIndex >= 0 ? series[firstInIndex] : series[0];
  const createdDate = anchor.date;
  const initialStock = firstInIndex >= 0 ? initialStockLevel(series, firstInIndex) : anchor.totalBalance;

  const lastPoint = series[series.length - 1];
  const currentStock = lastPoint.totalBalance;

  // "Stocked out" means genuinely out of stock by the END of a day, not a
  // momentary intraday dip that recovered before the day was over (e.g. a
  // warehouse hits 0 then gets restocked a few hours later the same day) —
  // matches the day-bucketed chart, which already only flags a day's last
  // point. series is chronological, so the last write per date wins.
  const lastPointPerDay = new Map<string, StockTrendReplayPoint>();
  for (const point of series) lastPointPerDay.set(point.date, point);

  let latestStockoutDate: string | null = null;
  for (const [date, point] of [...lastPointPerDay].reverse()) {
    if (point.isStockout) {
      latestStockoutDate = date;
      break;
    }
  }

  let unitsPurchased = 0;
  let unitsSold = 0;
  let wasRestocked = false;

  for (const point of series) {
    // Gross In Qty only — matches a manual In Qty sum from the Stock Ledger.
    // Netting Out Qty on these types was tried and under-counted badly.
    if (point.inQty > 0 && PURCHASE_VOUCHER_TYPES.has(point.voucherType)) {
      unitsPurchased += point.inQty;
    }
    if (point.outQty > 0 && point.voucherType === "Sales Invoice") {
      unitsSold += point.outQty;
    }
    if (inRange(point.date) && point.isPurchaseRestock) wasRestocked = true;
  }

  return {
    createdDate,
    initialStock,
    currentStock,
    latestStockoutDate,
    unitsPurchased,
    unitsSold,
    wasRestocked,
  };
}

function passesBrandFilter(brand: string | null, wanted: string | null | undefined): boolean {
  const w = (wanted ?? "").trim().toLowerCase();
  if (!w || w === "all") return true;
  return (brand ?? "").trim().toLowerCase() === w;
}

/**
 * In-memory cache for getStockTrendItems, keyed by the inputs that actually
 * change the ERP fetch (company/date-range/brand/channel — NOT priority,
 * which is no longer filtered server-side, and NOT sortOrder, which is
 * cheap to re-apply on every call). Per-process only (no shared/distributed
 * cache) — good enough to absorb repeat requests within the same warm
 * server instance for a few minutes, not a durable cache.
 */
const STOCK_TREND_CACHE_TTL_MS = 5 * 60 * 1000;
const stockTrendCache = new Map<string, { expiresAt: number; rows: StockTrendBaseRow[] }>();

function stockTrendCacheKey(companyId: string, filters: StockTrendFilters): string {
  const brand = (filters.brand ?? "all").trim().toLowerCase() || "all";
  const channel = filters.channel ?? "all";
  return [companyId, filters.createdDateFrom, filters.createdDateTo, brand, channel].join("|");
}

/** The actual candidate-resolution + ERP-fetch-and-merge work, uncached. */
async function computeStockTrendRows(
  companyId: string,
  filters: StockTrendFilters,
): Promise<StockTrendBaseRow[]> {
  const fromYmd = filters.createdDateFrom;
  const toYmd = filters.createdDateTo;

  const catalog = await loadSkuCatalog(companyId);
  const candidates = [...catalog.values()].filter((entry) => passesBrandFilter(entry.brand, filters.brand));
  console.log(
    `[stock-trends] getStockTrendItems: ${candidates.length} candidates (brand=${filters.brand ?? "all"}, range=${fromYmd}..${toYmd})`,
  );
  if (candidates.length === 0) return [];

  const instances = await getAllOsfErpInstances(companyId);
  if (instances.length === 0) return [];

  const skus = candidates.map((c) => c.sku);
  const [perInstanceRows, balanceRows] = await Promise.all([
    Promise.all(instances.map((instance) => fetchStockLedgerEntries(instance.cfg, skus, filters.channel))),
    getLiveStockBalances(companyId),
  ]);
  const liveStock = currentStockBySku(balanceRows, filters.channel);

  const bySku = new Map<string, StockLedgerEntry[]>();
  for (const instanceRows of perInstanceRows) {
    for (const row of instanceRows) {
      const list = bySku.get(row.itemCode);
      if (list) list.push(row);
      else bySku.set(row.itemCode, [row]);
    }
  }

  const result: StockTrendBaseRow[] = [];
  for (const candidate of candidates) {
    const ledger = bySku.get(candidate.sku);
    if (!ledger || ledger.length === 0) continue;

    const metrics = computeStockTrendMetrics(ledger, { fromYmd, toYmd });
    if (!metrics.createdDate || metrics.createdDate < fromYmd || metrics.createdDate > toYmd) continue;

    result.push({
      sku: candidate.sku,
      productTitle: candidate.title,
      brand: candidate.brand,
      priorityStatus: resolveProductPriority(candidate.erp1ProductPriority, candidate.erp2ProductPriority),
      ...metrics,
      currentStock: liveStock.get(candidate.sku) ?? 0,
    });
  }
  return result;
}

/**
 * Server-side data layer for the Stock Trends panel. Resolves candidate SKUs
 * from the local catalog (brand filter only — priority is resolved onto each
 * row but no longer filtered here, see StockTrendItemRow.priorityStatus),
 * then fetches each one's full Stock Ledger Entry history live from every
 * configured ERP instance for the company, merges it, and computes the
 * per-SKU metrics.
 *
 * Rows are only returned for SKUs whose computed createdDate falls within
 * [createdDateFrom, createdDateTo] — SKUs with no qualifying stock-in history
 * are omitted.
 *
 * `bypassCache` forces a fresh ERP fetch (the panel's Refresh button) and
 * replaces the cached entry with the new result.
 */
export async function getStockTrendItems(
  companyId: string,
  filters: StockTrendFilters,
  options: { bypassCache?: boolean } = {},
): Promise<StockTrendItemRow[]> {
  const started = Date.now();
  const cacheKey = stockTrendCacheKey(companyId, filters);
  const cached = stockTrendCache.get(cacheKey);
  const cacheHit = !options.bypassCache && Boolean(cached && cached.expiresAt > Date.now());

  const result = cacheHit && cached
    ? cached.rows
    : await computeStockTrendRows(companyId, filters);

  if (!cacheHit) {
    stockTrendCache.set(cacheKey, { expiresAt: Date.now() + STOCK_TREND_CACHE_TTL_MS, rows: result });
  }

  console.log(
    `[stock-trends] getStockTrendItems: ${result.length} rows, ${cacheHit ? "cache hit" : "computed"}, ${Date.now() - started}ms`,
  );

  const todayYmd = formatAppIsoDate(new Date());
  const sortDir = filters.sortOrder === "desc" ? -1 : 1;
  return result
    .map((row) => ({ ...row, ...computeMovementFields(row, todayYmd) }))
    .sort(
      (a, b) => sortDir * (a.createdDate ?? "").localeCompare(b.createdDate ?? "") || a.sku.localeCompare(b.sku),
    );
}

/**
 * What the Trend view needs to tell the user WHY a searched SKU isn't in the
 * table — compared client-side against the top Priority / Brand / Created
 * date filters, since this lookup itself ignores all of them.
 */
export type StockTrendItemInfo = {
  /** False when the SKU isn't in the local item catalog at all (typo, archived, never synced). */
  inCatalog: boolean;
  productTitle: string | null;
  brand: string | null;
  /** Same effective priority the table shows (erp1 wins, else erp2). */
  priorityStatus: string | null;
  /** Same createdDate rule the table uses (earliest In Qty ledger row), or null with no stock-in history. */
  createdDate: string | null;
};

function stockTrendItemInfo(
  entry: SkuCatalogEntry | undefined,
  entries: StockLedgerEntry[],
): StockTrendItemInfo {
  return {
    inCatalog: Boolean(entry),
    productTitle: entry?.title ?? null,
    brand: entry?.brand ?? null,
    priorityStatus: entry ? resolveProductPriority(entry.erp1ProductPriority, entry.erp2ProductPriority) : null,
    // The range only bounds wasRestocked, which isn't used here.
    createdDate: computeStockTrendMetrics(entries, { fromYmd: "", toYmd: "" }).createdDate,
  };
}

/**
 * Full chronological cross-warehouse stock series for one SKU, across every
 * configured ERP instance for the company. No date bound and no priority/
 * brand filtering — this is a single-SKU lookup for the trend chart, not the
 * table's candidate-list resolution. `info` lets the panel explain which top
 * filter would hide this SKU from the table.
 */
/** Display name for an ERP instance on the chart: its configured label, else "ERP 1", "ERP 2"… */
function erpLabel(instance: { label: string | null }, index: number): string {
  return instance.label?.trim() || `ERP ${index + 1}`;
}

export async function getStockTrendSeriesForSku(
  companyId: string,
  sku: string,
  channel?: StockChannel | null,
): Promise<{ series: StockTrendSeriesPoint[]; currentStock: number; info: StockTrendItemInfo | null }> {
  const trimmedSku = sku.trim();
  if (!trimmedSku) return { series: [], currentStock: 0, info: null };

  const [catalog, instances] = await Promise.all([loadSkuCatalog(companyId), getAllOsfErpInstances(companyId)]);
  const entry = catalog.get(trimmedSku);
  if (instances.length === 0) return { series: [], currentStock: 0, info: stockTrendItemInfo(entry, []) };

  const [perInstanceRows, balanceRows] = await Promise.all([
    Promise.all(instances.map((instance) => fetchStockLedgerEntries(instance.cfg, [trimmedSku], channel))),
    getLiveStockBalances(companyId),
  ]);
  // Tag each row with its ERP so the chart can show stock per ERP as well as the total.
  const ledger = perInstanceRows.flatMap((rows, i) => {
    const erp = erpLabel(instances[i], i);
    return rows.map((row) => ({ ...row, erp }));
  });

  return {
    series: computeStockTrendSeries(ledger),
    currentStock: currentStockBySku(balanceRows, channel).get(trimmedSku) ?? 0,
    info: stockTrendItemInfo(entry, ledger),
  };
}

export type StockTrendVariantSeries = StockTrendItemInfo & {
  sku: string;
  series: StockTrendSeriesPoint[];
  currentStock: number;
};

/**
 * Full chronological cross-warehouse stock series for every variant SKU
 * sharing a base SKU (everything before the final "_<digits>" suffix, see
 * parentSkuStem) — one ERP round trip per instance for all variants together,
 * then split by itemCode before replaying each variant's own series. Each
 * variant's totalBalance is its own cross-warehouse balance, not summed with
 * siblings (the panel sums them client-side for the "Total" line).
 * currentStock is each variant's live report balance, not its last series point.
 */
export async function getStockTrendSeriesForBaseSku(
  companyId: string,
  baseSku: string,
  channel?: StockChannel | null,
): Promise<StockTrendVariantSeries[]> {
  const trimmedBase = baseSku.trim();
  if (!trimmedBase) return [];

  const catalog = await loadSkuCatalog(companyId);
  const variants = [...catalog.values()]
    .filter((entry) => parentSkuStem(entry.sku) === trimmedBase)
    .sort((a, b) => a.sku.localeCompare(b.sku));
  if (variants.length === 0) return [];

  const instances = await getAllOsfErpInstances(companyId);
  if (instances.length === 0) {
    return variants.map((v) => ({ sku: v.sku, series: [], currentStock: 0, ...stockTrendItemInfo(v, []) }));
  }

  const variantSkus = variants.map((v) => v.sku);
  const [perInstanceRows, balanceRows] = await Promise.all([
    Promise.all(instances.map((instance) => fetchStockLedgerEntries(instance.cfg, variantSkus, channel))),
    getLiveStockBalances(companyId),
  ]);
  const allRows = perInstanceRows.flat();
  const liveStock = currentStockBySku(balanceRows, channel);

  const rowsBySku = new Map<string, StockLedgerEntry[]>();
  for (const row of allRows) {
    const list = rowsBySku.get(row.itemCode);
    if (list) list.push(row);
    else rowsBySku.set(row.itemCode, [row]);
  }

  return variants.map((v) => {
    const ledger = rowsBySku.get(v.sku) ?? [];
    return {
      sku: v.sku,
      series: computeStockTrendSeries(ledger),
      currentStock: liveStock.get(v.sku) ?? 0,
      ...stockTrendItemInfo(v, ledger),
    };
  });
}

/**
 * True when `sku` isn't a catalog SKU itself but is the base stem of at least
 * one catalog SKU — lets the series route switch to variant mode for a base SKU
 * the panel couldn't detect (its variants aren't in the loaded table rows).
 */
export async function isBaseSkuOnly(companyId: string, sku: string): Promise<boolean> {
  const trimmed = sku.trim();
  if (!trimmed) return false;
  const catalog = await loadSkuCatalog(companyId);
  if (catalog.has(trimmed)) return false;
  for (const entry of catalog.values()) {
    if (parentSkuStem(entry.sku) === trimmed) return true;
  }
  return false;
}
