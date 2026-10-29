import "server-only";

import { parentSkuStem } from "@/lib/item-trends/sku-group";
import { resolveProductPriority } from "@/lib/osf/assist-window";
import { prisma } from "@/lib/prisma";
import { normalizeSkuKey } from "@/lib/product-items/erp-priority-sync";
import {
  getBudgetedQty,
  getBudgetedRevenue,
  getCurrentRop,
  getCurrentStock,
  getHighestSaleQty,
  type SalesBudgetContext,
} from "@/lib/sales-budget/calculations";
import {
  BUDGET_REVENUE_PRICE,
  budgetSheetFor,
  SALES_BUDGET_NO_PRIORITY,
  SALES_BUDGET_ONLINE,
  SALES_BUDGET_PRIORITY_ORDER,
  SALES_BUDGET_SHOPS,
  SALES_BUDGET_UNGROUPED_BRANDS,
  type SalesBudgetStockScope,
  type SalesBudgetPageData,
  type SalesBudgetRow,
  type SalesBudgetShopChannel,
  type SalesBudgetTab,
  type SalesBudgetTarget,
  type SalesBudgetVatFilter,
} from "@/lib/sales-budget/config";
import {
  getSalesBudgetErpData,
  type SalesBudgetErpData,
} from "@/lib/sales-budget/erp-data";
import {
  getSalesBudgetSalesData,
  type SalesBudgetSalesData,
} from "@/lib/sales-budget/sales-data";

export type SalesBudgetPageOptions = {
  q?: string;
  /** Exact brand, or null = all. */
  brand?: string | null;
  /** Exact priority, SALES_BUDGET_NO_PRIORITY, or null = all. */
  priority?: string | null;
  page: number;
  limit: number;
  /**
   * Budgeted Qty edits saved in next month's budget (every merchant / shop); each replaces the
   * calculated value of its merchant / shop view, also inside the "All" sums.
   */
  savedEdits?: SavedQtyEdit[];
};

export type VariantRow = {
  sku: string;
  brand: string | null;
  productTitle: string;
  priority: string | null;
  price: number | null;
  compareAtPrice: number | null;
  erp1TaxStatus: string | null;
  erp2TaxStatus: string | null;
};

