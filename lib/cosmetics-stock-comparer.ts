import { isShopWarehouseName } from "@/lib/item-trends/shop-warehouse-name";
import { baseSku } from "@/lib/osf/base-sku";
import { percentOfRop } from "@/lib/osf/formulas";
import { isShopOsfColumn } from "@/lib/store-allocation/osf-columns";

export type StockBalanceRow = {
  Item: unknown;
  "Item Name": unknown;
  Company: unknown;
  Warehouse: unknown;
  "Balance Qty": unknown;
  "__ERP Source"?: unknown;
};

export type LocationStock = {
  name: string;
  qty: number;
  kind: "online" | "shop";
  warehouse: string;
};

export type CosmeticsStockReportRow = {
  SKU: string;
  "Product Title": string;
  "Main Warehouse Qty": number;
  "90-day Sales": number;
  Critical: "Yes" | "";
  "Online Warehouse(s)": string;
  "Online Qty": number | "";
  "Shop Warehouse(s)": string;
  "Shop Qty": number | "";
  "Stock Available Elsewhere": "Yes" | "No";
};

export type CosmeticsStockReportDetail = CosmeticsStockReportRow & {
  sales90d: number;
  critical: boolean;
  online: LocationStock[];
  shops: LocationStock[];
  /** Cosmetics main qty when the subject column is a different warehouse. */
  cosmeticsMainQty?: number | null;
  /** Reorder point for the subject warehouse (focus, else Cosmetics main). */
  rop?: number | null;
  /** Subject stock ÷ ROP × 100. Null when ROP is missing or zero. */
  stockPctOfRop?: number | null;
  commonSku?: string;
  erp1ProductPriority?: string | null;
  erp2ProductPriority?: string | null;
  vatStatus?: string;
};

export type BrandWarehouseViolation = {
  SKU: string;
  "Product Title": string;
  Brand: string;
  "ERP Source": string;
  Warehouse: string;
  "Balance Qty": number;
  Rule: string;
};

export const COSMETICS_STOCK_REPORT_HEADERS = [
  "SKU",
  "Product Title",
  "Main Warehouse Qty",
  "90-day Sales",
  "Critical",
  "Online Warehouse(s)",
  "Online Qty",
  "Shop Warehouse(s)",
  "Shop Qty",
  "Stock Available Elsewhere",
] as const;

export const BRAND_WAREHOUSE_VIOLATION_HEADERS = [
  "SKU",
  "Product Title",
  "Brand",
  "ERP Source",
  "Warehouse",
  "Balance Qty",
  "Rule",
] as const;

const MAIN_COSMO_WAREHOUSE = "main warehouse - cosmo";

const COSMETICS_ONLY_BRANDS = [
  "Keune",
  "Jovees",
  "Savol",
  "Palmers",
  "Olay",
  "Melano",
  "Acnes",
  "Hada Labo",
  "Lipice",
  "Wella",
  "ZGTS",
];
const OTHER_WAREHOUSE_ONLY_BRANDS = [
  "Sanford",
  "Golden Rose",
  "Maybeline",
  "Revlon",
  "The Elf",
  "Biovene",
  "Flamingo",
];

const OUTLET_ALIASES = new Map<string, string>([
  ["pevi", "Pevi"],
  ["spk", "SPK"],
  ["dtd", "DTD"],
  ["mnk", "Cool Planet"],
  ["cool planet", "Cool Planet"],
  ["chami", "GCC"],
  ["gcc", "GCC"],
  ["ajs", "Kiribathgoda"],
  ["kiribathgoda", "Kiribathgoda"],
  ["dro", "Maharagama"],
  ["maharagama", "Maharagama"],
  ["lwk", "OGF"],
  ["ogf", "OGF"],
  ["lmj", "Pepiliyana"],
  ["pepiliyana", "Pepiliyana"],
]);

type ParsedStockRow = {
  sku: string;
  productTitle: string;
  company: string;
  warehouse: string;
  qty: number;
  erpSource: "ERP1" | "ERP2" | "";
};

type LocationKind = "main" | "shop" | "online";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function key(value: string): string {
  return value.trim().toLowerCase();
}

