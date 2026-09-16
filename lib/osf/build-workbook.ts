import type { OsfCatalogRow } from "@/lib/osf/catalog-rows";
import {
  OSF_ACCESS_SALES_UNITS,
  orderAccessKey,
  ropAccessKey,
  stockAccessKey,
} from "@/lib/osf/column-access-catalog";
import type { OsfResolvedColumn } from "@/lib/osf/column-config";
import type { ItemCostSupplier } from "@/lib/osf/erp-cost-supplier";
import type { ItemLastPurchase } from "@/lib/osf/erp-purchases";
import { stockForColumn } from "@/lib/osf/erp-stock";
import {
  cosmeticsMargin,
  formatMarginPercent,
  ogfMargin,
  orderQty,
  originalSellingPrice,
  percentOfRop,
  seventyPercentAvailabilityLabel,
  seventyPercentOfRop,
  sumSignedOrderQtysFlooredAtZero,
} from "@/lib/osf/formulas";
import { baseSku } from "@/lib/osf/base-sku";
import type { OsfVariant } from "@/lib/osf/vat-membership";
import {
  findCosmeticsLkRopColumn,
  selectVatRopColumns,
  totalRopForColumns,
  totalRopForVat,
} from "@/lib/osf/vat-rop-columns";
import {
  applyOsfWorkbookHeaderBands,
  type OsfWorkbookBandKey,
} from "@/lib/osf/workbook-band-styles";

export type OsfProfileData = {
  shopAvailability: string | null;
  ogfPrice: number | null;
  reorderThresholdPercent?: number | null;
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
  /** When true, Info sheet explains reorder-only / empty filter. */
  belowThresholdOnly?: boolean;
  /**
   * Column access keys allowed on Main for the downloading user.
   * `"all"` or omit = unrestricted. Identity columns always included.
   */
  effectiveColumnKeys?: Set<string> | "all";
  /** Optional per-buyer sheets (no pricing columns), filtered by brand. */
  buyers?: OsfBuyerConfig[];
  /** Main / VAT / Non-VAT — VAT restricts ROP columns and Total ROP math. */
  osfVariant?: OsfVariant;
};

function resolveRopColumns(
  columns: OsfResolvedColumn[],
  variant: OsfVariant,
): { ropCols: OsfResolvedColumn[]; cosmeticsLkKey: string | null } {
  const activeRop = columns.filter((c) => c.active && c.includeInRop);
  if (variant === "vat") {
    const ropCols = selectVatRopColumns(columns);
    return {
      ropCols,
      cosmeticsLkKey: findCosmeticsLkRopColumn(ropCols)?.key ?? null,
    };
  }
  return { ropCols: activeRop, cosmeticsLkKey: null };
}

function resolveTotalRop(
  rops: Record<string, number | null | undefined> | undefined,
  ropCols: OsfResolvedColumn[],
  variant: OsfVariant,
  cosmeticsLkKey: string | null,
): number {
  if (variant === "vat") return totalRopForVat(rops, cosmeticsLkKey);
  return totalRopForColumns(rops, ropCols);
}

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
  /**
   * Stable access id for per-user visibility. `null`/undefined = identity (always on).
   */
  accessKey?: string | null;
  /** Color band for styled Excel output. */
  band?: OsfWorkbookBandKey;
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

