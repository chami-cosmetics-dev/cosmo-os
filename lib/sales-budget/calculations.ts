import "server-only";

import { resolveLocationRopQty } from "@/lib/item-trends/rop-resolve";
import { normalizeSkuKey } from "@/lib/product-items/erp-priority-sync";
import {
  BUDGET_REVENUE_PRICE,
  BUDGET_ROUNDING,
  type SalesBudgetRow,
  type SalesBudgetShopChannel,
  type SalesBudgetTab,
  type SalesBudgetTarget,
  type SalesBudgetVatFilter,
} from "@/lib/sales-budget/config";
import type { SalesBudgetErpData } from "@/lib/sales-budget/erp-data";
import type { SalesBudgetSalesData } from "@/lib/sales-budget/sales-data";

/**
 * Inputs every calculation receives.
 * `entity` is the selected merchant (ONLINE) or shop (SHOP) name;
 * null means "All Merchants" / "All Shops" → return combined totals.
 */
export type SalesBudgetContext = {
  companyId: string;
  tab: SalesBudgetTab;
  vat: SalesBudgetVatFilter;
  entity: string | null;
  /** SHOP tab Channel: "online" / "shop", or "all" = combined. Null on the ONLINE tab. */
  shopChannel: SalesBudgetShopChannel | null;
  /** OSF columns in scope (selected shop, all shops, or the online store). */
  osfColumnKeys: string[];
  /** ERP warehouses in scope (from those OSF columns). */
  warehouses: string[];
  /** Live ERP stock + tax status (cached until Refresh). */
  erp: SalesBudgetErpData;
  /** OSF ROP for the in-scope columns: `${sku}::${columnKey}` → ropQty. */
  ropBySkuColumn: Map<string, number>;
  /** Completed-month sales buckets (cached until Refresh). */
  sales: SalesBudgetSalesData;
  /**
   * Which sales count for this view: POS sales at these warehouses (shop sales) and
   * non-POS sales by these merchants (online sales). Independent of the VAT filter.
   */
  saleScope: { posWarehouses: Set<string>; merchantIds: Set<string> };
  /** Month targets for this view (chips + Target %). */
  target: SalesBudgetTarget;
};

/** Rows on the current page. Values are filled after the stubs run. */
export type SalesBudgetCalcRow = Pick<
  SalesBudgetRow,
  | "commonSku"
  | "variantSkus"
  | "sellingPriceMin"
  | "sellingPriceMax"
  | "compareAtPriceMin"
  | "compareAtPriceMax"
>;

/** Result map keyed by commonSku. A missing key or null renders as "-". */
export type SalesBudgetValues = Map<string, number | null>;

/** Whether a sale counts for a view: POS at an in-scope warehouse, else by an in-scope merchant. */
export function saleInScope(
  scope: SalesBudgetContext["saleScope"],
  sale: { pos: boolean; warehouse: string | null; merchantId: string | null },
): boolean {
  return sale.pos
    ? sale.warehouse != null && scope.posWarehouses.has(sale.warehouse)
    : sale.merchantId != null && scope.merchantIds.has(sale.merchantId);
}

/** Best single completed month for one variant SKU within the view's sales scope. */
export function variantHighestMonthQty(ctx: SalesBudgetContext, sku: string): number {
  const byMonth = new Map<string, number>();
  for (const b of ctx.sales.bySku.get(normalizeSkuKey(sku)) ?? []) {
    if (saleInScope(ctx.saleScope, b)) byMonth.set(b.month, (byMonth.get(b.month) ?? 0) + b.qty);
  }
  let best = 0;
  for (const qty of byMonth.values()) best = Math.max(best, qty);
  return best;
}

/**
 * Highest Sale Qty: the highest units sold in any single completed calendar month (the
 * current month is excluded; months without sales count as 0).
 * Per variant SKU: sum the month across every merchant/shop in scope, take the best month.
 * Common SKU: MAX across its variants (not the sum). No sales → 0.
 */
export async function getHighestSaleQty(
  ctx: SalesBudgetContext,
  rows: SalesBudgetCalcRow[],
): Promise<SalesBudgetValues> {
  const out: SalesBudgetValues = new Map();
  for (const row of rows) {
    let best = 0;
    for (const sku of row.variantSkus) best = Math.max(best, variantHighestMonthQty(ctx, sku));
    out.set(row.commonSku, best);
  }
  return out;
}

