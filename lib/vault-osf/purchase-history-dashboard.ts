import { baseSku } from "@/lib/osf/base-sku";
import { originalSellingPrice } from "@/lib/osf/formulas";
import { formatPercentPoints, sellingMargin } from "@/lib/osf/pricing-math";
import { isIntercompanyPurchaseSupplier } from "@/lib/osf/erp-purchases";
import {
  isSubmittedPurchase,
  type PurchaseInvoiceLine,
} from "@/lib/vault-osf/erp-purchases-monthly";
import { isExcludedErpCompany } from "@/lib/vault-osf/types";

export type PurchaseHistorySource = "erp_invoice" | "cosmo";
export type PurchaseHistoryErpSlot = "ERP1" | "ERP2";

export { isIntercompanyPurchaseSupplier };

export const VAULT_ERP_COMPANY_OPTIONS = [
  "SupplementVault.lk",
  "Origins (PVT) LTD",
  "AE (PVT) LTD",
] as const;

export const COSMO_ERP_COMPANY_OPTIONS = ["Cosmetics.lk"] as const;

const COMPANY_ALIAS_KEY: Record<string, string> = {
  supplement: "SupplementVault.lk",
  supplemental: "SupplementVault.lk",
  supplementvault: "SupplementVault.lk",
  supplementvaultlk: "SupplementVault.lk",
  origins: "Origins (PVT) LTD",
  originspvtltd: "Origins (PVT) LTD",
  ae: "AE (PVT) LTD",
  aepvtltd: "AE (PVT) LTD",
  cosmetics: "Cosmetics.lk",
  cosmeticslk: "Cosmetics.lk",
};

function companyAliasKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function canonicalizePurchaseHistoryCompany(
  name: string | null | undefined,
): string | null {
  const raw = (name ?? "").trim();
  if (!raw || isExcludedErpCompany(raw)) return null;
  return COMPANY_ALIAS_KEY[companyAliasKey(raw)] ?? raw;
}

export function parsePurchaseHistoryCompanies(
  value: string | string[] | null | undefined,
): string[] {
  const parts = Array.isArray(value) ? value : (value ?? "").split(",");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const canonical = canonicalizePurchaseHistoryCompany(part);
    if (!canonical) continue;
    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(canonical);
  }
  return out;
}

