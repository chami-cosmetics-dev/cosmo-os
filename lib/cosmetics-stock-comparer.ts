import { isShopWarehouseName } from "@/lib/item-trends/shop-warehouse-name";

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
  };
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
      .map((row) => toDetail({ sku: row.SKU, productTitle: row["Product Title"], company: "", warehouse: "", qty: row["Main Warehouse Qty"], erpSource: "" }, row.online, row.shops, 0, false))
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

    const shopGroups = new Map<string, ParsedStockRow[]>();
    const onlineGroups = new Map<string, ParsedStockRow[]>();

    for (const row of skuRows) {
      if (row === mainRow) continue;
      const kind = classifyWarehouseKind(row.warehouse);
      if (kind === "main") continue;
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
      const outletName = outletFromRow(selected);
      online.push({
        name: outletName || selected.warehouse,
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

    reportRows.push(toDetail(mainRow, online, shops));
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
