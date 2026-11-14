import {
  STOCK_HEALTH_ROP_PASS_PERCENT,
  STOCK_HEALTH_ROP_ROW_ORDER,
  STOCK_HEALTH_STATUSES,
  STOCK_HEALTH_UNGROUPED_BRANDS,
  type StockHealthOutOfStockRow,
  type StockHealthRopCounts,
  type StockHealthStatus,
  type StockHealthStatusTotals,
} from "@/lib/stock-health/config";

/** One ERP Item (variant SKU). */
export type StockHealthItem = {
  sku: string;
  brand: string | null;
  /** ERP Product Priority as written in the ERP. */
  priority: string | null;
  /** Website (Shopify) product status — `active`, `draft`, … — or null when not on the site. */
  siteStatus: string | null;
  /** ERP Item Name. */
  itemName: string | null;
};

const UNGROUPED_BRANDS = new Set(
  STOCK_HEALTH_UNGROUPED_BRANDS.map((b) => b.trim().toLowerCase()),
);

export function skuKey(sku: string): string {
  return sku.trim().toUpperCase();
}

/**
 * Excluded Common SKUs, edited on the Stock Health screen: exact keys (`skuKey`) plus
 * prefix rules — an entry ending in `*` (e.g. `BU0*`, bundles) excludes every Common SKU
 * starting with the text before it, including ones added to the ERP later. `countAnyway`
 * are exceptions: a rule matches them but they are still counted.
 */
export type ExcludedSkus = {
  exact: ReadonlySet<string>;
  prefixes: readonly string[];
  countAnyway: ReadonlySet<string>;
};

export const EXCLUDED_SKU_WILDCARD = "*";

/** `BU0*` → `BU0`; null for a plain SKU. */
export function excludedSkuPrefixOf(entry: string): string | null {
  const key = skuKey(entry);
  return key.endsWith(EXCLUDED_SKU_WILDCARD) ? key.slice(0, -EXCLUDED_SKU_WILDCARD.length) : null;
}

/** Excluded-SKU list entries → exact keys + prefix rules (+ exceptions to the rules). */
export function parseExcludedSkus(
  entries: Iterable<string>,
  countAnyway: Iterable<string> = [],
): ExcludedSkus {
  const exact = new Set<string>();
  const prefixes: string[] = [];
  for (const entry of entries) {
    const prefix = excludedSkuPrefixOf(entry);
    if (prefix === null) exact.add(skuKey(entry));
    else if (prefix) prefixes.push(prefix);
  }
  return { exact, prefixes, countAnyway: new Set([...countAnyway].map(skuKey)) };
}

/** The prefix rule (`BU0*`) that excludes this Common SKU, if any. */
export function excludingRuleOf(commonSku: string, excluded: ExcludedSkus): string | null {
  const prefix = excluded.prefixes.find((p) => commonSku.startsWith(p));
  return prefix === undefined ? null : `${prefix}${EXCLUDED_SKU_WILDCARD}`;
}

export function isExcludedSku(commonSku: string, excluded: ExcludedSkus): boolean {
  if (excluded.exact.has(commonSku)) return true;
  if (excluded.countAnyway.has(commonSku)) return false;
  return excludingRuleOf(commonSku, excluded) !== null;
}

/**
 * ERP Product Priority → Weekly Summary status. Matched loosely, since ERP spellings vary
 * ("Discontinued", "New"); anything else (or blank) is "Blank".
 */
export function stockHealthStatusOf(priority: string | null): StockHealthStatus {
  const key = (priority ?? "").trim().toLowerCase();
  if (key === "top") return "Top";
  if (key === "low") return "Low";
  if (key.startsWith("new")) return "Newly Added";
  if (key.startsWith("discontinu")) return "Discontinue";
  return "Blank";
}

/**
 * Text before the last `_` (ABC_1 → ABC, FL_01_2 → FL_01, Test_1-1 → TEST), except brands
 * kept as-is (Golden Rose). Blank for e.g. `_ABC` — such items have no Common SKU.
 */
export function commonSkuOf(item: StockHealthItem): string {
  if (item.brand && UNGROUPED_BRANDS.has(item.brand.trim().toLowerCase())) {
    return skuKey(item.sku);
  }
  const cut = item.sku.lastIndexOf("_");
  return skuKey(cut === -1 ? item.sku : item.sku.slice(0, cut));
}

/**
 * Why an item is left out of Stock Health; null when it counts. `stock` is the item's own
 * total stock (all warehouses). A website draft is left out unless it has stock (e.g. Golden
 * Rose drafts still in the shops); items not on the website count (some sell only in shops).
 */
export function stockHealthSkipReason(
  item: StockHealthItem,
  excluded: ExcludedSkus,
  stock: number,
): string | null {
  const key = commonSkuOf(item);
  if (!key) return "No Common SKU";
  if (isExcludedSku(key, excluded)) return "Excluded SKU";
  if (item.siteStatus?.trim().toLowerCase() === "draft" && stock <= 0) {
    return "Draft on website (no stock)";
  }
  return null;
}

export type StockHealthCommonSkuRow = {
  commonSku: string;
  /** Highest status among the variants. */
  status: StockHealthStatus;
  variants: StockHealthItem[];
  /** Stock of ALL variants (also those with a lower or no status). */
  stock: number;
};

