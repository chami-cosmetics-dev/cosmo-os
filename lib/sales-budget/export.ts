import "server-only";

import {
  SALES_BUDGET_SHOPS,
  SALES_BUDGET_VAT_FILTERS,
  SALES_BUDGET_VAT_LABELS,
  type SalesBudgetRow,
  type SalesBudgetShopChannel,
  type SalesBudgetVatFilter,
} from "@/lib/sales-budget/config";
import {
  applyCalculations,
  groupByCommonSku,
  loadSalesBudgetBase,
  matchesVat,
  resolveSalesBudgetScope,
  sumRevenue,
  type SalesBudgetBase,
} from "@/lib/sales-budget/page-data";

export type Cell = string | number;

/**
 * One sheet in the wide layout: item columns on the left (`fixedHeaders`), then a block of
 * `metricHeaders` per entity (merchant / shop) under that entity's name.
 */
export type SalesBudgetExportSection = {
  sheetName: string;
  fixedHeaders: string[];
  metricHeaders: string[];
  entities: string[];
  /** `metrics[i]` = entity i's block; null when that entity doesn't carry the item. */
  rows: Array<{ fixed: Cell[]; metrics: Array<Cell[] | null> }>;
  /** Per entity (same order): month target, Target %, summed Budgeted Qty and Revenue. */
  entityTotals: Array<{
    target: number | null;
    percent: number | null;
    qty: number | null;
    revenue: number | null;
  }>;
  /** All-entities month target ("Online total" / "All Shops total"). */
  totalTarget: number | null;
};

/** Specific values only: "All" would double up the per-merchant / per-shop blocks. */
const VAT_CLASSES = SALES_BUDGET_VAT_FILTERS.filter(
  (v): v is Exclude<SalesBudgetVatFilter, "all"> => v !== "all",
);

const ITEM_HEADERS = [
  "Common SKU",
  "Brand",
  "Product Title",
  "VAT",
  "Priority",
  "Selling Price",
  "Compare at Price",
];
/** Online sheets: identical for every merchant / shop, so shown once per item. */
const COMMON_ONLINE_HEADERS = ["Current Stock", "Current ROP", "Highest Sale Qty"];

/** Full per-entity block (SHOP-SHOP: stock / ROP differ by shop). */
const FULL_METRICS = [
  "Highest Sale Qty",
  "Target %",
  "Budgeted Qty",
  "Current Stock",
  "Current ROP",
  "Budgeted Revenue",
];
/**
 * Online sheets: Current Stock / ROP (same online warehouses / OSF columns) and Highest Sale
 * Qty (online sales don't change by merchant / shop) sit once in the item columns.
 */
const ONLINE_METRICS = ["Target %", "Budgeted Qty", "Budgeted Revenue"];

function priceCell(min: number | null, max: number | null): Cell {
  if (min == null || max == null) return "";
  // A single price stays a number (Excel formats it 1,000); a range is text with commas.
  const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return min === max ? min : `${fmt(min)} – ${fmt(max)}`;
}

function valueCell(value: number | null): Cell {
  return value == null ? "" : value;
}

function itemColumns(row: SalesBudgetRow, vat: Exclude<SalesBudgetVatFilter, "all">): Cell[] {
  return [
    row.commonSku,
    row.brand ?? "",
    row.productTitle ?? "",
    SALES_BUDGET_VAT_LABELS[vat],
    row.priority ?? "",
    priceCell(row.sellingPriceMin, row.sellingPriceMax),
    priceCell(row.compareAtPriceMin, row.compareAtPriceMax),
  ];
}

/** Cells for `headers` from a calculated row. */
function metricColumns(row: SalesBudgetRow, headers: string[]): Cell[] {
  const byHeader: Record<string, Cell> = {
    "Highest Sale Qty": valueCell(row.highestSaleQty),
    // Percent number (e.g. 12.5), one decimal at most, matching the screen.
    "Target %": valueCell(row.targetPercent == null ? null : Math.round(row.targetPercent * 10) / 10),
    "Budgeted Qty": valueCell(row.budgetedQty),
    "Current Stock": valueCell(row.currentStock),
    "Current ROP": valueCell(row.currentRop),
    "Budgeted Revenue": valueCell(row.budgetedRevenue),
  };
  return headers.map((h) => byHeader[h] ?? "");
}

/**
 * Builds one sheet: every entity's numbers for the same item (VAT class + Common SKU) on one
 * line. Grouping matches the screen with that VAT filter. `commonStock` moves Current Stock /
 * Current ROP / Highest Sale Qty into the item columns (identical across entities there).
 */
