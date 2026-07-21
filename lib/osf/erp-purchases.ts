import "server-only";

import { OsfErpError, type OsfErpCredentials } from "@/lib/osf/erp-stock";

export type ItemLastPurchase = {
  /** Supplier display name (falls back to supplier id) on the latest purchase receipt */
  supplier: string | null;
  /** Quantity purchased on that latest receipt (summed across lines of the same receipt) */
  qty: number | null;
  /** Unit rate on the latest purchase receipt line (used as the Latest Cost source) */
  rate: number | null;
  /** Posting date of the latest receipt (YYYY-MM-DD) */
  date: string | null;
  /**
   * Total quantity received across ALL receipts within the recent window
   * (>= recentSinceDate). 0 when the item was purchased but not recently;
   * only null when the item has no purchase history at all.
   */
  recentQty: number | null;
};

export type AllowedSupplier = { name: string; code: string };

export type PurchaseRow = {
  name?: string;
  supplier?: string | null;
  supplier_name?: string | null;
  posting_date?: string | null;
  item_code?: string | null;
  qty?: number | string | null;
  rate?: number | string | null;
};

/** Per-supplier purchase summary for one SKU (derived from receipt history). */
export type SupplierPurchaseSummary = {
  supplierKey: string;
  displayName: string;
  bestEverRate: number | null;
  bestEverDate: string | null;
  lastRate: number | null;
  lastDate: string | null;
  lastQty: number | null;
};

const PAGE_LENGTH = 500;
const MAX_PAGES = 60;

/** Trim + lowercase for supplier name/code matching. */
export function normalizeSupplierKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Build allowlist from Cosmo/Vault company Supplier name + code. */
export function buildSupplierAllowlist(suppliers: AllowedSupplier[]): Set<string> {
  const set = new Set<string>();
  for (const s of suppliers) {
    const name = normalizeSupplierKey(s.name);
    const code = normalizeSupplierKey(s.code);
    if (name) set.add(name);
    if (code) set.add(code);
  }
  return set;
}

/**
 * Empty allowlist = fail open (legacy unfiltered). Non-empty = ERP supplier id
 * or supplier_name must match Cosmo name or code (case-insensitive).
 */
export function isAllowedSupplier(
  row: Pick<PurchaseRow, "supplier" | "supplier_name">,
  allowlist: Set<string>,
): boolean {
  if (allowlist.size === 0) return true;
  const id = normalizeSupplierKey(row.supplier);
  const name = normalizeSupplierKey(row.supplier_name);
  return (id !== "" && allowlist.has(id)) || (name !== "" && allowlist.has(name));
}

/**
 * Reduce Purchase Receipt lines (newest-first) into per-item last-purchase maps.
 * Skips disallowed suppliers when allowlist is non-empty; walks back to latest allowed.
 */
export function accumulateLastPurchasesFromRows(input: {
  rows: PurchaseRow[];
  itemCodes: Set<string>;
  recentSinceDate?: string | null;
  allowedSuppliers?: AllowedSupplier[];
  /** Existing map to mutate (for multi-page accumulation). */
  result?: Map<string, ItemLastPurchase>;
  latestReceiptForItem?: Map<string, string>;
}): {
  result: Map<string, ItemLastPurchase>;
  latestReceiptForItem: Map<string, string>;
} {
  const result = input.result ?? new Map<string, ItemLastPurchase>();
  const latestReceiptForItem = input.latestReceiptForItem ?? new Map<string, string>();
  const recentSince = input.recentSinceDate?.trim() || null;
  const allowlist = buildSupplierAllowlist(input.allowedSuppliers ?? []);

  for (const row of input.rows) {
    const item = row.item_code?.trim();
    if (!item || !input.itemCodes.has(item)) continue;
    if (!isAllowedSupplier(row, allowlist)) continue;

    const receipt = row.name?.trim() ?? "";
    const date = row.posting_date?.trim() || null;
    const qty = Number(row.qty);
    const qtyVal = Number.isFinite(qty) ? qty : 0;
    const rateNum = row.rate != null ? Number(row.rate) : NaN;
    const rateVal = Number.isFinite(rateNum) && rateNum > 0 ? rateNum : null;

    let entry = result.get(item);
    if (!entry) {
      // First allowed (newest) row for this item fixes the "latest purchase".
      entry = {
        supplier: row.supplier_name?.trim() || row.supplier?.trim() || null,
        qty: qtyVal,
        rate: rateVal,
        date,
        recentQty: 0,
      };
      result.set(item, entry);
      latestReceiptForItem.set(item, receipt);
    } else if (latestReceiptForItem.get(item) === receipt) {
      // Another line of the same (latest) receipt for this item.
      entry.qty = (entry.qty ?? 0) + qtyVal;
      if (entry.rate == null && rateVal != null) entry.rate = rateVal;
    }
    // Recent-window total sums only allowed-supplier receipts within the window.
    if (recentSince && date && date >= recentSince) {
      entry.recentQty = (entry.recentQty ?? 0) + qtyVal;
    }
  }

  return { result, latestReceiptForItem };
}