function parseQty(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(clean(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isAllWarehouses(warehouse: string): boolean {
  return key(warehouse).includes("all warehouses");
}

function parseRows(inputRows: StockBalanceRow[]): ParsedStockRow[] {
  return inputRows
    .map((row): ParsedStockRow => ({
      sku: clean(row.Item),
      productTitle: clean(row["Item Name"]),
      company: clean(row.Company),
      warehouse: clean(row.Warehouse),
      qty: parseQty(row["Balance Qty"]),
      erpSource: normalizeErpSource(row["__ERP Source"]),
    }))
    .filter((row) => row.sku && row.warehouse && !isAllWarehouses(row.warehouse));
}

function normalizeErpSource(value: unknown): "ERP1" | "ERP2" | "" {
  const normalized = key(clean(value));
  if (/\berp[\s_-]*1\b/.test(normalized)) return "ERP1";
  if (/\berp[\s_-]*2\b/.test(normalized)) return "ERP2";
  return "";
}

function findBrand(productTitle: string, brands: string[]): string | null {
  const normalizedTitle = key(productTitle);
  return brands.find((brand) => normalizedTitle.includes(key(brand))) ?? null;
}

function normalizeOutletName(value: string): string {
  const raw = clean(value);
  const normalized = key(raw);
  for (const [alias, outlet] of OUTLET_ALIASES) {
    if (normalized === alias || normalized.includes(alias)) return outlet;
  }
  return OUTLET_ALIASES.get(normalized) ?? raw;
}

function outletFromRow(row: ParsedStockRow): string {
  const warehouse = row.warehouse
    .replace(/shop warehouse/gi, "")
    .replace(/main warehouse/gi, "")
    .replace(/\s+-\s+/g, " ")
    .replace(/^[-\s]+/, "")
    .trim();
  const warehouseOutlet = normalizeOutletName(warehouse);
  if (warehouseOutlet) return warehouseOutlet;

  return normalizeOutletName(row.company);
}

export function classifyWarehouseKind(warehouse: string): LocationKind {
  const wh = key(warehouse);
  if (!wh || isAllWarehouses(warehouse)) return "online";
  if (wh === MAIN_COSMO_WAREHOUSE) return "main";
  if (isShopWarehouseName(warehouse)) return "shop";
  return "online";
}

function pickComparisonRow(rows: ParsedStockRow[]): ParsedStockRow | null {
  const shop = rows.find((row) => key(row.warehouse).includes("shop warehouse"));
  if (shop) return shop;
  return rows.find((row) => key(row.warehouse).includes("main warehouse")) ?? rows[0] ?? null;
}

function summarizeLocations(rows: LocationStock[]): { warehouses: string; qty: number | "" } {
  if (rows.length === 0) return { warehouses: "", qty: "" };
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  return {
    warehouses: sorted.map((row) => row.name).join(", "),
    qty: sorted.reduce((sum, row) => sum + row.qty, 0),
  };
}

function toDetail(
  mainRow: ParsedStockRow,
  online: LocationStock[],
  shops: LocationStock[],
  sales90d = 0,
  critical = false,
  cosmeticsMainQty: number | null = null,
): CosmeticsStockReportDetail {
  const onlineSummary = summarizeLocations(online);
  const shopSummary = summarizeLocations(shops);
  return {
    SKU: mainRow.sku,
    "Product Title": mainRow.productTitle,
    "Main Warehouse Qty": mainRow.qty,
    "90-day Sales": sales90d,
    Critical: critical ? "Yes" : "",
    "Online Warehouse(s)": onlineSummary.warehouses,
    "Online Qty": onlineSummary.qty,
    "Shop Warehouse(s)": shopSummary.warehouses,
    "Shop Qty": shopSummary.qty,
    "Stock Available Elsewhere": online.length + shops.length > 0 ? "Yes" : "No",
    sales90d,
    critical,
    online,
    shops,
    cosmeticsMainQty,
  };
}

/** Outlet main/back stock and shop-floor stock stay in separate lists, including a zero when the other side has stock. */
function partitionLocations(
  skuRows: ParsedStockRow[],
  excludeWarehouses: Set<string>,
): { online: LocationStock[]; shops: LocationStock[] } {
  const groups = new Map<string, ParsedStockRow[]>();
  for (const row of skuRows) {
    const warehouseKey = key(row.warehouse);
    if (!warehouseKey || excludeWarehouses.has(warehouseKey)) continue;
    if (classifyWarehouseKind(row.warehouse) === "main") continue;
    const outletKey = key(outletFromRow(row)) || warehouseKey;
    groups.set(outletKey, [...(groups.get(outletKey) ?? []), row]);
  }

  const online: LocationStock[] = [];
  const shops: LocationStock[] = [];
  for (const groupRows of groups.values()) {
    const shopRows = groupRows.filter((row) => classifyWarehouseKind(row.warehouse) === "shop");
    const otherRows = groupRows.filter((row) => classifyWarehouseKind(row.warehouse) !== "shop");
    const shopQty = shopRows.reduce((sum, row) => sum + row.qty, 0);
    const otherQty = otherRows.reduce((sum, row) => sum + row.qty, 0);
    if (otherQty <= 0 && shopQty <= 0) continue;

    const showBoth = otherRows.length > 0 && shopRows.length > 0;
    const otherSelected = otherRows.find((row) => row.qty > 0) ?? otherRows[0] ?? null;
    const shopSelected = pickComparisonRow(shopRows);
    if (otherSelected && (otherQty > 0 || showBoth)) {
      const outletName = outletFromRow(otherSelected);
      online.push({
        name: outletName || otherSelected.warehouse,
        qty: otherQty,
        kind: "online",
        warehouse: otherSelected.warehouse,
      });
    }
    if (shopSelected && (shopQty > 0 || showBoth)) {
      shops.push({
        name: outletFromRow(shopSelected),
        qty: shopQty,
        kind: "shop",
        warehouse: shopSelected.warehouse,
      });
    }
  }

  online.sort((a, b) => a.name.localeCompare(b.name));
  shops.sort((a, b) => a.name.localeCompare(b.name));
  return { online, shops };
}

function compareReportRows(a: CosmeticsStockReportDetail, b: CosmeticsStockReportDetail): number {
  if (a.critical !== b.critical) return a.critical ? -1 : 1;
  if (a["Stock Available Elsewhere"] !== b["Stock Available Elsewhere"]) {
    return a["Stock Available Elsewhere"] === "Yes" ? -1 : 1;
  }
  return a.SKU.localeCompare(b.SKU);
}

export function computeCriticalCutoff(soldUnits: number[]): number | null {
  const positive = soldUnits.filter((n) => Number.isFinite(n) && n >= 1).sort((a, b) => b - a);
  if (positive.length === 0) return null;
  const index = Math.ceil(positive.length * 0.2) - 1;
  return positive[Math.max(0, index)] ?? null;
}

export function markCriticalTopSellers(
  rows: CosmeticsStockReportDetail[],
  salesBySku: Map<string, number>,
  salesOk: boolean,
): { rows: CosmeticsStockReportDetail[]; cutoff: number | null } {
  if (!salesOk) {
    const cleared = rows
      .map((row) =>
        toDetail(
          { sku: row.SKU, productTitle: row["Product Title"], company: "", warehouse: "", qty: row["Main Warehouse Qty"], erpSource: "" },
          row.online,
          row.shops,
          0,
          false,
          row.cosmeticsMainQty ?? null,
        ),
      )
      .sort(compareReportRows);
    return { rows: cleared, cutoff: null };
  }

  const salesLookup = new Map<string, number>();
  for (const [sku, units] of salesBySku) {
    salesLookup.set(key(sku), units);
  }

  const cutoff = computeCriticalCutoff([...salesBySku.values()]);
  const marked = rows.map((row) => {
    const sales90d = salesLookup.get(key(row.SKU)) ?? 0;
    const critical = cutoff != null && sales90d >= 1 && sales90d >= cutoff;
    return toDetail(
      {
        sku: row.SKU,
        productTitle: row["Product Title"],
        company: "",
        warehouse: "",
        qty: row["Main Warehouse Qty"],
        erpSource: "",
      },
      row.online,
      row.shops,
      sales90d,
      critical,
      row.cosmeticsMainQty ?? null,
    );
  });

  return { rows: marked.sort(compareReportRows), cutoff };
}

export function buildCosmeticsStockReport(
  inputRows: StockBalanceRow[],
  threshold = 0,
): CosmeticsStockReportRow[] {
  return buildCosmeticsStockReportDetails(inputRows, threshold).map(
    (row): CosmeticsStockReportRow => ({
      SKU: row.SKU,
      "Product Title": row["Product Title"],
      "Main Warehouse Qty": row["Main Warehouse Qty"],
      "90-day Sales": row["90-day Sales"],
      Critical: row.Critical,
      "Online Warehouse(s)": row["Online Warehouse(s)"],
      "Online Qty": row["Online Qty"],
      "Shop Warehouse(s)": row["Shop Warehouse(s)"],
      "Shop Qty": row["Shop Qty"],
      "Stock Available Elsewhere": row["Stock Available Elsewhere"],
    }),
  );
}

export function buildCosmeticsStockReportDetails(
  inputRows: StockBalanceRow[],
  threshold = 0,
): CosmeticsStockReportDetail[] {
  const rows = parseRows(inputRows);

  const rowsBySku = new Map<string, ParsedStockRow[]>();
  for (const row of rows) {
    const skuKey = key(row.sku);
    rowsBySku.set(skuKey, [...(rowsBySku.get(skuKey) ?? []), row]);
  }

  const reportRows: CosmeticsStockReportDetail[] = [];
  for (const skuRows of rowsBySku.values()) {
    const mainRow = skuRows.find((row) => key(row.warehouse) === MAIN_COSMO_WAREHOUSE);
    if (!mainRow || mainRow.qty > threshold) continue;

    const { online, shops } = partitionLocations(skuRows, new Set([key(mainRow.warehouse)]));
    reportRows.push(toDetail(mainRow, online, shops, 0, false, mainRow.qty));
  }

  return reportRows.sort(compareReportRows);
}

/** Same availability table, with one chosen warehouse as the subject and every other location beside it. */
export function buildFocusedStockReport(
  inputRows: StockBalanceRow[],
  focusWarehouse: string,
  threshold = 0,
): CosmeticsStockReportDetail[] {
  const focusKey = key(focusWarehouse);
  const rows = parseRows(inputRows);
  const rowsBySku = new Map<string, ParsedStockRow[]>();
  for (const row of rows) {
    const skuKey = key(row.sku);
    rowsBySku.set(skuKey, [...(rowsBySku.get(skuKey) ?? []), row]);
  }

  const reportRows: CosmeticsStockReportDetail[] = [];
  for (const skuRows of rowsBySku.values()) {
    const focusRow = skuRows.find((row) => key(row.warehouse) === focusKey);
    if (!focusRow || focusRow.qty > threshold) continue;
    const cosmeticsMain = skuRows.find((row) => key(row.warehouse) === MAIN_COSMO_WAREHOUSE);
    const { online, shops } = partitionLocations(skuRows, new Set([focusKey, MAIN_COSMO_WAREHOUSE]));
    reportRows.push(toDetail(focusRow, online, shops, 0, false, cosmeticsMain?.qty ?? null));
  }
  return reportRows.sort(compareReportRows);
}

export function buildBrandWarehouseViolations(inputRows: StockBalanceRow[]): BrandWarehouseViolation[] {
  const violations: BrandWarehouseViolation[] = [];

  for (const row of parseRows(inputRows)) {
    if (row.qty <= 0) continue;
    if (!row.erpSource) continue;

    const cosmeticsOnlyBrand = findBrand(row.productTitle, COSMETICS_ONLY_BRANDS);
    const otherWarehouseOnlyBrand = findBrand(row.productTitle, OTHER_WAREHOUSE_ONLY_BRANDS);

    if (cosmeticsOnlyBrand && row.erpSource !== "ERP1") {
      violations.push({
        SKU: row.sku,
        "Product Title": row.productTitle,
        Brand: cosmeticsOnlyBrand,
        "ERP Source": row.erpSource,
        Warehouse: row.warehouse,
        "Balance Qty": row.qty,
        Rule: "Brand should only appear in ERP1",
      });
    }

    if (otherWarehouseOnlyBrand && row.erpSource !== "ERP2") {
      violations.push({
        SKU: row.sku,
        "Product Title": row.productTitle,
        Brand: otherWarehouseOnlyBrand,
        "ERP Source": row.erpSource,
        Warehouse: row.warehouse,
        "Balance Qty": row.qty,
        Rule: "Brand should only appear in ERP2",
      });
    }
  }

  return violations.sort((a, b) => {
    const brandSort = a.Brand.localeCompare(b.Brand);
    if (brandSort !== 0) return brandSort;
    const skuSort = a.SKU.localeCompare(b.SKU);
    if (skuSort !== 0) return skuSort;
    return a.Warehouse.localeCompare(b.Warehouse);
  });
}

export type WarehouseOption = {
  name: string;
  columnKey: string | null;
  label: string;
  kind: LocationKind;
  erpSource: "ERP1" | "ERP2" | "";
  watched: boolean;
};

export type RopWatchHit = {
  columnKey: string;
  label: string;
  warehouse: string;
  erpSource: "ERP1" | "ERP2";
  role: "cosmetics-main" | "erp2-company";
  qty: number;
  rop: number | null;
  percentOfRop: number | null;
  hit: boolean;
  ropMissing: boolean;
  websiteOutOfStock: boolean;
};

export type CatalogIdentityFields = {
  SKU: string;
  commonSku: string;
  "Product Title": string;
  erp1ProductPriority: string | null;
  erp2ProductPriority: string | null;
  vatStatus: string;
};

export type RopWatchRow = CatalogIdentityFields & {
  hits: RopWatchHit[];
  context: RopWatchHit[];
  elsewhere: LocationStock[];
};

export type ShopCompareRow = CatalogIdentityFields & {
  mainQty: number | null;
  websiteOutOfStock: boolean;
  shops: LocationStock[];
};

export type FocusCompareRow = CatalogIdentityFields & {
  focusWarehouse: string;
  qty: number;
  rop: number | null;
  percentOfRop: number | null;
  ropMissing: boolean;
  elsewhere: LocationStock[];
};

export type RopColumnRef = {
  key: string;
  label: string;
  warehouses: string[];
  erpSource: "ERP1" | "ERP2" | "";
  active: boolean;
  includeInRop: boolean;
  companyLocationName?: string | null;
};

export type SkuIdentity = {
  sku: string;
  productTitle: string;
  erp1ProductPriority: string | null;
  erp2ProductPriority: string | null;
  vatStatus: string;
};

export type IdentityFilter = {
  commonSku?: string;
  variantSku?: string;
  priority?: string;
  vatStatus?: string;
};

type WatchedTarget = {
  columnKey: string;
  label: string;
  warehouse: string;
  erpSource: "ERP1" | "ERP2";
  role: "cosmetics-main" | "erp2-company";
};

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function sameWarehouse(a: string, b: string): boolean {
  return key(a) === key(b);
}

/** Inclusive: stock 30, reorder point 100, percent 30 is a hit. Missing or zero reorder point is not. */
export function isAtOrBelowRopPercent(
  qty: number,
  rop: number | null | undefined,
  percent: number,
): boolean {
  if (rop == null || !Number.isFinite(rop) || rop <= 0) return false;
  if (!Number.isFinite(qty) || !Number.isFinite(percent)) return false;
  return qty * 100 <= rop * percent;
}

function isErp2CompanyColumn(col: RopColumnRef): boolean {
  if (!col.active || !col.includeInRop || col.erpSource !== "ERP2") return false;
  if (isShopOsfColumn({ key: col.key, label: col.label })) return false;
  const warehouses = col.warehouses.map((warehouse) => warehouse.trim()).filter(Boolean);
  if (warehouses.length === 0) return false;
  if (warehouses.some((warehouse) => isShopWarehouseName(warehouse) || isAllWarehouses(warehouse))) return false;
  return true;
}

export function selectWatchedTargets(columns: RopColumnRef[]): WatchedTarget[] {
  const active = columns.filter((col) => col.active && col.includeInRop);
  const targets: WatchedTarget[] = [];
  const mainOwner = active.find((col) =>
    col.warehouses.some((warehouse) => key(warehouse) === MAIN_COSMO_WAREHOUSE),
  );
  if (mainOwner) {
    const warehouse =
      mainOwner.warehouses.find((name) => key(name) === MAIN_COSMO_WAREHOUSE) ?? "Main Warehouse - Cosmo";
    targets.push({
      columnKey: mainOwner.key,
      label: mainOwner.label,
      warehouse,
      erpSource: mainOwner.erpSource === "ERP2" ? "ERP2" : "ERP1",
      role: "cosmetics-main",
    });
  }

  for (const col of active) {
    if (!isErp2CompanyColumn(col)) continue;
    for (const warehouse of col.warehouses) {
      if (targets.some((target) => sameWarehouse(target.warehouse, warehouse))) continue;
      targets.push({
        columnKey: col.key,
        label: col.label,
        warehouse,
        erpSource: "ERP2",
        role: "erp2-company",
      });
    }
  }
  return targets;
}

export function listWarehouseOptions(columns: RopColumnRef[], watched: WatchedTarget[]): WarehouseOption[] {
  const watchedNames = new Set(watched.map((target) => key(target.warehouse)));
  const options: WarehouseOption[] = [];
  const seen = new Set<string>();
  for (const col of columns) {
    if (!col.active) continue;
    for (const warehouse of col.warehouses) {
      const name = warehouse.trim();
      if (!name || isAllWarehouses(name)) continue;
      const id = key(name);
      if (seen.has(id)) continue;
      seen.add(id);
      options.push({
        name,
        columnKey: col.key,
        label: col.label,
        kind: classifyWarehouseKind(name),
        erpSource: col.erpSource,
        watched: watchedNames.has(id),
      });
    }
  }
  return options.sort((a, b) => a.name.localeCompare(b.name));
}

function ropLookupKey(sku: string, columnKey: string): string {
  return `${key(sku)}::${columnKey}`;
}

function readRop(ropBySkuColumn: Map<string, number>, sku: string, columnKey: string): number | null {
  const qty = ropBySkuColumn.get(ropLookupKey(sku, columnKey));
  if (qty == null || !Number.isFinite(qty) || qty <= 0) return null;
  return qty;
}

function binQty(lookup: Map<string, number>, sku: string, warehouse: string): number {
  return lookup.get(`${key(sku)}::${key(warehouse)}`) ?? 0;
}

function stockQtyLookup(rows: ParsedStockRow[]): Map<string, number> {
  const lookup = new Map<string, number>();
  for (const row of rows) lookup.set(`${key(row.sku)}::${key(row.warehouse)}`, row.qty);
  return lookup;
}

function toIdentity(sku: string, title: string, identities: SkuIdentity[]): CatalogIdentityFields {
  const found = identities.find((item) => key(item.sku) === key(sku));
  const resolvedSku = found?.sku ?? sku;
  return {
    SKU: resolvedSku,
    commonSku: baseSku(resolvedSku),
    "Product Title": found?.productTitle || title || resolvedSku,
    erp1ProductPriority: blankToNull(found?.erp1ProductPriority),
    erp2ProductPriority: blankToNull(found?.erp2ProductPriority),
    vatStatus: (found?.vatStatus ?? "").trim(),
  };
}

function locationsBeside(
  skuRows: ParsedStockRow[],
  excludeWarehouses: Set<string>,
  options?: { includeMain?: boolean },
): LocationStock[] {
  const shopGroups = new Map<string, ParsedStockRow[]>();
  const onlineGroups = new Map<string, ParsedStockRow[]>();
  for (const row of skuRows) {
    if (excludeWarehouses.has(key(row.warehouse))) continue;
    const kind = classifyWarehouseKind(row.warehouse);
    if (kind === "main") {
      if (!options?.includeMain || row.qty <= 0) continue;
      onlineGroups.set(key(row.warehouse), [...(onlineGroups.get(key(row.warehouse)) ?? []), row]);
      continue;
    }
    if (kind === "shop") {
      const outletKey = key(outletFromRow(row));
      if (!outletKey) continue;
      shopGroups.set(outletKey, [...(shopGroups.get(outletKey) ?? []), row]);
      continue;
    }
    const warehouseKey = key(row.warehouse);
    if (!warehouseKey) continue;
    onlineGroups.set(warehouseKey, [...(onlineGroups.get(warehouseKey) ?? []), row]);
  }

  const online: LocationStock[] = [];
  for (const groupRows of onlineGroups.values()) {
    const selected = groupRows.find((row) => row.qty > 0) ?? null;
    if (!selected) continue;
    online.push({
      name: outletFromRow(selected) || selected.warehouse,
      qty: selected.qty,
      kind: "online",
      warehouse: selected.warehouse,
    });
  }
  const shops: LocationStock[] = [];
  for (const groupRows of shopGroups.values()) {
    const selected = pickComparisonRow(groupRows);
    if (!selected || selected.qty <= 0) continue;
    shops.push({
      name: outletFromRow(selected),
      qty: selected.qty,
      kind: "shop",
      warehouse: selected.warehouse,
    });
  }
  online.sort((a, b) => a.name.localeCompare(b.name));
  shops.sort((a, b) => a.name.localeCompare(b.name));
  return [...online, ...shops];
}

function judgeTarget(
  target: WatchedTarget,
  sku: string,
  qtyLookup: Map<string, number>,
  ropBySkuColumn: Map<string, number>,
  percent: number,
): RopWatchHit {
  const qty = binQty(qtyLookup, sku, target.warehouse);
  const rop = readRop(ropBySkuColumn, sku, target.columnKey);
  const hit = isAtOrBelowRopPercent(qty, rop, percent);
  return {
    columnKey: target.columnKey,
    label: target.label,
    warehouse: target.warehouse,
    erpSource: target.erpSource,
    role: target.role,
    qty,
    rop,
    percentOfRop: percentOfRop(qty, rop),
    hit,
    ropMissing: rop == null,
    websiteOutOfStock: target.role === "cosmetics-main" && qty <= 0,
  };
}

export function buildRopWatch(input: {
  columns: RopColumnRef[];
  stockRows: StockBalanceRow[];
  ropBySkuColumn: Map<string, number>;
  identities: SkuIdentity[];
  percent: number;
}): { rows: RopWatchRow[]; watchedWarehouseCount: number; warehouses: WarehouseOption[] } {
  const targets = selectWatchedTargets(input.columns);
  const warehouses = listWarehouseOptions(input.columns, targets);
  const parsed = parseRows(input.stockRows);
  const qtyLookup = stockQtyLookup(parsed);
  const rowsBySku = new Map<string, ParsedStockRow[]>();
  for (const row of parsed) {
    const skuKey = key(row.sku);
    rowsBySku.set(skuKey, [...(rowsBySku.get(skuKey) ?? []), row]);
  }

  const skuKeys = new Set<string>([
    ...input.identities.map((item) => key(item.sku)),
    ...rowsBySku.keys(),
  ]);
  const rows: RopWatchRow[] = [];
  for (const sku of skuKeys) {
    const skuRows = rowsBySku.get(key(sku)) ?? [];
    const title = skuRows[0]?.productTitle ?? "";
    const judged = targets.map((target) => judgeTarget(target, sku, qtyLookup, input.ropBySkuColumn, input.percent));
    const hits = judged.filter((item) => item.hit);
    if (hits.length === 0) continue;
    const exclude = new Set(judged.map((item) => key(item.warehouse)));
    rows.push({
      ...toIdentity(sku, title, input.identities),
      hits,
      context: judged.filter((item) => !item.hit),
      elsewhere: locationsBeside(skuRows, exclude),
    });
  }
  rows.sort((a, b) => a.SKU.localeCompare(b.SKU));
  return { rows, watchedWarehouseCount: targets.length, warehouses };
}

export function buildShopCompare(input: {
  stockRows: StockBalanceRow[];
  threshold: number;
  ropWatch: RopWatchRow[];
  identities: SkuIdentity[];
}): ShopCompareRow[] {
  const parsed = parseRows(input.stockRows);
  const rowsBySku = new Map<string, ParsedStockRow[]>();
  for (const row of parsed) {
    const skuKey = key(row.sku);
    rowsBySku.set(skuKey, [...(rowsBySku.get(skuKey) ?? []), row]);
  }
  const included = new Set<string>();
  for (const row of buildCosmeticsStockReportDetails(input.stockRows, input.threshold)) {
    included.add(key(row.SKU));
  }
  for (const row of input.ropWatch) {
    if (row.hits.some((hit) => hit.role === "cosmetics-main")) included.add(key(row.SKU));
  }

  const shops: ShopCompareRow[] = [];
  for (const skuKey of included) {
    const skuRows = rowsBySku.get(skuKey) ?? [];
    const main = skuRows.find((row) => key(row.warehouse) === MAIN_COSMO_WAREHOUSE) ?? null;
    const shopLocations = locationsBeside(skuRows, new Set());
    shops.push({
      ...toIdentity(main?.sku ?? skuKey, main?.productTitle ?? skuRows[0]?.productTitle ?? "", input.identities),
      mainQty: main ? main.qty : null,
      websiteOutOfStock: main != null && main.qty <= 0,
      shops: shopLocations.filter((location) => location.kind === "shop"),
    });
  }
  return shops.sort((a, b) => a.SKU.localeCompare(b.SKU));
}

export function buildFocusCompare(input: {
  stockRows: StockBalanceRow[];
  columns: RopColumnRef[];
  focusWarehouse: string;
  ropBySkuColumn: Map<string, number>;
  identities: SkuIdentity[];
  percent: number;
}): FocusCompareRow[] {
  const focus = input.focusWarehouse.trim();
  const column =
    input.columns.find(
      (col) => col.active && col.includeInRop && col.warehouses.some((warehouse) => sameWarehouse(warehouse, focus)),
    ) ?? null;
  const parsed = parseRows(input.stockRows);
  const qtyLookup = stockQtyLookup(parsed);
  const rowsBySku = new Map<string, ParsedStockRow[]>();
  for (const row of parsed) {
    const skuKey = key(row.sku);
    rowsBySku.set(skuKey, [...(rowsBySku.get(skuKey) ?? []), row]);
  }
  const canonical =
    column?.warehouses.find((warehouse) => sameWarehouse(warehouse, focus)) ?? focus;
  const skuKeys = new Set<string>([
    ...input.identities.map((item) => key(item.sku)),
    ...rowsBySku.keys(),
  ]);
  const rows: FocusCompareRow[] = [];
  for (const sku of skuKeys) {
    const qty = binQty(qtyLookup, sku, canonical);
    const rop = column ? readRop(input.ropBySkuColumn, sku, column.key) : null;
    if (!isAtOrBelowRopPercent(qty, rop, input.percent)) continue;
    const skuRows = rowsBySku.get(key(sku)) ?? [];
    rows.push({
      ...toIdentity(sku, skuRows[0]?.productTitle ?? "", input.identities),
      focusWarehouse: canonical,
      qty,
      rop,
      percentOfRop: percentOfRop(qty, rop),
      ropMissing: rop == null,
      elsewhere: locationsBeside(skuRows, new Set([key(canonical)])),
    });
  }
  return rows.sort((a, b) => a.SKU.localeCompare(b.SKU));
}

function filterText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Subject warehouse stock as a percent of its ROP. Missing or zero ROP stays blank. */
export function attachSubjectRopPercent(
  rows: CosmeticsStockReportDetail[],
  ropBySkuColumn: Map<string, number>,
  columnKey: string | null,
): CosmeticsStockReportDetail[] {
  return rows.map((row) => {
    const stored = columnKey ? ropBySkuColumn.get(`${key(row.SKU)}::${columnKey}`) : undefined;
    const rop = stored != null && Number.isFinite(stored) && stored > 0 ? stored : null;
    const ratio = percentOfRop(row["Main Warehouse Qty"], rop);
    return {
      ...row,
      rop,
      stockPctOfRop: ratio == null ? null : Math.round(ratio * 10000) / 100,
    };
  });
}

export function filterReportByMainRopPercent(
  rows: CosmeticsStockReportDetail[],
  ropBySkuColumn: Map<string, number>,
  mainColumnKey: string | null,
  percent: number,
): CosmeticsStockReportDetail[] {
  if (!mainColumnKey) return [];
  return rows.filter((row) => {
    const rop = ropBySkuColumn.get(`${key(row.SKU)}::${mainColumnKey}`);
    return isAtOrBelowRopPercent(row["Main Warehouse Qty"], rop, percent);
  });
}

export function decorateReportRows(
  rows: CosmeticsStockReportDetail[],
  identities: SkuIdentity[],
): CosmeticsStockReportDetail[] {
  return rows.map((row) => ({
    ...row,
    ...toIdentity(row.SKU, row["Product Title"], identities),
  }));
}

export function matchesIdentityFilters(row: CatalogIdentityFields, filter: IdentityFilter): boolean {
  const commonSku = filterText(filter.commonSku);
  if (commonSku && !filterText(row.commonSku).includes(commonSku)) return false;
  const variantSku = filterText(filter.variantSku);
  if (variantSku && !filterText(row.SKU).includes(variantSku)) return false;
  const priority = filterText(filter.priority);
  if (priority) {
    const left = filterText(row.erp1ProductPriority);
    const right = filterText(row.erp2ProductPriority);
    if (left !== priority && right !== priority) return false;
  }
  const vatStatus = filterText(filter.vatStatus);
  if (vatStatus && filterText(row.vatStatus) !== vatStatus) return false;
  return true;
}
