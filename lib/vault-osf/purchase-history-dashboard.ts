import { originalSellingPrice } from "@/lib/osf/formulas";
import { sellingMargin } from "@/lib/osf/pricing-math";
import {
  isSubmittedPurchase,
  type PurchaseInvoiceLine,
} from "@/lib/vault-osf/erp-purchases-monthly";
import { isExcludedErpCompany } from "@/lib/vault-osf/types";

export type PurchaseHistorySource = "erp" | "cosmo";

export type PurchaseHistoryRawLine = {
  sku: string;
  supplier: string;
  postingDate: string;
  qty: number;
  rate: number;
  netValue: number;
  sourceRef: string | null;
  source: PurchaseHistorySource;
  excelCompany?: string | null;
};

export type CatalogSellInfo = {
  productTitle: string | null;
  brand: string | null;
  mrp: number | null;
  discountedPrice: number | null;
};

export type PurchaseHistoryRow = {
  postingDate: string;
  sku: string;
  brand: string | null;
  productTitle: string | null;
  supplier: string;
  qty: number;
  rate: number;
  netValue: number;
  selling: number | null;
  marginPct: number | null;
  source: PurchaseHistorySource;
  sourceRef: string | null;
};

export type PurchaseHistorySummary = {
  lineCount: number;
  qtySum: number;
  costSum: number;
  /** Lines where selling price was available for margin. */
  marginLineCount: number;
};

export type PurchaseHistoryFilters = {
  from: string;
  to: string;
  sku?: string;
  supplier?: string;
  brand?: string;
};

/** Prefer sourceRef+sku; else sku+date+supplier+qty+rate. */
export function purchaseHistoryDedupeKey(line: PurchaseHistoryRawLine): string {
  const sku = line.sku.trim().toLowerCase();
  const ref = line.sourceRef?.trim();
  if (ref) return `ref:${ref.toLowerCase()}|${sku}`;
  const supplier = line.supplier.trim().toLowerCase();
  const qty = Number.isFinite(line.qty) ? String(line.qty) : "0";
  const rate = Number.isFinite(line.rate) ? String(line.rate) : "0";
  return `fb:${sku}|${line.postingDate}|${supplier}|${qty}|${rate}`;
}

export function cosmoDbLineToRaw(line: {
  sku: string;
  supplier: string;
  postingDate: string;
  qty: number;
  rate: number;
  netValue: number;
  sourceRef: string | null;
  excelCompany?: string | null;
}): PurchaseHistoryRawLine {
  return {
    sku: line.sku.trim(),
    supplier: line.supplier.trim(),
    postingDate: line.postingDate.trim(),
    qty: line.qty,
    rate: line.rate,
    netValue: line.netValue,
    sourceRef: line.sourceRef?.trim() || null,
    source: "cosmo",
    excelCompany: line.excelCompany ?? null,
  };
}

export function erpInvoiceLineToRaw(row: PurchaseInvoiceLine): PurchaseHistoryRawLine | null {
  if (!isSubmittedPurchase(row)) return null;
  if (isExcludedErpCompany(row.company ?? "")) return null;
  const sku = row.item_code?.trim();
  if (!sku) return null;
  const postingDate = row.posting_date?.trim();
  if (!postingDate) return null;
  const qty = Number(row.qty);
  const rate = Number(row.rate);
  if (!Number.isFinite(qty) || !Number.isFinite(rate) || rate <= 0) return null;
  const netRaw = row.net_amount != null ? Number(row.net_amount) : NaN;
  const netValue = Number.isFinite(netRaw)
    ? netRaw
    : Math.round(qty * rate * 100) / 100;
  const supplier =
    row.supplier_name?.trim() || row.supplier?.trim() || "Unknown";
  const sourceRef = row.name?.trim() || null;
  return {
    sku,
    supplier,
    postingDate,
    qty,
    rate,
    netValue,
    sourceRef,
    source: "erp",
  };
}

/**
 * Merge Cosmo + ERP lines. ERP wins on matching dedupe key.
 * Result sorted newest postingDate first, then sku.
 */
export function mergePurchaseHistoryLines(
  cosmo: PurchaseHistoryRawLine[],
  erp: PurchaseHistoryRawLine[],
): PurchaseHistoryRawLine[] {
  const map = new Map<string, PurchaseHistoryRawLine>();
  for (const line of cosmo) {
    map.set(purchaseHistoryDedupeKey(line), line);
  }
  for (const line of erp) {
    map.set(purchaseHistoryDedupeKey(line), line);
  }
  return [...map.values()].sort((a, b) => {
    if (a.postingDate !== b.postingDate) return b.postingDate.localeCompare(a.postingDate);
    return a.sku.localeCompare(b.sku);
  });
}

export function matchesPurchaseHistoryFilters(
  line: PurchaseHistoryRawLine,
  catalog: CatalogSellInfo | undefined,
  filters: PurchaseHistoryFilters,
): boolean {
  if (line.postingDate < filters.from || line.postingDate > filters.to) return false;
  if (filters.sku) {
    const q = filters.sku.trim().toLowerCase();
    if (q && !line.sku.toLowerCase().includes(q)) return false;
  }
  if (filters.supplier) {
    const q = filters.supplier.trim().toLowerCase();
    if (q && !line.supplier.toLowerCase().includes(q)) return false;
  }
  if (filters.brand) {
    const q = filters.brand.trim().toLowerCase();
    const brand = catalog?.brand?.trim().toLowerCase() ?? "";
    if (q && brand !== q) return false;
  }
  return true;
}

export function enrichPurchaseHistoryRow(
  line: PurchaseHistoryRawLine,
  catalog: CatalogSellInfo | undefined,
): PurchaseHistoryRow {
  const selling = originalSellingPrice(catalog?.mrp, catalog?.discountedPrice);
  const marginPct = sellingMargin(selling, line.rate);
  return {
    postingDate: line.postingDate,
    sku: line.sku,
    brand: catalog?.brand ?? null,
    productTitle: catalog?.productTitle ?? null,
    supplier: line.supplier,
    qty: line.qty,
    rate: line.rate,
    netValue: line.netValue,
    selling,
    marginPct,
    source: line.source,
    sourceRef: line.sourceRef,
  };
}

export function summarizePurchaseHistoryRows(rows: PurchaseHistoryRow[]): PurchaseHistorySummary {
  let qtySum = 0;
  let costSum = 0;
  let marginLineCount = 0;
  for (const row of rows) {
    qtySum += row.qty;
    costSum += row.netValue;
    if (row.marginPct != null) marginLineCount += 1;
  }
  return {
    lineCount: rows.length,
    qtySum,
    costSum,
    marginLineCount,
  };
}

export function paginateRows<T>(rows: T[], offset: number, limit: number): T[] {
  const start = Math.max(0, offset);
  return rows.slice(start, start + Math.max(1, limit));
}