/**
 * Reduce Purchase Receipt lines into per-supplier summaries for one SKU.
 * Rows should be newest-first; first hit per supplier fixes last purchase.
 * Best-ever tracks minimum positive rate (tie → newer date).
 */
export function accumulateSupplierPurchasesFromRows(input: {
  rows: PurchaseRow[];
  sku: string;
  allowedSuppliers?: AllowedSupplier[];
  result?: Map<string, SupplierPurchaseSummary>;
}): Map<string, SupplierPurchaseSummary> {
  const sku = input.sku.trim();
  const result = input.result ?? new Map<string, SupplierPurchaseSummary>();
  if (!sku) return result;
  const allowlist = buildSupplierAllowlist(input.allowedSuppliers ?? []);

  for (const row of input.rows) {
    const item = row.item_code?.trim();
    if (!item || item !== sku) continue;
    if (!isAllowedSupplier(row, allowlist)) continue;

    const displayName = row.supplier_name?.trim() || row.supplier?.trim() || "";
    if (!displayName) continue;
    const supplierKey = normalizeSupplierKey(displayName);
    if (!supplierKey) continue;

    const date = row.posting_date?.trim() || null;
    const qty = Number(row.qty);
    const qtyVal = Number.isFinite(qty) ? qty : null;
    const rateNum = row.rate != null ? Number(row.rate) : NaN;
    const rateVal = Number.isFinite(rateNum) && rateNum > 0 ? rateNum : null;

    let entry = result.get(supplierKey);
    if (!entry) {
      entry = {
        supplierKey,
        displayName,
        bestEverRate: rateVal,
        bestEverDate: rateVal != null ? date : null,
        lastRate: rateVal,
        lastDate: date,
        lastQty: qtyVal,
      };
      result.set(supplierKey, entry);
      continue;
    }

    // Newest-first: first row for this supplier already set last*; only update best-ever.
    if (rateVal != null) {
      if (
        entry.bestEverRate == null ||
        rateVal < entry.bestEverRate ||
        (rateVal === entry.bestEverRate &&
          date != null &&
          (entry.bestEverDate == null || date > entry.bestEverDate))
      ) {
        entry.bestEverRate = rateVal;
        entry.bestEverDate = date;
      }
    }
  }

  return result;
}

