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
  /** Line amount / net_amount — used by the Cosmo OSF monthly purchase grid. */
  amount?: number | string | null;
  net_amount?: number | string | null;
  docstatus?: number | null;
  status?: string | null;
  /** ERP Purchase Invoice return flag (1 = credit note / stock return). */
  is_return?: number | boolean | string | null;
};

/** One SKU-month cell on the Cosmo OSF purchase grid. */
export type OsfMonthPurchaseCell = {
  qty: number | null;
  netValue: number | null;
};

/** Receipt (Cosmo default) vs Invoice (Vault — PR rates often placeholder/stale). */
export type PurchaseDocSource = "receipt" | "invoice";

function purchaseDocMeta(source: PurchaseDocSource): {
  doctype: string;
  childDoctype: string;
  childTable: string;
} {
  if (source === "invoice") {
    return {
      doctype: "Purchase Invoice",
      childDoctype: "Purchase Invoice Item",
      childTable: "tabPurchase Invoice Item",
    };
  }
  return {
    doctype: "Purchase Receipt",
    childDoctype: "Purchase Receipt Item",
    childTable: "tabPurchase Receipt Item",
  };
}

function isReturnFlag(value: PurchaseRow["is_return"]): boolean {
  return value === 1 || value === true || value === "1";
}

/** Submitted purchase only — cancelled / draft / return never feed cost or compare. */
export function isUsablePurchaseDoc(
  row: Pick<PurchaseRow, "docstatus" | "status" | "is_return">,
): boolean {
  if (row.docstatus != null && row.docstatus !== 1) return false;
  if (isReturnFlag(row.is_return)) return false;
  const status = (row.status ?? "").trim().toLowerCase();
  if (status === "cancelled" || status === "draft" || status === "return") return false;
  return true;
}

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

/** Vault intercompany cash suppliers — hide from SKU calculator and purchase history. */
const INTERCOMPANY_SUPPLIER_CODES = new Set(["sv029", "sv030", "sv031"]);
const INTERCOMPANY_SUPPLIER_NAMES = new Set([
  "cash or 001",
  "cash sv 001",
  "cash ae 001",
  "sv cash cos 006",
]);