/** One row per Common SKU (skipped items left out). `stockBySku` is keyed by `skuKey`. */
export function buildCommonSkuRows(
  items: StockHealthItem[],
  stockBySku: Map<string, number>,
  excluded: ExcludedSkus,
): StockHealthCommonSkuRow[] {
  const groups = new Map<string, StockHealthItem[]>();
  for (const item of items) {
    if (stockHealthSkipReason(item, excluded, stockBySku.get(skuKey(item.sku)) ?? 0)) continue;
    const key = commonSkuOf(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return [...groups].map(([commonSku, variants]) => ({
    commonSku,
    status: STOCK_HEALTH_STATUSES[
      Math.min(...variants.map((v) => STOCK_HEALTH_STATUSES.indexOf(stockHealthStatusOf(v.priority))))
    ],
    variants,
    stock: variants.reduce((total, v) => total + (stockBySku.get(skuKey(v.sku)) ?? 0), 0),
  }));
}

/** Count + stock per status: each Common SKU counts once, under its highest status. */
export function summarizeByStatus(
  items: StockHealthItem[],
  stockBySku: Map<string, number>,
  excluded: ExcludedSkus,
): StockHealthStatusTotals[] {
  const totals = new Map<StockHealthStatus, StockHealthStatusTotals>(
    STOCK_HEALTH_STATUSES.map((status) => [status, { status, count: 0, stock: 0 }]),
  );
  for (const row of buildCommonSkuRows(items, stockBySku, excluded)) {
    const total = totals.get(row.status)!;
    total.count += 1;
    total.stock += row.stock;
  }
  return [...totals.values()];
}

/**
 * A Common SKU counted as 0' Stock (the ERP can show negative balances). The ROP Status
 * count and the Out of Stock list both use this, so they cannot differ.
 */
export function isZeroStock(stock: number): boolean {
  return stock <= 0;
}

export type StockHealthRopGroup = "fail" | "noRopNoStock" | "noRopWithStock" | "pass";

/**
 * ROP group of one Common SKU (total stock / total ROP over all its variants).
 * Stock ≤ 0 counts as no stock (the ERP can show negative balances).
 */
export function ropGroupOf(stock: number, rop: number): StockHealthRopGroup {
  if (rop > 0) return (stock / rop) * 100 > STOCK_HEALTH_ROP_PASS_PERCENT ? "pass" : "fail";
  return stock > 0 ? "noRopWithStock" : "noRopNoStock";
}

function emptyRopCounts(): StockHealthRopCounts {
  return { fail: 0, noRopNoStock: 0, noRopWithStock: 0, pass: 0, total: 0, zeroStock: 0 };
}

export type StockHealthRopRow = StockHealthCommonSkuRow & {
  /** Total ROP over all variants (+ any ROP on the Common SKU itself). */
  rop: number;
  group: StockHealthRopGroup;
};

/**
 * A Common SKU's total ROP = ROP of all its variants added together, plus any ROP stored
 * on the Common SKU itself. `ropBySku` is keyed by `skuKey`.
 */
export function buildRopRows(
  commonRows: StockHealthCommonSkuRow[],
  ropBySku: Map<string, number>,
): StockHealthRopRow[] {
  return commonRows.map((row) => {
    const variantKeys = new Set(row.variants.map((v) => skuKey(v.sku)));
    let rop = 0;
    for (const key of variantKeys) rop += ropBySku.get(key) ?? 0;
    if (!variantKeys.has(row.commonSku)) rop += ropBySku.get(row.commonSku) ?? 0;
    return { ...row, rop, group: ropGroupOf(row.stock, rop) };
  });
}

/** ROP Status counts per status + Grand Total. */
export function summarizeRopStatus(
  ropRows: StockHealthRopRow[],
): { rows: Array<{ status: StockHealthStatus } & StockHealthRopCounts>; grandTotal: StockHealthRopCounts } {
  const byStatus = new Map(STOCK_HEALTH_ROP_ROW_ORDER.map((status) => [status, emptyRopCounts()]));
  const grandTotal = emptyRopCounts();

  for (const row of ropRows) {
    for (const counts of [byStatus.get(row.status)!, grandTotal]) {
      counts[row.group] += 1;
      counts.total += 1;
      if (isZeroStock(row.stock)) counts.zeroStock += 1;
    }
  }

  return {
    rows: STOCK_HEALTH_ROP_ROW_ORDER.filter(
      (status) => status !== "Blank" || byStatus.get(status)!.total > 0,
    ).map((status) => ({ status, ...byStatus.get(status)! })),
    grandTotal,
  };
}

/**
 * The Common SKUs behind the 0' Stock numbers, highest priority first, then by Common SKU.
 * The name is the first variant's (by SKU) that has one, since variants can differ.
 */
export function buildOutOfStockRows(rows: StockHealthCommonSkuRow[]): StockHealthOutOfStockRow[] {
  return rows
    .filter((row) => isZeroStock(row.stock))
    .sort(
      (a, b) =>
        STOCK_HEALTH_STATUSES.indexOf(a.status) - STOCK_HEALTH_STATUSES.indexOf(b.status) ||
        a.commonSku.localeCompare(b.commonSku),
    )
    .map((row) => {
      const variants = [...row.variants].sort((a, b) => a.sku.localeCompare(b.sku));
      return {
        status: row.status,
        commonSku: row.commonSku,
        itemName: variants.find((v) => v.itemName)?.itemName ?? null,
        variantSkus: variants.map((v) => v.sku),
      };
    });
}