function toPrice(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function minMax(values: Array<number | null>): [number | null, number | null] {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return [null, null];
  return [Math.min(...nums), Math.max(...nums)];
}

export type VatClass = Exclude<SalesBudgetVatFilter, "all">;

/** One ERP Tax Status value → class. `Vat / Non Vat` → vat_non_vat. Unknown/blank → null. */
function classifyTaxStatus(value: string | null): VatClass | null {
  const parts = (value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .split("/")
    .map((part) =>
      part
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^nonvat$/, "non vat"),
    )
    .filter(Boolean);
  const hasVat = parts.includes("vat");
  const hasNonVat = parts.includes("non vat");
  if (hasVat && hasNonVat) return "vat_non_vat";
  if (hasVat) return "vat";
  if (hasNonVat) return "non_vat";
  return null;
}

/** ERP1 + ERP2 combined. Disagreeing statuses → vat_non_vat; none → non_vat. */
export function vatClassOf(row: VariantRow): VatClass {
  const classes = new Set(
    [
      classifyTaxStatus(row.erp1TaxStatus),
      classifyTaxStatus(row.erp2TaxStatus),
    ].filter((c): c is VatClass => c != null),
  );
  if (classes.size === 0) return "non_vat";
  if (classes.size > 1 || classes.has("vat_non_vat")) return "vat_non_vat";
  return [...classes][0];
}

export function matchesVat(
  row: VariantRow,
  vat: SalesBudgetVatFilter,
): boolean {
  return vat === "all" || vatClassOf(row) === vat;
}

/** Active Shopify products, one row per distinct SKU (prefer most recently updated). */
export async function loadCatalog(companyId: string): Promise<VariantRow[]> {
  const items = await prisma.productItem.findMany({
    where: {
      companyId,
      sku: { not: null },
      // Active only: no draft, archived, or blank-status items.
      status: "active",
    },
    orderBy: { updatedAt: "desc" },
    select: {
      sku: true,
      productTitle: true,
      price: true,
      compareAtPrice: true,
      erp1TaxStatus: true,
      erp2TaxStatus: true,
      erp1ProductPriority: true,
      erp2ProductPriority: true,
      vendor: { select: { name: true } },
    },
  });

  const bySku = new Map<string, VariantRow>();
  for (const item of items) {
    const sku = item.sku?.trim();
    if (!sku || bySku.has(sku)) continue;
    bySku.set(sku, {
      sku,
      brand: item.vendor?.name?.trim() || null,
      productTitle: item.productTitle,
      priority: resolveProductPriority(
        item.erp1ProductPriority,
        item.erp2ProductPriority,
      ),
      price: toPrice(item.price),
      compareAtPrice: toPrice(item.compareAtPrice),
      erp1TaxStatus: item.erp1TaxStatus,
      erp2TaxStatus: item.erp2TaxStatus,
    });
  }
  return [...bySku.values()];
}

/**
 * Prices from the ERP (SALES_BUDGET_DISCOUNT_RULE_PREFIX rules):
 * - discounted ("Final Discount X%"): Selling = original × (1 − X%), Compare at = original;
 * - otherwise: Selling = original, Compare at = 0.
 * Original = ERP "Standard Selling" price; falls back to the Shopify price (compare-at when
 * set) only when the ERP has none.
 */
function erpPrices(
  v: VariantRow,
  standardPrice: number | undefined,
  discountPercent: number | undefined,
): Pick<VariantRow, "price" | "compareAtPrice"> {
  const original = standardPrice ?? v.compareAtPrice ?? v.price;
  if (original == null) return { price: null, compareAtPrice: null };
  if (discountPercent == null) return { price: original, compareAtPrice: 0 };
  return {
    price: Math.round(original * (1 - discountPercent / 100) * 100) / 100,
    compareAtPrice: original,
  };
}

/** Catalog + ERP data shared by every tab / merchant / shop. */
export type SalesBudgetBase = {
  companyId: string;
  catalog: VariantRow[];
  erp: SalesBudgetErpData;
  sales: SalesBudgetSalesData;
};

/**
 * Loads the active catalog, the (cached) ERP stock + tax status and the (cached) completed-
 * month sales. `refresh` regenerates the ERP "Stock Balance Summary - Item Wise" report,
 * reloads tax status and re-aggregates sales.
 */
export async function loadSalesBudgetBase(
  companyId: string,
  options: { refresh?: boolean } = {},
): Promise<SalesBudgetBase> {
  const rawCatalog = await loadCatalog(companyId);
  const [erp, sales] = await Promise.all([
    getSalesBudgetErpData(
      companyId,
      rawCatalog.map((v) => v.sku),
      options,
    ),
    getSalesBudgetSalesData(companyId, options),
  ]);
  // ERP Tax Status wins over the stored product columns (same source as the OSF).
  const catalog = rawCatalog.map((v) => {
    const key = normalizeSkuKey(v.sku);
    return {
      ...v,
      ...erpPrices(
        v,
        erp.standardPriceBySku.get(key),
        erp.discountPercentBySku.get(key),
      ),
      erp1TaxStatus: erp.erp1TaxBySku.has(key)
        ? (erp.erp1TaxBySku.get(key) ?? null)
        : v.erp1TaxStatus,
      erp2TaxStatus: erp.erp2TaxBySku.has(key)
        ? (erp.erp2TaxBySku.get(key) ?? null)
        : v.erp2TaxStatus,
    };
  });
  return { companyId, catalog, erp, sales };
}

/**
 * Which sales count toward Highest Sale Qty for a view (POS flag = ERP is_pos).
 * Online sales do NOT change with the Merchant / Shop selection:
 * - ONLINE tab: non-POS sales by the whole ONLINE merchant list, for any merchant picked;
 * - SHOP tab, ONLINE channel: non-POS sales by every shop's online merchants, for any shop;
 * - SHOP tab, SHOP channel: POS sales at the selected shop's warehouses (All Shops = every shop);
 * - SHOP tab, All channel: the selected shop's POS sales + the fixed online part.
 */
/** Sum of the given users' month targets; null when none of them has one. */
function sumTargets(
  sales: SalesBudgetSalesData,
  userIds: string[],
  kinds: Array<"shop" | "online">,
): number | null {
  let total: number | null = null;
  for (const id of new Set(userIds)) {
    const t = sales.targetsByUser.get(id);
    for (const kind of kinds) {
      const v = t?.[kind];
      if (v != null) total = (total ?? 0) + v;
    }
  }
  return total;
}

/**
 * Month targets for a view (Merchant Dashboard "Month target", matched by user id):
 * - ONLINE tab: total = every ONLINE merchant's online target; selected = that merchant's.
 * - SHOP tab: a shop's target = its Outlet merchants' shop (SHOP channel) / online (ONLINE
 *   channel) / shop + online (All channel) targets; total = every shop.
 * Target % = selected / total × 100, or 100 for "All".
 */
function targetFor(
  sales: SalesBudgetSalesData,
  tab: SalesBudgetTab,
  entity: string | null,
  channel: SalesBudgetShopChannel | null,
): SalesBudgetTarget {
  let totalLabel: string;
  let total: number | null;
  let selectedLabel: string | null = null;
  let selected: number | null = null;

  if (tab === "online") {
    totalLabel = "Online total";
    total = sumTargets(sales, [...sales.onlineMerchantIds.values()].flat(), [
      "online",
    ]);
    if (entity) {
      selectedLabel = `${entity}'s target`;
      selected = sumTargets(sales, sales.onlineMerchantIds.get(entity) ?? [], [
        "online",
      ]);
    }
  } else {
    const kinds: Array<"shop" | "online"> =
      channel === "shop"
        ? ["shop"]
        : channel === "online"
          ? ["online"]
          : ["shop", "online"];
    const suffix =
      channel === "shop" ? " (shop)" : channel === "online" ? " (online)" : "";
    totalLabel = `All Shops total${suffix}`;
    total = sumTargets(
      sales,
      [...sales.shopOnlineMerchantIds.values()].flat(),
      kinds,
    );
    if (entity) {
      selectedLabel = `${entity} target${suffix}`;
      selected = sumTargets(
        sales,
        sales.shopOnlineMerchantIds.get(entity) ?? [],
        kinds,
      );
    }
  }

  const percent = !entity
    ? total != null
      ? 100
      : null
    : total != null && selected != null
      ? (selected / total) * 100
      : null;
  return { totalLabel, total, selectedLabel, selected, percent };
}

export function saleScopeFor(
  sales: SalesBudgetSalesData,
  tab: SalesBudgetTab,
  entity: string | null,
  channel: SalesBudgetShopChannel | null,
): SalesBudgetContext["saleScope"] {
  const posWarehouses = new Set<string>();
  const merchantIds = new Set<string>();
  if (tab === "online") {
    for (const ids of sales.onlineMerchantIds.values())
      ids.forEach((id) => merchantIds.add(id));
    return { posWarehouses, merchantIds };
  }
  if (channel !== "online") {
    SALES_BUDGET_SHOPS.filter((s) => !entity || s.name === entity).forEach(
      (s) => s.warehouses.forEach((wh) => posWarehouses.add(wh)),
    );
  }
  if (channel !== "shop") {
    for (const ids of sales.shopOnlineMerchantIds.values())
      ids.forEach((id) => merchantIds.add(id));
  }
  return { posWarehouses, merchantIds };
}

/**
 * Which breakdowns a view covers (config: SALES_BUDGET_ONLINE / SALES_BUDGET_SHOPS):
 * - ONLINE tab, or SHOP tab with Channel ONLINE → the ONLINE breakdown;
 * - SHOP tab with Channel SHOP → the selected shop (All Shops = every shop);
 * - SHOP tab with Channel All → both.
 */
function scopeParts(
  tab: SalesBudgetTab,
  entity: string | null,
  channel: SalesBudgetShopChannel | null,
): SalesBudgetStockScope[] {
  const shops = SALES_BUDGET_SHOPS.filter((s) => !entity || s.name === entity);
  if (tab === "online" || channel === "online") return [SALES_BUDGET_ONLINE];
  if (channel === "shop") return shops;
  return [...shops, SALES_BUDGET_ONLINE];
}

export type SalesBudgetScope = {
  context: SalesBudgetContext;
  /** Catalog items in this view (before the VAT filter). */
  variants: VariantRow[];
};

/**
 * Scope for one tab + merchant/shop + channel + VAT. Every view lists ALL active items,
 * in stock or not; the warehouses / OSF columns only drive Current Stock and Current ROP.
 */
export async function resolveSalesBudgetScope(
  base: SalesBudgetBase,
  input: {
    tab: SalesBudgetTab;
    entity: string | null;
    vat: SalesBudgetVatFilter;
    shopChannel: SalesBudgetShopChannel | null;
  },
): Promise<SalesBudgetScope> {
  const parts = scopeParts(input.tab, input.entity, input.shopChannel);
  const warehouses = [...new Set(parts.flatMap((p) => p.warehouses))];
  const osfColumnKeys = [...new Set(parts.flatMap((p) => p.ropColumns))];

  const ropBySkuColumn = new Map<string, number>();
  if (osfColumnKeys.length > 0) {
    const rops = await prisma.productOsfRop.findMany({
      where: { companyId: base.companyId, columnKey: { in: osfColumnKeys } },
      select: { sku: true, columnKey: true, ropQty: true },
    });
    for (const rop of rops)
      ropBySkuColumn.set(`${rop.sku.trim()}::${rop.columnKey}`, rop.ropQty);
  }

  return {
    context: {
      companyId: base.companyId,
      tab: input.tab,
      vat: input.vat,
      entity: input.entity,
      shopChannel: input.shopChannel,
      osfColumnKeys,
      warehouses,
      erp: base.erp,
      ropBySkuColumn,
      sales: base.sales,
      saleScope: saleScopeFor(
        base.sales,
        input.tab,
        input.entity,
        input.shopChannel,
      ),
      target: targetFor(base.sales, input.tab, input.entity, input.shopChannel),
    },
    variants: base.catalog,
  };
}

const UNGROUPED_BRANDS = new Set(
  SALES_BUDGET_UNGROUPED_BRANDS.map((b) => b.trim().toLowerCase()),
);

/** Cut at the last `_` (GFFP03_3 → GFFP03), except brands kept as-is (Golden Rose). */
export function commonSkuOf(v: VariantRow): string {
  if (v.brand && UNGROUPED_BRANDS.has(v.brand.toLowerCase())) return v.sku;
  return parentSkuStem(v.sku);
}

/** Rank in SALES_BUDGET_PRIORITY_ORDER (lower = higher priority); unknown values rank last. */
function priorityRank(priority: string): number {
  const key = priority.trim().toLowerCase();
  const index = SALES_BUDGET_PRIORITY_ORDER.findIndex((p) =>
    key.startsWith(p.toLowerCase().replace(/ed$/, "")),
  );
  return index === -1 ? SALES_BUDGET_PRIORITY_ORDER.length : index;
}

/** Highest priority among a Common SKU's variants; null when none has one. */
function highestPriority(priorities: Array<string | null>): string | null {
  let best: string | null = null;
  for (const p of priorities) {
    if (!p?.trim()) continue;
    if (best == null || priorityRank(p) < priorityRank(best)) best = p;
  }
  return best;
}

export function groupByCommonSku(variants: VariantRow[]): SalesBudgetRow[] {
  const groups = new Map<string, VariantRow[]>();
  for (const v of variants) {
    const key = commonSkuOf(v);
    const list = groups.get(key) ?? [];
    list.push(v);
    groups.set(key, list);
  }

  const rows: SalesBudgetRow[] = [];
  for (const [commonSku, list] of groups) {
    const [sellingPriceMin, sellingPriceMax] = minMax(list.map((v) => v.price));
    // Compare at Price only from discounted variants (> 0); 0 when none is discounted.
    const discounted = list
      .map((v) => v.compareAtPrice)
      .filter((p) => p != null && p > 0);
    const [compareAtPriceMin, compareAtPriceMax] =
      discounted.length > 0
        ? minMax(discounted)
        : list.some((v) => v.compareAtPrice === 0)
          ? [0, 0]
          : [null, null];
    rows.push({
      commonSku,
      brand: list.find((v) => v.brand)?.brand ?? null,
      productTitle: list[0]?.productTitle ?? null,
      priority: highestPriority(list.map((v) => v.priority)),
      variantSkus: list.map((v) => v.sku).sort((a, b) => a.localeCompare(b)),
      sellingPriceMin,
      sellingPriceMax,
      compareAtPriceMin,
      compareAtPriceMax,
      highestSaleQty: null,
      targetPercent: null,
      budgetedQty: null,
      currentStock: null,
      currentRop: null,
      budgetedRevenue: null,
    });
  }
  return rows.sort((a, b) => a.commonSku.localeCompare(b.commonSku));
}

function sortedUnique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort(
    (a, b) => a.localeCompare(b),
  );
}