function normalizeSupplierToken(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function isIntercompanyPurchaseSupplier(
  supplierCode: string | null | undefined,
  supplierName: string | null | undefined,
): boolean {
  const code = normalizeSupplierToken(supplierCode);
  const name = normalizeSupplierToken(supplierName);
  const haystack = `${code} ${name}`.trim();
  if (!haystack) return false;
  if (code && (INTERCOMPANY_SUPPLIER_CODES.has(code) || INTERCOMPANY_SUPPLIER_NAMES.has(code))) {
    return true;
  }
  if (name && (INTERCOMPANY_SUPPLIER_CODES.has(name) || INTERCOMPANY_SUPPLIER_NAMES.has(name))) {
    return true;
  }
  for (const token of INTERCOMPANY_SUPPLIER_CODES) {
    if (haystack.includes(token)) return true;
  }
  for (const token of INTERCOMPANY_SUPPLIER_NAMES) {
    if (haystack.includes(token)) return true;
  }
  return false;
}

/** Sync-test and intercompany transfers — never show in OS cost or supplier compare. */
export function isNoisePurchaseSupplier(
  row: Pick<PurchaseRow, "supplier" | "supplier_name">,
): boolean {
  const id = normalizeSupplierKey(row.supplier);
  const name = normalizeSupplierKey(row.supplier_name);
  if (id.includes("sync-test") || name.includes("sync-test")) return true;
  return isIntercompanyPurchaseSupplier(row.supplier, row.supplier_name);
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
    if (!isUsablePurchaseDoc(row)) continue;
    if (isNoisePurchaseSupplier(row)) continue;
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
      // Skip zero/blank rates — walk back to a real priced purchase (placeholders).
      if (rateVal == null) continue;
      // First allowed (newest) priced row for this item fixes the "latest purchase".
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
    if (!isUsablePurchaseDoc(row)) continue;
    if (isNoisePurchaseSupplier(row)) continue;
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
 * Latest purchase (supplier, qty, date) per item from ERP purchase docs.
 *
 * Default source = Purchase Receipt (Cosmo). Vault SKU calculator / OSF use
 * Purchase Invoice — receipt rates are often placeholder (e.g. 100) while
 * invoices carry the real cost.
 *
 * Uses Frappe parent+child "fields-only" join. Rows newest-first; first
 * allowed item_code hit is latest purchase. Allowlist skips intercompany.
 */
export async function fetchLastPurchaseByItem(input: {
  cfg: OsfErpCredentials;
  itemCodes: string[];
  /** Inclusive lower bound (YYYY-MM-DD) for the "recently purchased" window. */
  recentSinceDate?: string;
  /** Company Supplier list; empty/omitted = no filter (legacy). */
  allowedSuppliers?: AllowedSupplier[];
  /** Default receipt; Vault passes invoice. */
  source?: PurchaseDocSource;
}): Promise<Map<string, ItemLastPurchase>> {
  const needed = new Set(input.itemCodes.map((s) => s.trim()).filter(Boolean));
  if (needed.size === 0) return new Map();

  const meta = purchaseDocMeta(input.source ?? "receipt");
  const parentExtra =
    input.source === "invoice" ? (["is_return"] as const) : ([] as const);
  const fields = JSON.stringify([
    "name",
    "supplier",
    "supplier_name",
    "posting_date",
    "docstatus",
    "status",
    ...parentExtra,
    `\`${meta.childTable}\`.item_code`,
    `\`${meta.childTable}\`.qty`,
    `\`${meta.childTable}\`.rate`,
  ]);
  const filters = JSON.stringify([["docstatus", "=", 1]]);

  let result = new Map<string, ItemLastPurchase>();
  let latestReceiptForItem = new Map<string, string>();

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const path =
      `/api/resource/${encodeURIComponent(meta.doctype)}?fields=${encodeURIComponent(fields)}` +
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

/**
 * All allowlisted suppliers that purchased `sku`, with best-ever and last purchase.
 * Tries an optional Frappe child `item_code` filter; falls back to unfiltered pagination.
 */
export async function fetchSupplierPurchasesBySku(input: {
  cfg: OsfErpCredentials;
  sku: string;
  allowedSuppliers?: AllowedSupplier[];
  /** Default receipt; Vault passes invoice. */
  source?: PurchaseDocSource;
}): Promise<Map<string, SupplierPurchaseSummary>> {
  const sku = input.sku.trim();
  if (!sku) return new Map();

  const meta = purchaseDocMeta(input.source ?? "receipt");
  const parentExtra =
    input.source === "invoice" ? (["is_return"] as const) : ([] as const);
  const fields = JSON.stringify([
    "name",
    "supplier",
    "supplier_name",
    "posting_date",
    "docstatus",
    "status",
    ...parentExtra,
    `\`${meta.childTable}\`.item_code`,
    `\`${meta.childTable}\`.qty`,
    `\`${meta.childTable}\`.rate`,
  ]);

  const tryWithItemFilter = async (useItemFilter: boolean) => {
    const filters = useItemFilter
      ? JSON.stringify([
          ["docstatus", "=", 1],
          [meta.childDoctype, "item_code", "=", sku],
        ])
      : JSON.stringify([["docstatus", "=", 1]]);

    let result = new Map<string, SupplierPurchaseSummary>();
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const path =
        `/api/resource/${encodeURIComponent(meta.doctype)}?fields=${encodeURIComponent(fields)}` +
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

function purchaseLineNetValue(row: PurchaseRow): number {
  const net = Number(row.net_amount);
  if (Number.isFinite(net)) return net;
  const amount = Number(row.amount);
  if (Number.isFinite(amount)) return amount;
  const qty = Number(row.qty);
  const rate = Number(row.rate);
  if (Number.isFinite(qty) && Number.isFinite(rate)) return qty * rate;
  return 0;
}

/**
 * Bucket allowlisted Purchase Receipt/Invoice lines into sku → YYYY-MM → qty+value.
 * Months outside bounds are dropped. Empty months are omitted (workbook blanks them).
 */
export function accumulateMonthlyPurchasesFromRows(input: {
  rows: PurchaseRow[];
  bounds: { start: string; end: string };
  itemCodes?: Set<string>;
  allowedSuppliers?: AllowedSupplier[];
  result?: Map<string, Record<string, OsfMonthPurchaseCell>>;
}): Map<string, Record<string, OsfMonthPurchaseCell>> {
  const result = input.result ?? new Map<string, Record<string, OsfMonthPurchaseCell>>();
  const allowlist = buildSupplierAllowlist(input.allowedSuppliers ?? []);

  for (const row of input.rows) {
    if (!isUsablePurchaseDoc(row)) continue;
    if (isNoisePurchaseSupplier(row)) continue;
    if (!isAllowedSupplier(row, allowlist)) continue;
    const sku = row.item_code?.trim();
    if (!sku) continue;
    if (input.itemCodes && !input.itemCodes.has(sku)) continue;
    const date = row.posting_date?.trim() ?? "";
    if (!date || date < input.bounds.start || date > input.bounds.end) continue;
    const month = date.slice(0, 7);
    const qty = Number(row.qty);
    const qtyVal = Number.isFinite(qty) ? qty : 0;
    const netVal = purchaseLineNetValue(row);
    const months = result.get(sku) ?? {};
    const prev = months[month];
    months[month] = {
      qty: (prev?.qty ?? 0) + qtyVal,
      netValue: (prev?.netValue ?? 0) + netVal,
    };
    result.set(sku, months);
  }
  return result;
}

/** Sum monthly purchase grids from multiple ERP instances. */
export function mergeMonthlyPurchaseMaps(
  maps: Array<Map<string, Record<string, OsfMonthPurchaseCell>>>,
): Map<string, Record<string, OsfMonthPurchaseCell>> {
  const out = new Map<string, Record<string, OsfMonthPurchaseCell>>();
  for (const map of maps) {
    for (const [sku, months] of map) {
      const dest = out.get(sku) ?? {};
      for (const [month, cell] of Object.entries(months)) {
        const prev = dest[month];
        dest[month] = {
          qty: (prev?.qty ?? 0) + (cell.qty ?? 0),
          netValue: (prev?.netValue ?? 0) + (cell.netValue ?? 0),
        };
      }
      out.set(sku, dest);
    }
  }
  return out;
}

/**
 * Purchase Receipt (default) lines in a posting-date window, bucketed by SKU-month.
 * Cosmo OSF last-purchase already uses receipts; the grid stays on the same source.
 */
export async function fetchMonthlyPurchasesInRange(input: {
  cfg: OsfErpCredentials;
  bounds: { start: string; end: string };
  itemCodes?: string[];
  allowedSuppliers?: AllowedSupplier[];
  source?: PurchaseDocSource;
}): Promise<Map<string, Record<string, OsfMonthPurchaseCell>>> {
  const needed = input.itemCodes
    ? new Set(input.itemCodes.map((s) => s.trim()).filter(Boolean))
    : undefined;
  const meta = purchaseDocMeta(input.source ?? "receipt");
  const parentExtra = input.source === "invoice" ? (["is_return"] as const) : ([] as const);
  const amountField = input.source === "invoice" ? "net_amount" : "amount";
  const fields = JSON.stringify([
    "name",
    "supplier",
    "supplier_name",
    "posting_date",
    "docstatus",
    "status",
    ...parentExtra,
    `\`${meta.childTable}\`.item_code`,
    `\`${meta.childTable}\`.qty`,
    `\`${meta.childTable}\`.rate`,
    `\`${meta.childTable}\`.${amountField}`,
  ]);
  const filters = JSON.stringify([
    ["docstatus", "=", 1],
    ["posting_date", ">=", input.bounds.start],
    ["posting_date", "<=", input.bounds.end],
  ]);

  let result = new Map<string, Record<string, OsfMonthPurchaseCell>>();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const path =
      `/api/resource/${encodeURIComponent(meta.doctype)}?fields=${encodeURIComponent(fields)}` +
      `&filters=${encodeURIComponent(filters)}` +
      `&order_by=${encodeURIComponent("posting_date desc, name desc")}` +
      `&limit_start=${page * PAGE_LENGTH}&limit_page_length=${PAGE_LENGTH}`;

    const json = await erpGetJson<{ data?: PurchaseRow[] }>(input.cfg, path);
    const rows = json.data ?? [];
    if (rows.length === 0) break;

    result = accumulateMonthlyPurchasesFromRows({
      rows,
      bounds: input.bounds,
      itemCodes: needed,
      allowedSuppliers: input.allowedSuppliers,
      result,
    });

    if (rows.length < PAGE_LENGTH) break;
  }
  return result;
}
