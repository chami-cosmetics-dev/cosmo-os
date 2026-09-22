import {
  accumulateLastPurchasesFromRows,
  accumulateSupplierPurchasesFromRows,
  type ItemLastPurchase,
  type PurchaseRow,
  type SupplierPurchaseSummary,
} from "@/lib/osf/erp-purchases";
import { mergeSupplierPurchaseMaps } from "@/lib/osf/supplier-compare";
import { isVaultOsfPurchaseHistoryMonth } from "@/lib/vault-osf/purchase-history-parse";
import type { PurchaseCell } from "@/lib/vault-osf/types";

export type CosmoPurchaseHistoryLine = {
  sku: string;
  supplier: string;
  postingDate: string;
  qty: number;
  rate: number;
  netValue: number;
};

/** Newest-first PurchaseRow list for erp-purchases accumulators. */
export function cosmoLinesToPurchaseRows(lines: CosmoPurchaseHistoryLine[]): PurchaseRow[] {
  const rows: PurchaseRow[] = lines.map((l, idx) => ({
    name: `COSMO-IMPORT-${l.postingDate}-${l.sku}-${idx}`,
    supplier: l.supplier,
    supplier_name: l.supplier,
    posting_date: l.postingDate,
    item_code: l.sku,
    qty: l.qty,
    rate: l.rate,
    docstatus: 1,
    status: "Submitted",
    is_return: 0,
  }));
  rows.sort((a, b) => {
    const da = a.posting_date ?? "";
    const db = b.posting_date ?? "";
    if (da !== db) return db.localeCompare(da);
    return String(b.name ?? "").localeCompare(String(a.name ?? ""));
  });
  return rows;
}

/** Aggregate Cosmo lines into monthly PurchaseCell maps (sku → month → cell). */
export function aggregateCosmoMonthlyPurchases(
  lines: CosmoPurchaseHistoryLine[],
): Map<string, Record<string, PurchaseCell>> {
  const sums = new Map<string, Map<string, { qty: number; netValue: number }>>();
  for (const line of lines) {
    const month = line.postingDate.slice(0, 7);
    if (!isVaultOsfPurchaseHistoryMonth(month)) continue;
    let byMonth = sums.get(line.sku);
    if (!byMonth) {
      byMonth = new Map();
      sums.set(line.sku, byMonth);
    }
    const cur = byMonth.get(month) ?? { qty: 0, netValue: 0 };
    cur.qty += line.qty;
    cur.netValue += line.netValue;
    byMonth.set(month, cur);
  }
  const out = new Map<string, Record<string, PurchaseCell>>();
  for (const [sku, byMonth] of sums) {
    const rec: Record<string, PurchaseCell> = {};
    for (const [month, v] of byMonth) {
      rec[month] = { qty: v.qty, netValue: v.netValue };
    }
    out.set(sku, rec);
  }
  return out;
}

/**
 * Gap-fill OSF purchase months from Cosmo import.
 * Only Apr/May (VAULT_OSF_PURCHASE_HISTORY_MONTHS); ERP cell wins when qty present.
 */
export function mergeCosmoPurchasesIntoOsf(
  purchases: Map<string, Record<string, PurchaseCell>>,
  cosmoBySkuMonth: Map<string, Record<string, PurchaseCell>>,
): void {
  for (const [sku, byMonth] of cosmoBySkuMonth) {
    const dest = purchases.get(sku) ?? {};
    for (const [month, cell] of Object.entries(byMonth)) {
      if (!isVaultOsfPurchaseHistoryMonth(month)) continue;
      const existing = dest[month];
      if (existing?.qty != null) continue;
      dest[month] = cell;
    }
    purchases.set(sku, dest);
  }
}

/** Last-purchase map from Cosmo lines (newest date wins per SKU). */
export function lastPurchasesFromCosmoLines(
  lines: CosmoPurchaseHistoryLine[],
  itemCodes: string[],
): Map<string, ItemLastPurchase> {
  const codes = new Set(itemCodes.map((s) => s.trim()).filter(Boolean));
  if (codes.size === 0) return new Map();
  const rows = cosmoLinesToPurchaseRows(lines.filter((l) => codes.has(l.sku)));
  return accumulateLastPurchasesFromRows({
    rows,
    itemCodes: codes,
    allowedSuppliers: [],
  }).result;
}

/** Per-supplier summaries from Cosmo lines for one SKU. */
export function supplierPurchasesFromCosmoLines(
  lines: CosmoPurchaseHistoryLine[],
  sku: string,
): Map<string, SupplierPurchaseSummary> {
  const rows = cosmoLinesToPurchaseRows(lines.filter((l) => l.sku === sku));
  return accumulateSupplierPurchasesFromRows({
    rows,
    sku,
    allowedSuppliers: [],
  });
}

/**
 * Merge ERP + Cosmo last purchases: newer posting_date wins identity fields;
 * recentQty summed when both present.
 */
export function mergeLastPurchaseMaps(
  erp: Map<string, ItemLastPurchase>,
  cosmo: Map<string, ItemLastPurchase>,
): Map<string, ItemLastPurchase> {
  const out = new Map(erp);
  for (const [sku, c] of cosmo) {
    const e = out.get(sku);
    if (!e) {
      out.set(sku, { ...c });
      continue;
    }
    const cosmoNewer = c.date != null && (e.date == null || c.date > e.date);
    if (cosmoNewer) {
      out.set(sku, {
        supplier: c.supplier,
        qty: c.qty,
        rate: c.rate,
        date: c.date,
        recentQty: (e.recentQty ?? 0) + (c.recentQty ?? 0),
      });
    } else {
      out.set(sku, {
        ...e,
        recentQty: (e.recentQty ?? 0) + (c.recentQty ?? 0),
      });
    }
  }
  return out;
}

export function mergeErpAndCosmoSupplierMaps(
  erp: Map<string, SupplierPurchaseSummary>,
  cosmo: Map<string, SupplierPurchaseSummary>,
): Map<string, SupplierPurchaseSummary> {
  return mergeSupplierPurchaseMaps([erp, cosmo]);
}