function matchesSearch(row: SalesBudgetRow, q: string): boolean {
  return (
    row.commonSku.toLowerCase().includes(q) ||
    (row.brand ?? "").toLowerCase().includes(q) ||
    (row.productTitle ?? "").toLowerCase().includes(q) ||
    row.variantSkus.some((sku) => sku.toLowerCase().includes(q))
  );
}

/** Sum of Budgeted Revenue; null when no row has one (e.g. no target). */
export function sumRevenue(
  rows: Array<Pick<SalesBudgetRow, "budgetedRevenue">>,
): number | null {
  let sum: number | null = null;
  for (const row of rows) {
    if (row.budgetedRevenue != null) sum = (sum ?? 0) + row.budgetedRevenue;
  }
  return sum == null ? null : Math.round(sum * 100) / 100;
}

/** A saved Budgeted Qty edit: one merchant / shop (on its saved sheet), VAT line and Common SKU. */
export type SavedQtyEdit = {
  sheet: string;
  entity: string;
  commonSku: string;
  vat: VatClass;
  qty: number;
};

type ViewPart = {
  tab: SalesBudgetTab;
  entity: string;
  channel: SalesBudgetShopChannel | null;
};

/**
 * The single merchant / shop views an aggregate view adds up (empty = not an aggregate):
 * - ONLINE, All Merchants → every merchant;
 * - SHOP, ONLINE or SHOP channel, All Shops → every shop on that channel;
 * - SHOP, All channel → the shop (or every shop) on both channels.
 */