/** Identity headers (Excel Main order — matches current OSF download). */
export function identityHeaders(): string[] {
  return [
    "Variant SKU (_)",
    "Base SKU",
    "ERP1 Priority",
    "ERP2 Priority",
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
  const variant = input.osfVariant ?? "main";
  const active = input.columns.filter((c) => c.active);
  const stockCols = active.filter((c) => c.includeInStock);
  const { ropCols, cosmeticsLkKey } = resolveRopColumns(input.columns, variant);

  // Precompute per-SKU stock / ROP totals
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
    for (const col of ropCols) {
      const r = profile?.rops[col.key];
      const val = r != null && Number.isFinite(r) ? r : null;
      rops[col.key] = val;
    }
    ropBySku.set(row.sku, rops);
    totalRopBySku.set(row.sku, resolveTotalRop(rops, ropCols, variant, cosmeticsLkKey));
  }

  const buyTotalBySku = new Map<string, number>();

  for (const row of input.catalog) {
    const stocks = stockBySku.get(row.sku) ?? {};
    const rops = ropBySku.get(row.sku) ?? {};
    const orderVals: Array<number | null> = [];
    for (const col of stockCols) {
      const ropCol = ropCols.find((r) => r.key === col.key);
      const ropVal = ropCol ? rops[col.key] : null;
      orderVals.push(orderQty(ropVal, stocks[col.key]));
    }
    buyTotalBySku.set(row.sku, sumSignedOrderQtysFlooredAtZero(orderVals));
  }

  const out: Record<string, string | number | null>[] = [];

  for (const row of input.catalog) {
    const forms = skuForms(row.sku);
    const profile = input.profiles.get(row.sku);
    const stocks = stockBySku.get(row.sku) ?? {};
    const rops = ropBySku.get(row.sku) ?? {};
    const totalStock = totalStockBySku.get(row.sku) ?? 0;
    const totalRop = totalRopBySku.get(row.sku) ?? 0;
    const costInfo = input.costMap.get(row.sku);
    const purchase = input.purchaseMap.get(row.sku);
    // Latest Cost: prefer the ERP Item last_purchase_rate, else fall back to the
    // rate on the most recent Purchase Receipt (better populated). Feeds margins.
    const cost = costInfo?.cost ?? purchase?.rate ?? null;
    const ogf = profile?.ogfPrice ?? null;

    const record: Record<string, string | number | null> = {
      "Variant SKU (_)": forms.skuUnderscore,
      "Base SKU": forms.baseSku,
      "ERP1 Priority": row.erp1ProductPriority ?? "",
      "ERP2 Priority": row.erp2ProductPriority ?? "",
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

    for (const col of ropCols) {
      const label = `${col.label} ROP`;
      record[label] = rops[col.key];
    }
    record["Total ROP"] = totalRop;
    const pct = percentOfRop(totalStock, totalRop > 0 ? totalRop : null);
    record["% of ROP"] = pct == null ? null : Math.round(pct * 10000) / 100;
    record["70% OF TOTAL ROP"] = seventyPercentOfRop(totalRop > 0 ? totalRop : null);
    record["70% OF TOTAL ROP AVAILABILITY"] = seventyPercentAvailabilityLabel(
      totalStock,
      totalRop > 0 ? totalRop : null,
    );

    const orderVals: Array<number | null> = [];
    for (const col of stockCols) {
      const ropCol = ropCols.find((r) => r.key === col.key);
      const ropVal = ropCol ? rops[col.key] : null;
      const oq = orderQty(ropVal, stocks[col.key]);
      record[`${col.label} ORDER QTY`] = oq;
      orderVals.push(oq);
    }
    record["TOTAL ORDER QTY"] =
      buyTotalBySku.get(row.sku) ?? sumSignedOrderQtysFlooredAtZero(orderVals);

    const listPrice = originalSellingPrice(row.mrp, row.discountedPrice);
    record["Cosmetics MRP"] = listPrice;
    record["Discounted Price"] = row.discountedPrice;
    record["OGF Price"] = ogf;
    record["Latest Cost"] = cost;
    record["Latest supplier"] = purchase?.supplier ?? costInfo?.supplier ?? "";
    record["Last Purchase Qty"] = purchase?.qty ?? null;
    record["Last Purchase Date"] = purchase?.date ?? "";
    record["Days Since Last Purchase"] = daysBetween(purchase?.date ?? null, input.asOfDate);
    record["Purchased (last 30d)"] = purchase?.recentQty ?? null;
    record["Cosmetics Margin %"] = formatMarginPercent(cosmeticsMargin(listPrice, cost));
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
  const variant = input.osfVariant ?? "main";
  const active = input.columns.filter((c) => c.active);
  const stockCols = active.filter((c) => c.includeInStock);
  const { ropCols } = resolveRopColumns(input.columns, variant);
  const dateLabel = formatDdMmYyyy(input.asOfDate);

  const defs: OsfColumnDef[] = [];
  for (const h of identityHeaders()) defs.push({ header: h, accessKey: null, band: "identity" });

  stockCols.forEach((c, i) =>
    defs.push({
      header: c.label,
      section: i === 0 ? dateLabel : undefined,
      sum: true,
      accessKey: stockAccessKey(c.key),
      band: "stock",
    }),
  );
  defs.push({ header: "Total Stock", sum: true, accessKey: "Total Stock", band: "stock" });

  ropCols.forEach((c, i) =>
    defs.push({
      header: `${c.label} ROP`,
      section: i === 0 ? "ROP" : undefined,
      sum: true,
      accessKey: ropAccessKey(c.key),
      band: "rop",
    }),
  );
  defs.push({ header: "Total ROP", sum: true, accessKey: "Total ROP", band: "rop" });

  defs.push({ header: "% of ROP", accessKey: "% of ROP", band: "calc" });
  defs.push({ header: "70% OF TOTAL ROP", sum: true, accessKey: "70% OF TOTAL ROP", band: "calc" });
  defs.push({
    header: "70% OF TOTAL ROP AVAILABILITY",
    accessKey: "70% OF TOTAL ROP AVAILABILITY",
    band: "calc",
  });

  stockCols.forEach((c, i) =>
    defs.push({
      header: `${c.label} ORDER QTY`,
      section: i === 0 ? "REORDER Amount" : undefined,
      sum: true,
      accessKey: orderAccessKey(c.key),
      band: "order",
    }),
  );
  defs.push({ header: "TOTAL ORDER QTY", sum: true, accessKey: "TOTAL ORDER QTY", band: "order" });

  defs.push({
    header: "Cosmetics MRP",
    section: "price",
    pricing: true,
    accessKey: "Cosmetics MRP",
    band: "price",
  });
  defs.push({
    header: "Discounted Price",
    pricing: true,
    accessKey: "Discounted Price",
    band: "price",
  });
  defs.push({ header: "OGF Price", pricing: true, accessKey: "OGF Price", band: "price" });
  defs.push({
    header: "Latest Cost",
    section: "Purchasing Cost",
    pricing: true,
    accessKey: "Latest Cost",
    band: "cost",
  });
  defs.push({
    header: "Latest supplier",
    pricing: true,
    accessKey: "Latest supplier",
    band: "cost",
  });
  defs.push({
    header: "Last Purchase Qty",
    pricing: true,
    accessKey: "Last Purchase Qty",
    band: "cost",
  });
  defs.push({
    header: "Last Purchase Date",
    pricing: true,
    accessKey: "Last Purchase Date",
    band: "cost",
  });
  defs.push({
    header: "Days Since Last Purchase",
    pricing: true,
    accessKey: "Days Since Last Purchase",
    band: "cost",
  });
  defs.push({
    header: "Purchased (last 30d)",
    pricing: true,
    accessKey: "Purchased (last 30d)",
    band: "cost",
  });
  defs.push({
    header: "Cosmetics Margin %",
    pricing: true,
    accessKey: "Cosmetics Margin %",
    band: "cost",
  });
  defs.push({
    header: "OGF Margin %",
    pricing: true,
    accessKey: "OGF Margin %",
    band: "cost",
  });
  defs.push({
    header: `Sales Units (${input.salesMonth})`,
    pricing: true,
    accessKey: OSF_ACCESS_SALES_UNITS,
    band: "sales",
  });

  return defs;
}

type SheetCell = string | number | null;

function cellValue(v: SheetCell): string | number {
  return v == null ? "" : v;
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

/** Filter column defs by access keys (identity / null accessKey always included). */
export function filterColumnDefsByAccessKeys(
  defs: OsfColumnDef[],
  keys?: Set<string> | "all",
): OsfColumnDef[] {
  if (keys == null || keys === "all") return defs;
  return defs.filter((d) => d.accessKey == null || keys.has(d.accessKey));
}

/** @deprecated Prefer {@link filterColumnDefsByAccessKeys}. */
export function filterColumnDefsByGroups(
  defs: OsfColumnDef[],
  _groups?: string[],
): OsfColumnDef[] {
  return defs;
}

export async function buildOsfWorkbookBuffer(input: BuildWorkbookInput): Promise<Buffer> {
  const ExcelJS = await import("exceljs");
  const rows = buildMainSheetRows(input);
  const defs = mainColumnDescriptors(input);
  const mainDefs = filterColumnDefsByAccessKeys(defs, input.effectiveColumnKeys ?? "all");
  const wb = new ExcelJS.Workbook();
  const used = new Set<string>();

  const attachSheet = (
    sheetName: string,
    sheetDefs: OsfColumnDef[],
    sheetRows: Record<string, string | number | null>[],
  ) => {
    const name = sanitizeSheetName(sheetName, used);
    const ws = wb.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 2 }],
    });

    const sectionRow: SheetCell[] = sheetDefs.map((c) => c.section ?? "");
    const headerRow: SheetCell[] = sheetDefs.map((c) => c.header);

    ws.addRow(sectionRow.map(cellValue));
    ws.addRow(headerRow.map(cellValue));
    for (const r of sheetRows) {
      ws.addRow(
        sheetDefs.map((c) => cellValue(r[c.header] == null ? "" : (r[c.header] as SheetCell))),
      );
    }

    applyOsfWorkbookHeaderBands(ws, sheetDefs);
  };

  attachSheet("Main", mainDefs, rows);

  const buyerDefs = filterColumnDefsByAccessKeys(
    defs.filter((d) => !d.pricing),
    input.effectiveColumnKeys ?? "all",
  );
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
    attachSheet(buyer.name, buyerDefs, buyerRows);
  }

  const info = wb.addWorksheet(sanitizeSheetName("Info", used));
  info.addRow(["asOfDate", input.asOfDate]);
  info.addRow(["salesMonth", input.salesMonth]);
  info.addRow(["osfVariant", input.osfVariant ?? "main"]);
  info.addRow(["rows", rows.length]);
  if (input.belowThresholdOnly) {
    info.addRow(["mode", "reorder-only (below threshold %)"]);
    if (rows.length === 0) {
      info.addRow([
        "notice",
        "No SKUs met the filter. A SKU is included only when total ROP > 0 and (total stock / total ROP) × 100 is below its reorder threshold % (default 70). SKUs without warehouse ROP are excluded.",
      ]);
    }
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