export function purchaseHistoryErpCompanyOptions(
  fromErpCompanies: Iterable<string | null | undefined>,
  extras: readonly string[] = [],
): string[] {
  const set = new Set<string>();
  for (const extra of extras) {
    const canonical = canonicalizePurchaseHistoryCompany(extra);
    if (canonical) set.add(canonical);
  }
  for (const name of fromErpCompanies) {
    const canonical = canonicalizePurchaseHistoryCompany(name);
    if (canonical) set.add(canonical);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Both OS: every configured ERP instance (ERP1 + ERP2). */
export function selectPurchaseHistoryErpInstances<T>(instances: T[]): T[] {
  return instances;
}

export function purchaseHistoryErpSlot(
  instanceId: string,
  slots: { erp1Id: string | null; erp2Id: string | null },
): PurchaseHistoryErpSlot | null {
  if (slots.erp1Id && instanceId === slots.erp1Id) return "ERP1";
  if (slots.erp2Id && instanceId === slots.erp2Id) return "ERP2";
  return null;
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
  company?: string | null;
  erpSlot?: PurchaseHistoryErpSlot | null;
};

export type CatalogSellInfo = {
  productTitle: string | null;
  brand: string | null;
  priority: string | null;
  country?: string | null;
  mrp: number | null;
  discountedPrice: number | null;
};

export type PurchaseHistoryRow = {
  postingDate: string;
  sku: string;
  commonSku: string | null;
  brand: string | null;
  priority: string | null;
  productTitle: string | null;
  country: string | null;
  supplier: string;
  qty: number;
  rate: number;
  netValue: number;
  selling: number | null;
  marginPct: number | null;
  source: PurchaseHistorySource;
  sourceRef: string | null;
  invoiceUrl: string | null;
  company: string | null;
  erpSlot: PurchaseHistoryErpSlot | null;
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
  commonSku?: string;
  supplier?: string;
  brand?: string;
  /** Matches catalog product title (contains, case-insensitive). */
  description?: string;
  priority?: string;
  company?: string;
  companies?: string[];
  country?: string;
  /** Keep rows whose margin % is strictly below this number (e.g. 30). */
  marginBelow?: number;
  erpSlot?: string;
};

/** Prefer sourceRef+sku; else sku+date+supplier+qty+rate. */
export function purchaseHistoryDedupeKey(line: PurchaseHistoryRawLine): string {
  const sku = line.sku.trim().toLowerCase();
  const ref = line.sourceRef?.trim();
  const company = (line.company ?? line.excelCompany ?? "").trim().toLowerCase();
  const slot = (line.erpSlot ?? "").trim().toLowerCase();
  if (ref) return `ref:${ref.toLowerCase()}|${sku}|${company}|${slot}`;
  const supplier = line.supplier.trim().toLowerCase();
  const qty = Number.isFinite(line.qty) ? String(line.qty) : "0";
  const rate = Number.isFinite(line.rate) ? String(line.rate) : "0";
  return `fb:${sku}|${line.postingDate}|${supplier}|${qty}|${rate}|${company}|${slot}`;
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
    company: canonicalizePurchaseHistoryCompany(line.excelCompany),
    erpSlot: null,
  };
}

export function erpInvoiceLineToRaw(
  row: PurchaseInvoiceLine,
  erpBaseUrl?: string,
  extras?: { erpSlot?: PurchaseHistoryErpSlot | null },
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
    company: canonicalizePurchaseHistoryCompany(row.company),
    erpSlot: extras?.erpSlot ?? null,
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
    if (isExcludedErpCompany(line.excelCompany) || isExcludedErpCompany(line.company)) continue;
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
  const selectedCompanies = parsePurchaseHistoryCompanies(
    filters.companies ?? filters.company,
  );
  if (selectedCompanies.length > 0) {
    const company = canonicalizePurchaseHistoryCompany(line.company ?? line.excelCompany);
    if (!company || !selectedCompanies.some((c) => c.toLowerCase() === company.toLowerCase())) {
      return false;
    }
  }
  if (filters.erpSlot) {
    const q = filters.erpSlot.trim().toUpperCase();
    if (q && (line.erpSlot ?? "") !== q) return false;
  }
  if (filters.commonSku) {
    const q = filters.commonSku.trim().toLowerCase();
    const common = baseSku(line.sku).toLowerCase();
    if (q && !common.includes(q)) return false;
  }
  if (filters.country) {
    const q = filters.country.trim().toLowerCase();
    const country = catalog?.country?.trim().toLowerCase() ?? "";
    if (q && country !== q) return false;
  }
  if (filters.marginBelow != null && Number.isFinite(filters.marginBelow)) {
    const selling = originalSellingPrice(catalog?.mrp, catalog?.discountedPrice);
    const margin = sellingMargin(selling, line.rate);
    const points = formatPercentPoints(margin);
    if (points == null || points >= filters.marginBelow) return false;
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
    commonSku: baseSku(line.sku) || null,
    brand: catalog?.brand ?? null,
    priority: catalog?.priority ?? null,
    productTitle: catalog?.productTitle ?? null,
    country: catalog?.country?.trim() || null,
    supplier: line.supplier,
    qty: line.qty,
    rate: line.rate,
    netValue: line.netValue,
    selling,
    marginPct,
    source: line.source,
    sourceRef: line.sourceRef,
    invoiceUrl: line.invoiceUrl ?? null,
    company: canonicalizePurchaseHistoryCompany(line.company ?? line.excelCompany),
    erpSlot: line.erpSlot ?? null,
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

export function purchaseHistoryExportSheetRows(
  rows: PurchaseHistoryRow[],
): Array<Record<string, string | number>> {
  return rows.map((row) => {
    const marginPts = formatPercentPoints(row.marginPct);
    return {
      Date: row.postingDate,
      SKU: row.sku,
      "Common SKU": row.commonSku ?? "",
      Brand: row.brand ?? "",
      Priority: row.priority ?? "",
      Item: row.productTitle ?? "",
      Supplier: row.supplier,
      Company: row.company ?? "",
      Country: row.country ?? "",
      Qty: row.qty,
      Cost: row.rate,
      Amount: row.netValue,
      Sell: row.selling ?? "",
      "Margin %": marginPts ?? "",
      Source: row.source === "erp_invoice" ? "Invoice" : "File",
      ERP: row.erpSlot ?? "",
      Invoice: row.sourceRef ?? "",
    };
  });
}