function viewParts(ctx: SalesBudgetContext): ViewPart[] {
  if (ctx.tab === "online") {
    if (ctx.entity) return [];
    return [...ctx.sales.onlineMerchantIds.keys()].map((entity) => ({
      tab: "online",
      entity,
      channel: null,
    }));
  }
  if (ctx.entity && ctx.shopChannel !== "all") return [];
  const shops = ctx.entity
    ? [ctx.entity]
    : SALES_BUDGET_SHOPS.map((s) => s.name);
  const channels: SalesBudgetShopChannel[] =
    ctx.shopChannel === "all"
      ? ["shop", "online"]
      : [ctx.shopChannel ?? "shop"];
  return shops.flatMap((entity) =>
    channels.map((channel) => ({ tab: "shop" as const, entity, channel })),
  );
}

const VAT_CLASSES: VatClass[] = ["vat", "non_vat", "vat_non_vat"];

const revenueOf = (row: SalesBudgetRow, qty: number | null) => {
  const price =
    BUDGET_REVENUE_PRICE === "max" ? row.sellingPriceMax : row.sellingPriceMin;
  return qty == null || price == null
    ? null
    : Math.round(qty * price * 100) / 100;
};

/**
 * Budgeted Qty + Revenue of the view, built the way the Export / saved budget is, so the
 * screen's totals match it:
 * - by VAT line: a Common SKU with VAT and NON-VAT variants is budgeted per VAT line (each
 *   rounded and priced on its own) and VAT "All" shows their sum;
 * - by merchant / shop: an aggregate view ("All Merchants", "All Shops", the SHOP "All"
 *   channel) is the SUM of its merchant / shop views' Budgeted Qty, each with its own Target %;
 * - saved edits replace the calculated value of their merchant / shop + VAT line, also inside
 *   those sums (highlighted).
 */
