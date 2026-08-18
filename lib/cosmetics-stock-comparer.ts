export type StockBalanceRow = {
  Item: unknown;
  "Item Name": unknown;
  Company: unknown;
  Warehouse: unknown;
  "Balance Qty": unknown;
};

export type CosmeticsStockReportRow = {
  SKU: string;
  "Product Title": string;
  "Main Warehouse Qty": number;
  "Priority 1 Warehouse(s)": string;
  "Priority 1 Qty": number | "";
  "Priority 2 Warehouse(s)": string;
  "Priority 2 Qty": number | "";
  "Priority 3 Warehouse(s)": string;
  "Priority 3 Qty": number | "";
  "Stock Available Elsewhere": "Yes" | "No";
};

export type OutletStock = {
  outlet: string;
  qty: number;
  priority: 1 | 2 | 3;
};

export type CosmeticsStockReportDetail = CosmeticsStockReportRow & {
  priority1: OutletStock[];
  priority2: OutletStock[];
  priority3: OutletStock[];
};

export const COSMETICS_STOCK_REPORT_HEADERS = [
  "SKU",
  "Product Title",
  "Main Warehouse Qty",
  "Priority 1 Warehouse(s)",
  "Priority 1 Qty",
  "Priority 2 Warehouse(s)",
  "Priority 2 Qty",
  "Priority 3 Warehouse(s)",
  "Priority 3 Qty",
  "Stock Available Elsewhere",
] as const;

const MAIN_COSMO_WAREHOUSE = "main warehouse - cosmo";

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

const PRIORITY_1 = new Set(["pevi", "spk", "dtd"]);
const PRIORITY_2 = new Set(["pepiliyana", "ajs", "kiribathgoda"]);

type ParsedStockRow = {
  sku: string;
  productTitle: string;
  company: string;
  warehouse: string;
  qty: number;
};

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

function priorityForRow(row: ParsedStockRow, outlet: string): 1 | 2 | 3 {
  const candidates = [
    key(outlet),
    key(normalizeOutletName(row.company)),
    key(normalizeOutletName(row.warehouse)),
    key(row.company),
    key(row.warehouse),
  ];
  const hasPriorityToken = (tokens: Set<string>) =>
    candidates.some((candidate) =>
      [...tokens].some((token) => candidate === token || candidate.includes(token)),
    );

  if (hasPriorityToken(PRIORITY_1)) return 1;
  if (hasPriorityToken(PRIORITY_2)) return 2;
  return 3;
}

function pickComparisonRow(rows: ParsedStockRow[]): ParsedStockRow | null {
  const shop = rows.find((row) => key(row.warehouse).includes("shop warehouse"));
  if (shop) return shop;
  return rows.find((row) => key(row.warehouse).includes("main warehouse")) ?? null;
}

function summarizePriority(rows: OutletStock[]): { warehouses: string; qty: number | "" } {
  if (rows.length === 0) return { warehouses: "", qty: "" };
  const sorted = [...rows].sort((a, b) => a.outlet.localeCompare(b.outlet));
  return {
    warehouses: sorted.map((row) => row.outlet).join(", "),
    qty: sorted.reduce((sum, row) => sum + row.qty, 0),
  };
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
      "Priority 1 Warehouse(s)": row["Priority 1 Warehouse(s)"],
      "Priority 1 Qty": row["Priority 1 Qty"],
      "Priority 2 Warehouse(s)": row["Priority 2 Warehouse(s)"],
      "Priority 2 Qty": row["Priority 2 Qty"],
      "Priority 3 Warehouse(s)": row["Priority 3 Warehouse(s)"],
      "Priority 3 Qty": row["Priority 3 Qty"],
      "Stock Available Elsewhere": row["Stock Available Elsewhere"],
    }),
  );
}

export function buildCosmeticsStockReportDetails(
  inputRows: StockBalanceRow[],
  threshold = 0,
): CosmeticsStockReportDetail[] {
  const rows = inputRows
    .map((row): ParsedStockRow => ({
      sku: clean(row.Item),
      productTitle: clean(row["Item Name"]),
      company: clean(row.Company),
      warehouse: clean(row.Warehouse),
      qty: parseQty(row["Balance Qty"]),
    }))
    .filter((row) => row.sku && row.warehouse && !isAllWarehouses(row.warehouse));

  const rowsBySku = new Map<string, ParsedStockRow[]>();
  for (const row of rows) {
    const skuKey = key(row.sku);
    rowsBySku.set(skuKey, [...(rowsBySku.get(skuKey) ?? []), row]);
  }

  const reportRows: CosmeticsStockReportDetail[] = [];
  for (const skuRows of rowsBySku.values()) {
    const mainRow = skuRows.find((row) => key(row.warehouse) === MAIN_COSMO_WAREHOUSE);
    if (!mainRow || mainRow.qty > threshold) continue;

    const comparisonGroups = new Map<string, ParsedStockRow[]>();
    for (const row of skuRows) {
      if (row === mainRow) continue;
      if (key(row.warehouse) === MAIN_COSMO_WAREHOUSE) continue;
      const outletKey = key(outletFromRow(row));
      if (!outletKey) continue;
      comparisonGroups.set(outletKey, [...(comparisonGroups.get(outletKey) ?? []), row]);
    }

    const available: OutletStock[] = [];
    for (const groupRows of comparisonGroups.values()) {
      const selected = pickComparisonRow(groupRows);
      if (!selected || selected.qty <= 0) continue;
      const outlet = outletFromRow(selected);
      available.push({ outlet, qty: selected.qty, priority: priorityForRow(selected, outlet) });
    }

    const priority1Rows = available.filter((row) => row.priority === 1);
    const priority2Rows = available.filter((row) => row.priority === 2);
    const priority3Rows = available.filter((row) => row.priority === 3);
    const priority1 = summarizePriority(priority1Rows);
    const priority2 = summarizePriority(priority2Rows);
    const priority3 = summarizePriority(priority3Rows);

    reportRows.push({
      SKU: mainRow.sku,
      "Product Title": mainRow.productTitle,
      "Main Warehouse Qty": mainRow.qty,
      "Priority 1 Warehouse(s)": priority1.warehouses,
      "Priority 1 Qty": priority1.qty,
      "Priority 2 Warehouse(s)": priority2.warehouses,
      "Priority 2 Qty": priority2.qty,
      "Priority 3 Warehouse(s)": priority3.warehouses,
      "Priority 3 Qty": priority3.qty,
      "Stock Available Elsewhere": available.length > 0 ? "Yes" : "No",
      priority1: priority1Rows,
      priority2: priority2Rows,
      priority3: priority3Rows,
    });
  }

  return reportRows.sort((a, b) => {
    if (a["Stock Available Elsewhere"] !== b["Stock Available Elsewhere"]) {
      return a["Stock Available Elsewhere"] === "Yes" ? -1 : 1;
    }
    return a.SKU.localeCompare(b.SKU);
  });
}