async function erpGetJson<T>(cfg: OsfErpCredentials, path: string): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: {
      Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OsfErpError(`ERPNext GET ${path} [${res.status}]: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/**
 * Latest purchase (supplier, qty, date) per item from ERP Purchase Receipts.
 *
 * Uses Frappe's parent+child "fields-only" join on `Purchase Receipt` (child
 * `Purchase Receipt Item` columns in `fields`, parent-only filter) because the
 * child doctype is not directly queryable for this API user. Rows come back
 * newest-first, so the first allowed item_code hit is its latest purchase.
 * When `allowedSuppliers` is non-empty, skips receipts whose supplier is not
 * in the company Cosmo/Vault Supplier list (intercompany transfers).
 * Never invents data — items with no allowed receipt stay blank.
 */
export async function fetchLastPurchaseByItem(input: {
  cfg: OsfErpCredentials;
  itemCodes: string[];
  /** Inclusive lower bound (YYYY-MM-DD) for the "recently purchased" window. */
  recentSinceDate?: string;
  /** Company Supplier list; empty/omitted = no filter (legacy). */
  allowedSuppliers?: AllowedSupplier[];
}): Promise<Map<string, ItemLastPurchase>> {
  const needed = new Set(input.itemCodes.map((s) => s.trim()).filter(Boolean));
  if (needed.size === 0) return new Map();

  const fields = JSON.stringify([
    "name",
    "supplier",
    "supplier_name",
    "posting_date",
    "`tabPurchase Receipt Item`.item_code",
    "`tabPurchase Receipt Item`.qty",
    "`tabPurchase Receipt Item`.rate",
  ]);
  const filters = JSON.stringify([["docstatus", "=", 1]]);

  let result = new Map<string, ItemLastPurchase>();
  let latestReceiptForItem = new Map<string, string>();

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const path =
      `/api/resource/Purchase Receipt?fields=${encodeURIComponent(fields)}` +
      `&filters=${encodeURIComponent(filters)}` +
      `&order_by=${encodeURIComponent("posting_date desc, name desc")}` +
      `&limit_start=${page * PAGE_LENGTH}&limit_page_length=${PAGE_LENGTH}`;

    const json = await erpGetJson<{ data?: PurchaseRow[] }>(input.cfg, path);
    const rows = json.data ?? [];
    if (rows.length === 0) break;

    const next = accumulateLastPurchasesFromRows({
      rows,
      itemCodes: needed,
      recentSinceDate: input.recentSinceDate,
      allowedSuppliers: input.allowedSuppliers,
      result,
      latestReceiptForItem,
    });
    result = next.result;
    latestReceiptForItem = next.latestReceiptForItem;

    if (rows.length < PAGE_LENGTH) break;
  }

  return result;
}

const PURCHASE_RECEIPT_FIELDS = JSON.stringify([
  "name",
  "supplier",
  "supplier_name",
  "posting_date",
  "`tabPurchase Receipt Item`.item_code",
  "`tabPurchase Receipt Item`.qty",
  "`tabPurchase Receipt Item`.rate",
]);

/**
 * All allowlisted suppliers that purchased `sku`, with best-ever and last purchase.
 * Tries an optional Frappe child `item_code` filter; falls back to unfiltered pagination.
 */
export async function fetchSupplierPurchasesBySku(input: {
  cfg: OsfErpCredentials;
  sku: string;
  allowedSuppliers?: AllowedSupplier[];
}): Promise<Map<string, SupplierPurchaseSummary>> {
  const sku = input.sku.trim();
  if (!sku) return new Map();

  const tryWithItemFilter = async (useItemFilter: boolean) => {
    const filters = useItemFilter
      ? JSON.stringify([
          ["docstatus", "=", 1],
          ["Purchase Receipt Item", "item_code", "=", sku],
        ])
      : JSON.stringify([["docstatus", "=", 1]]);

    let result = new Map<string, SupplierPurchaseSummary>();
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const path =
        `/api/resource/Purchase Receipt?fields=${encodeURIComponent(PURCHASE_RECEIPT_FIELDS)}` +
        `&filters=${encodeURIComponent(filters)}` +
        `&order_by=${encodeURIComponent("posting_date desc, name desc")}` +
        `&limit_start=${page * PAGE_LENGTH}&limit_page_length=${PAGE_LENGTH}`;

      const json = await erpGetJson<{ data?: PurchaseRow[] }>(input.cfg, path);
      const rows = json.data ?? [];
      if (rows.length === 0) break;

      result = accumulateSupplierPurchasesFromRows({
        rows,
        sku,
        allowedSuppliers: input.allowedSuppliers,
        result,
      });

      if (rows.length < PAGE_LENGTH) break;
    }
    return result;
  };

  try {
    return await tryWithItemFilter(true);
  } catch (err) {
    if (err instanceof OsfErpError) {
      console.warn(
        "[osf erp-purchases] item_code filter rejected; falling back to unfiltered pagination",
        err.message.slice(0, 200),
      );
      return tryWithItemFilter(false);
    }
    throw err;
  }
}