/** Whole units per BUDGET_ROUNDING; float noise is trimmed first (15% × 20 → 3, not 4). */
export function roundBudgetQty(value: number): number {
  const clean = Math.round(value * 1e6) / 1e6;
  if (BUDGET_ROUNDING === "floor") return Math.floor(clean);
  if (BUDGET_ROUNDING === "round") return Math.round(clean);
  return Math.ceil(clean);
}

/**
 * Budgeted Qty per Common SKU, from its Highest Sale Qty:
 * - SHOP tab, SHOP channel: = Highest Sale Qty (the shop's own POS sales; no target share).
 * - ONLINE tab, SHOP tab ONLINE channel (and All channel): Target % × Highest Sale Qty,
 *   using the exact (unrounded) Target %; "All" selections are 100%.
 * Rounded to whole units with BUDGET_ROUNDING. Null ("-") when Highest Sale Qty or the
 * Target % is not available.
 */
export async function getBudgetedQty(
  ctx: SalesBudgetContext,
  rows: SalesBudgetCalcRow[],
  highestSaleQty: SalesBudgetValues,
): Promise<SalesBudgetValues> {
  const shopOnly = ctx.tab === "shop" && ctx.shopChannel === "shop";
  const share = shopOnly ? 1 : ctx.target.percent == null ? null : ctx.target.percent / 100;
  const out: SalesBudgetValues = new Map();
  for (const row of rows) {
    const hsq = highestSaleQty.get(row.commonSku);
    out.set(row.commonSku, hsq == null || share == null ? null : roundBudgetQty(hsq * share));
  }
  return out;
}

/**
 * Current Stock: ERP "Stock Balance Summary - Item Wise" balance, summed over every
 * variant SKU of the row and every in-scope warehouse. Null when the ERP has no row.
 */
export async function getCurrentStock(
  ctx: SalesBudgetContext,
  rows: SalesBudgetCalcRow[],
): Promise<SalesBudgetValues> {
  const out: SalesBudgetValues = new Map();
  for (const row of rows) {
    let total: number | null = null;
    for (const sku of row.variantSkus) {
      const byWarehouse = ctx.erp.stockBySku.get(normalizeSkuKey(sku));
      if (!byWarehouse) continue;
      for (const warehouse of ctx.warehouses) {
        const qty = byWarehouse.get(warehouse);
        if (qty != null) total = (total ?? 0) + qty;
      }
    }
    out.set(row.commonSku, total);
  }
  return out;
}

/**
 * Current ROP: OSF ROP per in-scope column, resolved for the Common SKU the same way
 * Item Trends does (parent key, else unanimous/single child — never summed across
 * variants), then summed across columns (All Shops / ERP_1 + ERP_2).
 */
export async function getCurrentRop(
  ctx: SalesBudgetContext,
  rows: SalesBudgetCalcRow[],
): Promise<SalesBudgetValues> {
  const out: SalesBudgetValues = new Map();
  for (const row of rows) {
    let total: number | null = null;
    for (const columnKey of ctx.osfColumnKeys) {
      const rop = resolveLocationRopQty({
        grain: "common",
        sku: row.commonSku,
        commonSkuKey: row.commonSku,
        columnKey,
        ropBySkuColumn: ctx.ropBySkuColumn,
        childSkus: row.variantSkus,
      });
      if (rop != null) total = (total ?? 0) + rop;
    }
    out.set(row.commonSku, total);
  }
  return out;
}

/**
 * Budgeted Revenue = Budgeted Qty × Selling Price. When a Common SKU's variants have
 * different prices, BUDGET_REVENUE_PRICE picks the lowest ("min") or highest ("max").
 * Null ("-") when Budgeted Qty or the selling price is missing.
 */
export async function getBudgetedRevenue(
  _ctx: SalesBudgetContext,
  rows: SalesBudgetCalcRow[],
  budgetedQty: SalesBudgetValues,
): Promise<SalesBudgetValues> {
  const out: SalesBudgetValues = new Map();
  for (const row of rows) {
    const qty = budgetedQty.get(row.commonSku);
    const price = BUDGET_REVENUE_PRICE === "max" ? row.sellingPriceMax : row.sellingPriceMin;
    out.set(
      row.commonSku,
      qty == null || price == null ? null : Math.round(qty * price * 100) / 100,
    );
  }
  return out;
}