async function applyBudgetedQty(
  rows: SalesBudgetRow[],
  scope: SalesBudgetScope,
  edits: SavedQtyEdit[],
): Promise<SalesBudgetRow[]> {
  const ctx = scope.context;
  const aggregate = viewParts(ctx);
  const parts: Array<{ entity: string | null } & Omit<ViewPart, "entity">> =
    aggregate.length > 0
      ? aggregate
      : [{ tab: ctx.tab, entity: ctx.entity, channel: ctx.shopChannel }];
  const inView = new Set(rows.map((r) => r.commonSku));
  const lines = (ctx.vat === "all" ? VAT_CLASSES : [ctx.vat as VatClass]).map(
    (vat) => ({
      vat,
      rows: groupByCommonSku(
        scope.variants.filter((v) => matchesVat(v, vat)),
      ).filter((r) => inView.has(r.commonSku)),
    }),
  );

  const qtySum = new Map<string, number>();
  const revenueSum = new Map<string, number>();
  const edited = new Set<string>();
  for (const part of parts) {
    const partCtx: SalesBudgetContext =
      aggregate.length > 0
        ? {
            ...ctx,
            tab: part.tab,
            entity: part.entity,
            shopChannel: part.channel,
            saleScope: saleScopeFor(
              ctx.sales,
              part.tab,
              part.entity,
              part.channel,
            ),
            target: targetFor(ctx.sales, part.tab, part.entity, part.channel),
          }
        : ctx;
    const sheet = budgetSheetFor(part.tab, part.channel);
    for (const line of lines) {
      const qty = await getBudgetedQty(
        partCtx,
        line.rows,
        await getHighestSaleQty(partCtx, line.rows),
      );
      const saved = new Map(
        edits
          .filter(
            (e) =>
              e.sheet === sheet &&
              e.entity === part.entity &&
              e.vat === line.vat,
          )
          .map((e) => [e.commonSku, e.qty]),
      );
      for (const row of line.rows) {
        const value =
          saved.get(row.commonSku) ?? qty.get(row.commonSku) ?? null;
        if (saved.has(row.commonSku)) edited.add(row.commonSku);
        if (value == null) continue;
        qtySum.set(row.commonSku, (qtySum.get(row.commonSku) ?? 0) + value);
        const revenue = revenueOf(row, value);
        if (revenue != null) {
          revenueSum.set(
            row.commonSku,
            (revenueSum.get(row.commonSku) ?? 0) + revenue,
          );
        }
      }
    }
  }
  return rows.map((row) => ({
    ...row,
    budgetedQty: qtySum.get(row.commonSku) ?? null,
    budgetedRevenue: revenueSum.has(row.commonSku)
      ? Math.round(revenueSum.get(row.commonSku)! * 100) / 100
      : null,
    ...(edited.has(row.commonSku) ? { savedEdit: true } : {}),
  }));
}

