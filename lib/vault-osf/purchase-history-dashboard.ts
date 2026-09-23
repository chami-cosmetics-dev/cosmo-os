import {
  pickCosmoCatalogErpInstance,
  type CosmoCatalogErpCandidate,
  type CosmoCatalogLocationLink,
} from "@/lib/cosmo-catalog-erp";
import { originalSellingPrice } from "@/lib/osf/formulas";
import { sellingMargin } from "@/lib/osf/pricing-math";
import {
  isSubmittedPurchase,
  type PurchaseInvoiceLine,
} from "@/lib/vault-osf/erp-purchases-monthly";
import { isExcludedErpCompany } from "@/lib/vault-osf/types";

export type PurchaseHistorySource = "erp_invoice" | "cosmo";

/** Vault intercompany cash suppliers — hide from purchase history. */
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

/** Vault: all ERP instances. Cosmo: Cosmetics.lk / ERP1 only. */
export function selectPurchaseHistoryErpInstances<T extends CosmoCatalogErpCandidate>(
  instances: T[],
  input: { vault: boolean; locations: CosmoCatalogLocationLink[] },
): T[] {
  if (input.vault || instances.length <= 1) return instances;
  const picked = pickCosmoCatalogErpInstance({
    locations: input.locations,
    instances,
  });
  if (!picked) return instances;
  return instances.filter((row) => row.id === picked.id);
}

export function purchaseInvoiceFormUrl(baseUrl: string, invoiceName: string): string | null {
  const root = baseUrl.trim().replace(/\/$/, "");
  const name = invoiceName.trim();
  if (!root || !name) return null;
  return `${root}/app/purchase-invoice/${encodeURIComponent(name)}`;
}

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
  invoiceUrl?: string | null;
};

export type CatalogSellInfo = {
  productTitle: string | null;
  brand: string | null;
  priority: string | null;
  mrp: number | null;
  discountedPrice: number | null;
};

export type PurchaseHistoryRow = {
  postingDate: string;
  sku: string;
  brand: string | null;
  priority: string | null;
  productTitle: string | null;
  supplier: string;
  qty: number;
  rate: number;
  netValue: number;
  selling: number | null;
  marginPct: number | null;
  source: PurchaseHistorySource;
  sourceRef: string | null;
  invoiceUrl: string | null;
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
  /** Matches catalog product title (contains, case-insensitive). */
  description?: string;
  priority?: string;
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
    invoiceUrl: null,
  };
}

export function erpInvoiceLineToRaw(
  row: PurchaseInvoiceLine,
  erpBaseUrl?: string,
): PurchaseHistoryRawLine | null {
  if (!isSubmittedPurchase(row)) return null;
  if (isExcludedErpCompany(row.company ?? "")) return null;
  if (isIntercompanyPurchaseSupplier(row.supplier, row.supplier_name)) return null;
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
    source: "erp_invoice",
    invoiceUrl: sourceRef && erpBaseUrl ? purchaseInvoiceFormUrl(erpBaseUrl, sourceRef) : null,
  };
}

/**
 * Merge Cosmo + ERP invoice lines. Invoice wins on matching dedupe key.
 * Result sorted newest postingDate first, then sku.
 */
export function mergePurchaseHistoryLines(
  cosmo: PurchaseHistoryRawLine[],
  erpInvoices: PurchaseHistoryRawLine[],
): PurchaseHistoryRawLine[] {
  const map = new Map<string, PurchaseHistoryRawLine>();
  for (const line of cosmo) {
    if (isIntercompanyPurchaseSupplier(line.supplier, line.supplier)) continue;
    map.set(purchaseHistoryDedupeKey(line), line);
  }
  for (const line of erpInvoices) {
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
  const skuQ = filters.sku?.trim().toLowerCase() ?? "";
  if (skuQ) {
    if (!line.sku.toLowerCase().includes(skuQ)) return false;
  } else if (line.postingDate < filters.from || line.postingDate > filters.to) {
    return false;
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
  if (filters.description) {
    const q = filters.description.trim().toLowerCase();
    const title = catalog?.productTitle?.trim().toLowerCase() ?? "";
    if (q && !title.includes(q)) return false;
  }
  if (filters.priority) {
    const q = filters.priority.trim().toLowerCase();
    const priority = catalog?.priority?.trim().toLowerCase() ?? "";
    if (q && priority !== q) return false;
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
    priority: catalog?.priority ?? null,
    productTitle: catalog?.productTitle ?? null,
    supplier: line.supplier,
    qty: line.qty,
    rate: line.rate,
    netValue: line.netValue,
    selling,
    marginPct,
    source: line.source,
    sourceRef: line.sourceRef,
    invoiceUrl: line.invoiceUrl ?? null,
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