async function buildSection(
  base: SalesBudgetBase,
  input: {
    sheetName: string;
    entities: string[];
    scopeFor: (entity: string) => Parameters<typeof resolveSalesBudgetScope>[1];
    commonStock: boolean;
    /** Called after each entity's block is calculated. */
    onEntity?: () => void;
  },
): Promise<SalesBudgetExportSection> {
  const metricHeaders = input.commonStock ? ONLINE_METRICS : FULL_METRICS;
  const byKey = new Map<string, { sort: string; fixed: Cell[]; metrics: Array<Cell[] | null> }>();
  const entityTotals: SalesBudgetExportSection["entityTotals"] = [];
  let totalTarget: number | null = null;

  for (const [index, entity] of input.entities.entries()) {
    const scope = await resolveSalesBudgetScope(base, input.scopeFor(entity));
    const { target } = scope.context;
    totalTarget = target.total;
    const entityRows: SalesBudgetRow[] = [];
    for (const [vatIndex, vat] of VAT_CLASSES.entries()) {
      const grouped = groupByCommonSku(scope.variants.filter((v) => matchesVat(v, vat)));
      if (grouped.length === 0) continue;
      const rows = await applyCalculations({ ...scope.context, vat }, grouped);
      entityRows.push(...rows);
      for (const row of rows) {
        const key = `${vat}|${row.commonSku}`;
        let line = byKey.get(key);
        if (!line) {
          line = {
            sort: `${row.commonSku}|${vatIndex}`,
            fixed: [
              ...itemColumns(row, vat),
              ...(input.commonStock ? metricColumns(row, COMMON_ONLINE_HEADERS) : []),
            ],
            metrics: input.entities.map(() => null),
          };
          byKey.set(key, line);
        }
        line.metrics[index] = metricColumns(row, metricHeaders);
      }
    }
    entityTotals.push({
      target: target.selected,
      percent: target.percent,
      qty: entityRows.some((r) => r.budgetedQty != null)
        ? entityRows.reduce((sum, r) => sum + (r.budgetedQty ?? 0), 0)
        : null,
      revenue: sumRevenue(entityRows),
    });
    input.onEntity?.();
  }

  return {
    sheetName: input.sheetName,
    fixedHeaders: input.commonStock ? [...ITEM_HEADERS, ...COMMON_ONLINE_HEADERS] : ITEM_HEADERS,
    metricHeaders,
    entities: input.entities,
    rows: [...byKey.values()]
      .sort((a, b) => a.sort.localeCompare(b.sort))
      .map(({ fixed, metrics }) => ({ fixed, metrics })),
    entityTotals,
    totalTarget,
  };
}

/** Item line key in the wide sheets: VAT column label + Common SKU. */
export const itemLineKey = (vatLabel: Cell, commonSku: Cell) => `${vatLabel}|${commonSku}`;

/**
 * Current Selling / Compare at Price cells of every item line (same on every sheet), without
 * the per-merchant calculations. Key: itemLineKey.
 */
export function currentItemPrices(
  base: SalesBudgetBase,
): Map<string, { commonSku: string; selling: Cell; compareAt: Cell }> {
  const out = new Map<string, { commonSku: string; selling: Cell; compareAt: Cell }>();
  for (const vat of VAT_CLASSES) {
    for (const row of groupByCommonSku(base.catalog.filter((v) => matchesVat(v, vat)))) {
      out.set(itemLineKey(SALES_BUDGET_VAT_LABELS[vat], row.commonSku), {
        commonSku: row.commonSku,
        selling: priceCell(row.sellingPriceMin, row.sellingPriceMax),
        compareAt: priceCell(row.compareAtPriceMin, row.compareAtPriceMax),
      });
    }
  }
  return out;
}

/**
 * All data in the wide layout, ignoring the screen filters. Three sheets:
 * ONLINE (per merchant), SHOP-SHOP and SHOP-ONLINE (per shop, one sheet per channel).
 * `onProgress` reports calculated merchant / shop blocks (for the Export progress bar).
 */
export async function buildSalesBudgetExport(
  companyId: string,
  loadedBase?: SalesBudgetBase,
  onProgress?: (done: number, total: number) => void,
): Promise<SalesBudgetExportSection[]> {
  // Uses the cached ERP stock/tax + sales (the screen's last Refresh); builds them if missing.
  const base = loadedBase ?? (await loadSalesBudgetBase(companyId));
  const merchants = [...base.sales.onlineMerchantIds.keys()];
  const shops = SALES_BUDGET_SHOPS.map((s) => s.name);
  const totalEntities = merchants.length + shops.length * 2;
  let doneEntities = 0;
  const onEntity = () => onProgress?.(++doneEntities, totalEntities);
  const shopScope = (channel: SalesBudgetShopChannel) => (name: string) => ({
    tab: "shop" as const,
    entity: name,
    vat: "all" as const,
    shopChannel: channel,
  });

  return [
    await buildSection(base, {
      sheetName: "ONLINE",
      entities: merchants,
      scopeFor: (merchant) => ({ tab: "online", entity: merchant, vat: "all", shopChannel: null }),
      commonStock: true,
      onEntity,
    }),
    await buildSection(base, {
      sheetName: "SHOP-SHOP",
      entities: shops,
      scopeFor: shopScope("shop"),
      commonStock: false,
      onEntity,
    }),
    await buildSection(base, {
      sheetName: "SHOP-ONLINE",
      entities: shops,
      scopeFor: shopScope("online"),
      commonStock: true,
      onEntity,
    }),
  ];
}
