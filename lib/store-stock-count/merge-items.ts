import { normalizeSkuKey } from "@/lib/store-stock-count/company-key";
import type {
  StoreStockCountApiItem,
  StoreStockCountRow,
} from "@/lib/store-stock-count/types";

function unionBarcodes(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...a, ...b]) {
    const bc = raw.trim();
    if (!bc || seen.has(bc)) continue;
    seen.add(bc);
    out.push(bc);
  }
  return out;
}

/**
 * Fold one company's API items into existing rows.
 * `companyKey` stock is set to the API stock number (including 0).
 * Existing counts are not stored on rows — caller keeps a separate counts map.
 */
export function mergeCompanyItems(input: {
  existing: StoreStockCountRow[];
  companyKey: string;
  items: StoreStockCountApiItem[];
  /** When refreshing, wipe previous stock for this company before applying. */
  replaceCompanyStock?: boolean;
}): StoreStockCountRow[] {
  const byKey = new Map<string, StoreStockCountRow>();

  for (const row of input.existing) {
    const next: StoreStockCountRow = {
      ...row,
      barcodes: [...row.barcodes],
      stockByCompany: { ...row.stockByCompany },
    };
    if (input.replaceCompanyStock) {
      next.stockByCompany[input.companyKey] = null;
    }
    byKey.set(row.skuKey, next);
  }

  for (const item of input.items) {
    const sku = item.sku.trim();
    if (!sku) continue;
    const skuKey = normalizeSkuKey(sku);
    const stock = Number(item.stock);
    const stockVal = Number.isFinite(stock) ? stock : 0;
    const barcodes = item.barcodes.map((b) => b.trim()).filter(Boolean);

    const prev = byKey.get(skuKey);
    if (!prev) {
      byKey.set(skuKey, {
        sku,
        skuKey,
        name: item.name?.trim() || sku,
        description: item.description?.trim() || "",
        barcodes,
        stockByCompany: { [input.companyKey]: stockVal },
      });
      continue;
    }

    prev.barcodes = unionBarcodes(prev.barcodes, barcodes);
    if (!prev.name || prev.name === prev.sku) {
      const name = item.name?.trim();
      if (name) prev.name = name;
    }
    if (!prev.description) {
      const desc = item.description?.trim();
      if (desc) prev.description = desc;
    }
    prev.stockByCompany[input.companyKey] = stockVal;
  }

  // After a failed load we may want to mark company unavailable on all rows
  return [...byKey.values()].sort((a, b) => a.sku.localeCompare(b.sku));
}

/** Mark a company as unavailable (null stock) on every row; add empty rows not required. */
export function markCompanyUnavailable(
  rows: StoreStockCountRow[],
  companyKey: string,
): StoreStockCountRow[] {
  return rows.map((row) => ({
    ...row,
    stockByCompany: { ...row.stockByCompany, [companyKey]: null },
  }));
}

/**
 * Fill missing company keys so multi-company sum works.
 * Successful companies → missing means 0; failed → use markCompanyUnavailable (null).
 */
export function fillMissingCompanyStock(
  rows: StoreStockCountRow[],
  companyKeys: string[],
  value: number | null,
): StoreStockCountRow[] {
  return rows.map((row) => {
    const stockByCompany = { ...row.stockByCompany };
    for (const key of companyKeys) {
      if (!(key in stockByCompany)) stockByCompany[key] = value;
    }
    return { ...row, stockByCompany };
  });
}

/** Sum numeric stocks for selected company keys; null if any selected key is missing or null. */
export function sumLiveStock(
  stockByCompany: Record<string, number | null>,
  companyKeys: string[],
): number | null {
  if (companyKeys.length === 0) return null;
  let sum = 0;
  for (const key of companyKeys) {
    const v = stockByCompany[key];
    if (v == null || !Number.isFinite(v)) return null;
    sum += v;
  }
  return sum;
}
