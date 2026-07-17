import * as XLSX from "xlsx";

import { baseSku } from "@/lib/osf/base-sku";
import type { OsfCatalogRow } from "@/lib/osf/catalog-rows";
import type { OsfResolvedColumn } from "@/lib/osf/column-config";
import type { ItemCostSupplier } from "@/lib/osf/erp-cost-supplier";
import type { ItemLastPurchase } from "@/lib/osf/erp-purchases";
import { stockForColumn } from "@/lib/osf/erp-stock";
import {
  cosmeticsMargin,
  formatMarginPercent,
  ogfMargin,
  orderQty,
  percentOfRop,
  seventyPercentAvailabilityLabel,
  seventyPercentOfRop,
} from "@/lib/osf/formulas";

export type OsfProfileData = {
  shopAvailability: string | null;
  ogfPrice: number | null;
  rops: Record<string, number>;
};

/** A buyer view: a named sheet limited to the buyer's assigned brands. */
export type OsfBuyerConfig = {
  name: string;
  /** Brand names owned by this buyer. Empty = all brands (full catalog). */
  brands: string[];
};

export type BuildWorkbookInput = {
  catalog: OsfCatalogRow[];
  columns: OsfResolvedColumn[];
  profiles: Map<string, OsfProfileData>;
  binMap: Map<string, number>;
  costMap: Map<string, ItemCostSupplier>;
  purchaseMap: Map<string, ItemLastPurchase>;
  monthlySales: Map<string, number>;
  salesMonth: string;
  asOfDate: string;
  /** Optional per-buyer sheets (no pricing columns), filtered by brand. */
  buyers?: OsfBuyerConfig[];
};

/** Describes one workbook column: its header + how it renders in the header band. */
type OsfColumnDef = {
  /** Row-3 header text; also the key used to read values from a built row. */
  header: string;
  /** Row-2 section label; only set on the first column of a section band. */
  section?: string;
  /** When true, row-1 shows the SUM of this column across the sheet's rows. */
  sum?: boolean;
  /** Pricing/purchasing columns — excluded from buyer sheets. */
  pricing?: boolean;
};

