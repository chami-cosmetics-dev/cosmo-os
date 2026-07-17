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

type PurchaseRow = {
  name?: string;
  supplier?: string | null;
  supplier_name?: string | null;
  posting_date?: string | null;
  item_code?: string | null;
  qty?: number | string | null;
  rate?: number | string | null;
};

const PAGE_LENGTH = 500;
const MAX_PAGES = 60;

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
 * newest-first, so the first time we see an item_code is its latest purchase.
 * Never invents data — items with no receipt stay blank.
 */
export async function fetchLastPurchaseByItem(input: {
  cfg: OsfErpCredentials;
  itemCodes: string[];
  /** Inclusive lower bound (YYYY-MM-DD) for the "recently purchased" window. */
  recentSinceDate?: string;
}): Promise<Map<string, ItemLastPurchase>> {
  const result = new Map<string, ItemLastPurchase>();
  const needed = new Set(input.itemCodes.map((s) => s.trim()).filter(Boolean));
  if (needed.size === 0) return result;
  const recentSince = input.recentSinceDate?.trim() || null;

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

  // Track which receipt fixed each item's "latest", so extra lines of that same
  // receipt accumulate into the quantity.
  const latestReceiptForItem = new Map<string, string>();

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const path =
      `/api/resource/Purchase Receipt?fields=${encodeURIComponent(fields)}` +
      `&filters=${encodeURIComponent(filters)}` +
      `&order_by=${encodeURIComponent("posting_date desc, name desc")}` +
      `&limit_start=${page * PAGE_LENGTH}&limit_page_length=${PAGE_LENGTH}`;

    const json = await erpGetJson<{ data?: PurchaseRow[] }>(input.cfg, path);
    const rows = json.data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const item = row.item_code?.trim();
      if (!item || !needed.has(item)) continue;
      const receipt = row.name?.trim() ?? "";
      const date = row.posting_date?.trim() || null;
      const qty = Number(row.qty);
      const qtyVal = Number.isFinite(qty) ? qty : 0;
      const rateNum = row.rate != null ? Number(row.rate) : NaN;
      const rateVal = Number.isFinite(rateNum) && rateNum > 0 ? rateNum : null;

      let entry = result.get(item);
      if (!entry) {
        // First (newest) row for this item fixes the "latest purchase".
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
      // Recent-window total sums across ALL receipts within the window.
      if (recentSince && date && date >= recentSince) {
        entry.recentQty = (entry.recentQty ?? 0) + qtyVal;
      }
      // Older receipts otherwise only matter for the recent-window sum.
    }

    if (rows.length < PAGE_LENGTH) break;
  }

  return result;
}