export async function buildSalesBudgetPage(
  scope: SalesBudgetScope,
  options: SalesBudgetPageOptions,
): Promise<Omit<SalesBudgetPageData, "budgetFile">> {
  const ctx = scope.context;
  let rows = groupByCommonSku(
    scope.variants.filter((v) => matchesVat(v, ctx.vat)),
  );

  // Dropdown options come from the view before the brand/priority filters narrow it.
  const brands = sortedUnique(rows.map((row) => row.brand));
  const priorities = sortedUnique(rows.map((row) => row.priority));

  if (options.brand) rows = rows.filter((row) => row.brand === options.brand);
  if (options.priority === SALES_BUDGET_NO_PRIORITY)
    rows = rows.filter((row) => !row.priority);
  else if (options.priority)
    rows = rows.filter((row) => row.priority === options.priority);

  const q = options.q?.trim().toLowerCase();
  if (q) rows = rows.filter((row) => matchesSearch(row, q));

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / options.limit));
  const page = Math.min(Math.max(1, options.page), pageCount);

  // Calculated for every filtered row (cheap, in memory) so the revenue total covers all
  // pages, not just the visible one.
  const calculated = await applyBudgetedQty(
    await applyCalculations(ctx, rows),
    scope,
    options.savedEdits ?? [],
  );

  return {
    rows: calculated.slice((page - 1) * options.limit, page * options.limit),
    budgetedRevenueTotal: sumRevenue(calculated),
    filteredSkus: calculated.map((row) => row.commonSku),
    total,
    page,
    limit: options.limit,
    erpFetchedAt: ctx.erp.fetchedAt.toISOString(),
    brands,
    priorities,
    merchants: [...ctx.sales.onlineMerchantIds.keys()],
    target: ctx.target,
  };
}

/** Fill the calculated columns. */
export async function applyCalculations(
  ctx: SalesBudgetContext,
  rows: SalesBudgetRow[],
): Promise<SalesBudgetRow[]> {
  const [highestSaleQty, currentStock, currentRop] = await Promise.all([
    getHighestSaleQty(ctx, rows),
    getCurrentStock(ctx, rows),
    getCurrentRop(ctx, rows),
  ]);
  const budgetedQty = await getBudgetedQty(ctx, rows, highestSaleQty);
  const budgetedRevenue = await getBudgetedRevenue(ctx, rows, budgetedQty);

  return rows.map((row) => ({
    ...row,
    highestSaleQty: highestSaleQty.get(row.commonSku) ?? null,
    targetPercent: ctx.target.percent,
    budgetedQty: budgetedQty.get(row.commonSku) ?? null,
    currentStock: currentStock.get(row.commonSku) ?? null,
    currentRop: currentRop.get(row.commonSku) ?? null,
    budgetedRevenue: budgetedRevenue.get(row.commonSku) ?? null,
  }));
}