/** ISO date (YYYY-MM-DD) → dd.mm.yyyy banner label used in the header band. */
function formatDdMmYyyy(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** Whole days between an ISO date (YYYY-MM-DD) and the as-of date; null if unparseable. */
function daysBetween(fromDate: string | null, asOfDate: string): number | null {
  if (!fromDate) return null;
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${asOfDate}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

function skuForms(sku: string) {
  const base = baseSku(sku);
  return {
    variantSku: sku,
    skuUnderscore: sku.includes("_") ? sku : sku.replace(/-(\d+)$/, "_$1"),
    skuHyphen: sku.includes("-") ? sku : sku.replace(/_(\d+)$/, "-$1"),
    baseSku: base,
  };
}

function availabilityLabel(value: string | null | undefined): string {
  if (value === "allowed") return "Allowed";
  if (value === "not_allowed") return "Not Allowed";
  return "";
}

/** Identity + fixed calc/pricing headers (Excel Main order). Stock/ROP inserted dynamically. */
export function identityHeaders(): string[] {
  return [
    "Variant SKU",
    "Variant SKU (_)",
    "Variant SKU (-)",
    "Base SKU",
    "Item Status",
    "Shop Availability",
    "Description",
    "Brand",
    "Variant Barcode",
    "Country",
    "Image Src",
    "Site Status",
  ];
}

export function pricingHeaders(): string[] {
  return [
    "Cosmetics MRP",
    "Discounted Price",
    "OGF Price",
    "Latest Cost",
    "Latest supplier",
    "Last Purchase Qty",
    "Last Purchase Date",
    "Days Since Last Purchase",
    "Purchased (last 30d)",
    "Cosmetics Margin %",
    "OGF Margin %",
  ];
}

export function buildMainSheetRows(input: BuildWorkbookInput): Record<string, string | number | null>[] {
  const active = input.columns.filter((c) => c.active);
  const stockCols = active.filter((c) => c.includeInStock);
  const ropCols = active.filter((c) => c.includeInRop);

  // Precompute group totals for Common SKU
  const stockBySku = new Map<string, Record<string, number | null>>();
  const ropBySku = new Map<string, Record<string, number | null>>();
  const totalStockBySku = new Map<string, number>();
  const totalRopBySku = new Map<string, number>();

  for (const row of input.catalog) {
    const stocks: Record<string, number | null> = {};
    let totalStock = 0;
    for (const col of stockCols) {
      const qty = stockForColumn(input.binMap, col.warehouses, row.sku);
      stocks[col.key] = qty;
      if (qty != null) totalStock += qty;
    }
    stockBySku.set(row.sku, stocks);
    totalStockBySku.set(row.sku, totalStock);

    const profile = input.profiles.get(row.sku);
    const rops: Record<string, number | null> = {};
    let totalRop = 0;
    for (const col of ropCols) {
      const r = profile?.rops[col.key];
      const val = r != null && Number.isFinite(r) ? r : null;
      rops[col.key] = val;
      if (val != null) totalRop += val;
    }
    ropBySku.set(row.sku, rops);
    totalRopBySku.set(row.sku, totalRop);
  }

  const commonStock = new Map<string, number>();
  const commonRop = new Map<string, number>();
  for (const row of input.catalog) {
    const base = baseSku(row.sku);
    commonStock.set(base, (commonStock.get(base) ?? 0) + (totalStockBySku.get(row.sku) ?? 0));
    commonRop.set(base, (commonRop.get(base) ?? 0) + (totalRopBySku.get(row.sku) ?? 0));
  }

  const out: Record<string, string | number | null>[] = [];

  for (const row of input.catalog) {
    const forms = skuForms(row.sku);
    const profile = input.profiles.get(row.sku);
    const stocks = stockBySku.get(row.sku) ?? {};
    const rops = ropBySku.get(row.sku) ?? {};
    const totalStock = totalStockBySku.get(row.sku) ?? 0;
    const totalRop = totalRopBySku.get(row.sku) ?? 0;
    const common = forms.baseSku;
    const costInfo = input.costMap.get(row.sku);
    const purchase = input.purchaseMap.get(row.sku);
    // Latest Cost: prefer the ERP Item last_purchase_rate, else fall back to the
    // rate on the most recent Purchase Receipt (better populated). Feeds margins.
    const cost = costInfo?.cost ?? purchase?.rate ?? null;
    const ogf = profile?.ogfPrice ?? null;

    const record: Record<string, string | number | null> = {
      "Variant SKU": forms.variantSku,
      "Variant SKU (_)": forms.skuUnderscore,
      "Variant SKU (-)": forms.skuHyphen,
      "Base SKU": forms.baseSku,
      "Item Status": row.itemStatusLabel ?? "",
      "Shop Availability": availabilityLabel(profile?.shopAvailability),
      Description: row.productTitle,
      Brand: row.brand ?? "",
      "Variant Barcode": row.barcode ?? "",
      Country: "",
      "Image Src": row.imageUrl ?? "",
      "Site Status": row.siteStatus ?? "",
    };

    for (const col of stockCols) {
      record[col.label] = stocks[col.key];
    }
    record["Total Stock"] = totalStock;
    record["Common SKU Stock"] = commonStock.get(common) ?? 0;

    for (const col of ropCols) {
      const label = `${col.label} ROP`;
      record[label] = rops[col.key];
    }
    record["Common ROP"] = commonRop.get(common) ?? 0;
    const pct = percentOfRop(totalStock, totalRop > 0 ? totalRop : null);
    record["% of ROP"] = pct == null ? null : Math.round(pct * 10000) / 100;
    record["70% OF TOTAL ROP"] = seventyPercentOfRop(totalRop > 0 ? totalRop : null);
    record["70% OF TOTAL ROP AVAILABILITY"] = seventyPercentAvailabilityLabel(
      totalStock,
      totalRop > 0 ? totalRop : null,
    );

    let totalOrder = 0;
    for (const col of stockCols) {
      const ropCol = ropCols.find((r) => r.key === col.key);
      const ropVal = ropCol ? rops[col.key] : null;
      const oq = orderQty(ropVal, stocks[col.key]);
      record[`${col.label} ORDER QTY`] = oq;
      if (oq != null) totalOrder += oq;
    }
    record["TOTAL ORDER QTY"] = totalOrder;
    const commonReorder = orderQty(commonRop.get(common) ?? null, commonStock.get(common) ?? null);
    record["Common SKU Reorder"] = commonReorder;

    record["Cosmetics MRP"] = row.mrp;
    record["Discounted Price"] = row.discountedPrice;
    record["OGF Price"] = ogf;
    record["Latest Cost"] = cost;
    record["Latest supplier"] = purchase?.supplier ?? costInfo?.supplier ?? "";
    record["Last Purchase Qty"] = purchase?.qty ?? null;
    record["Last Purchase Date"] = purchase?.date ?? "";
    record["Days Since Last Purchase"] = daysBetween(purchase?.date ?? null, input.asOfDate);
    record["Purchased (last 30d)"] = purchase?.recentQty ?? null;
    record["Cosmetics Margin %"] = formatMarginPercent(cosmeticsMargin(row.mrp, cost));
    record["OGF Margin %"] = formatMarginPercent(ogfMargin(ogf, cost));
    record[`Sales Units (${input.salesMonth})`] = input.monthlySales.get(row.sku) ?? 0;

    out.push(record);
  }

  return out;
}

/**
 * Ordered column descriptors for the Main sheet. Header names must match the
 * keys produced by {@link buildMainSheetRows} exactly.
 */
export function mainColumnDescriptors(input: BuildWorkbookInput): OsfColumnDef[] {
  const active = input.columns.filter((c) => c.active);
  const stockCols = active.filter((c) => c.includeInStock);
  const ropCols = active.filter((c) => c.includeInRop);
  const dateLabel = formatDdMmYyyy(input.asOfDate);

  const defs: OsfColumnDef[] = [];
  for (const h of identityHeaders()) defs.push({ header: h });

  stockCols.forEach((c, i) =>
    defs.push({ header: c.label, section: i === 0 ? dateLabel : undefined, sum: true }),
  );
  defs.push({ header: "Total Stock", sum: true });
  defs.push({ header: "Common SKU Stock", sum: true });

  ropCols.forEach((c, i) =>
    defs.push({ header: `${c.label} ROP`, section: i === 0 ? "ROP" : undefined, sum: true }),
  );
  defs.push({ header: "Common ROP", sum: true });

  defs.push({ header: "% of ROP" });
  defs.push({ header: "70% OF TOTAL ROP", sum: true });
  defs.push({ header: "70% OF TOTAL ROP AVAILABILITY" });

  stockCols.forEach((c, i) =>
    defs.push({
      header: `${c.label} ORDER QTY`,
      section: i === 0 ? "REORDER Amount" : undefined,
      sum: true,
    }),
  );
  defs.push({ header: "TOTAL ORDER QTY", sum: true });
  defs.push({ header: "Common SKU Reorder", sum: true });

  defs.push({ header: "Cosmetics MRP", section: "price", pricing: true });
  defs.push({ header: "Discounted Price", pricing: true });
  defs.push({ header: "OGF Price", pricing: true });
  defs.push({ header: "Latest Cost", section: "Purchasing Cost", pricing: true });
  defs.push({ header: "Latest supplier", pricing: true });
  defs.push({ header: "Last Purchase Qty", pricing: true });
  defs.push({ header: "Last Purchase Date", pricing: true });
  defs.push({ header: "Days Since Last Purchase", pricing: true });
  defs.push({ header: "Purchased (last 30d)", pricing: true });
  defs.push({ header: "Cosmetics Margin %", pricing: true });
  defs.push({ header: "OGF Margin %", pricing: true });
  defs.push({ header: `Sales Units (${input.salesMonth})`, pricing: true });

  return defs;
}

type SheetCell = string | number | null;

/** Build an .xlsx worksheet with the 3-row header band (totals / sections / headers). */
function renderSheet(
  defs: OsfColumnDef[],
  rows: Record<string, string | number | null>[],
): XLSX.WorkSheet {
  const totalsRow: SheetCell[] = defs.map((c) => {
    if (!c.sum) return "";
    let total = 0;
    let seen = false;
    for (const r of rows) {
      const v = r[c.header];
      if (typeof v === "number" && Number.isFinite(v)) {
        total += v;
        seen = true;
      }
    }
    return seen ? total : "";
  });
  const sectionRow: SheetCell[] = defs.map((c) => c.section ?? "");
  const headerRow: SheetCell[] = defs.map((c) => c.header);
  const dataRows: SheetCell[][] = rows.map((r) =>
    defs.map((c) => {
      const v = r[c.header];
      return v == null ? "" : v;
    }),
  );

  return XLSX.utils.aoa_to_sheet([totalsRow, sectionRow, headerRow, ...dataRows]);
}

/** Excel-safe, unique sheet name (≤31 chars, no []:*?/\\). */
function sanitizeSheetName(name: string, used: Set<string>): string {
  const cleaned = (name || "Sheet").replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = cleaned;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` ${n++}`;
    candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export function buildOsfWorkbookBuffer(input: BuildWorkbookInput): Buffer {
  const rows = buildMainSheetRows(input);
  const defs = mainColumnDescriptors(input);
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  // Main sheet: every column including pricing.
  XLSX.utils.book_append_sheet(wb, renderSheet(defs, rows), sanitizeSheetName("Main", used));

  // Buyer sheets: identity/stock/ROP/order only (pricing hidden), filtered by brand.
  const buyerDefs = defs.filter((d) => !d.pricing);
  for (const buyer of input.buyers ?? []) {
    if (!buyer.name?.trim()) continue;
    const brandSet = new Set(
      buyer.brands.map((b) => b.trim().toLowerCase()).filter(Boolean),
    );
    const buyerRows =
      brandSet.size === 0
        ? rows
        : rows.filter((r) =>
            brandSet.has(String(r["Brand"] ?? "").trim().toLowerCase()),
          );
    XLSX.utils.book_append_sheet(
      wb,
      renderSheet(buyerDefs, buyerRows),
      sanitizeSheetName(buyer.name, used),
    );
  }

  // Stamp metadata on a tiny Info sheet.
  const info = XLSX.utils.aoa_to_sheet([
    ["asOfDate", input.asOfDate],
    ["salesMonth", input.salesMonth],
    ["rows", rows.length],
  ]);
  XLSX.utils.book_append_sheet(wb, info, sanitizeSheetName("Info", used));

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return buf;
}
