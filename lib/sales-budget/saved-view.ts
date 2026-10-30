import "server-only";

import { prisma } from "@/lib/prisma";
import { colomboMonth } from "@/lib/sales-budget/budget-month";
import {
  SALES_BUDGET_NO_PRIORITY,
  SALES_BUDGET_VAT_LABELS,
  type SalesBudgetTab,
  type SalesBudgetVatFilter,
  type SavedBudgetListItem,
  type SavedBudgetRow,
  type SavedBudgetViewData,
} from "@/lib/sales-budget/config";
import type { Cell } from "@/lib/sales-budget/export";
import { sumCells } from "@/lib/sales-budget/export-workbook";
import { budgetSheetFor, getParsedSavedBudget } from "@/lib/sales-budget/saved-budget";

/**
 * Saved Budgets tab: the saved months and a read-only view of one saved snapshot. Everything
 * comes from the snapshot (never recalculated from live data).
 */

/** Saved months, newest first. Open while its creating month runs (saves allowed). */
export async function listSavedBudgets(companyId: string): Promise<SavedBudgetListItem[]> {
  const records = await prisma.salesBudgetSnapshot.findMany({
    where: { companyId },
    orderBy: { targetMonth: "desc" },
    select: { targetMonth: true, lastUpdatedAt: true },
  });
  const now = colomboMonth();
  return records.map((r) => ({
    targetMonth: r.targetMonth,
    lastUpdatedAt: r.lastUpdatedAt.toISOString(),
    // YYYY-MM compares as text: a November budget stays open through October.
    status: now < r.targetMonth ? "open" : "locked",
  }));
}

export type SavedBudgetViewQuery = {
  tab: SalesBudgetTab;
  /** SHOP tab: which sheet ("shop" = SHOP-SHOP, "online" = SHOP-ONLINE). */
  channel: "shop" | "online";
  /** Merchant / shop name, or null = all. */
  entity: string | null;
  vat: SalesBudgetVatFilter;
  brand: string | null;
  priority: string | null;
  q?: string;
  page: number;
  limit: number;
};

export class SavedBudgetViewError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const num = (cell: Cell | undefined) => (typeof cell === "number" ? cell : null);
const text = (cell: Cell | undefined) => (cell == null || cell === "" ? null : String(cell));
/** As saved: a number or a range text ("7,600 – 7,950"). */
const priceOf = (cell: Cell | undefined) => (cell == null || cell === "" ? null : cell);

/**
 * One merchant / shop (or all of them) on one sheet of the saved snapshot, filtered and paged like
 * the live screen. "All" shows each line's sums across the merchant / shop blocks (the Excel
 * TOTAL columns); a value the snapshot only keeps per shop and that can't be summed (SHOP-SHOP
 * Highest Sale Qty: each shop's own best month) is "-".
 */
export async function getSavedBudgetView(
  companyId: string,
  targetMonth: string,
  query: SavedBudgetViewQuery,
): Promise<SavedBudgetViewData> {
  const saved = await getParsedSavedBudget(companyId, targetMonth);
  if (!saved) throw new SavedBudgetViewError("No saved budget for this month.", 404);

  const sheet = budgetSheetFor(query.tab, query.tab === "shop" ? query.channel : null)!;
  const section = saved.budget.sections.find((s) => s.sheetName === sheet);
  if (!section) throw new SavedBudgetViewError(`The saved budget has no ${sheet} sheet.`, 500);

  const entityIndex = query.entity ? section.entities.indexOf(query.entity) : -1;
  if (query.entity && entityIndex === -1) {
    throw new SavedBudgetViewError(`${query.entity} is not in this saved budget.`, 400);
  }

  const fixedCol = (h: string) => section.fixedHeaders.indexOf(h);
  const metricCol = (h: string) => section.metricHeaders.indexOf(h);
  const vatLabel = query.vat === "all" ? null : SALES_BUDGET_VAT_LABELS[query.vat];

  // The edited lines of this view (any merchant / shop for "All").
  const edited = new Set(
    saved.budget.edits
      .filter((e) => e.sheet === sheet && (!query.entity || e.entity === query.entity))
      .map((e) => `${e.vat}|${e.commonSku}`),
  );

  /** A value kept per merchant / shop block, or once in the item columns. */
  const valueOf = (row: (typeof section.rows)[number], header: string): number | null => {
    const m = metricCol(header);
    if (m === -1) return num(row.fixed[fixedCol(header)]);
    if (query.entity) return num(row.metrics[entityIndex]?.[m]);
    if (header === "Highest Sale Qty") return null;
    return num(sumCells(row.metrics.map((block) => block?.[m] ?? "")));
  };

  let rows: SavedBudgetRow[] = section.rows
    .filter((row) => !vatLabel || row.fixed[fixedCol("VAT")] === vatLabel)
    .map((row) => {
      const commonSku = String(row.fixed[fixedCol("Common SKU")]);
      const vat = String(row.fixed[fixedCol("VAT")]);
      return {
        commonSku,
        vat,
        brand: text(row.fixed[fixedCol("Brand")]),
        productTitle: text(row.fixed[fixedCol("Product Title")]),
        priority: text(row.fixed[fixedCol("Priority")]),
        highestSaleQty: valueOf(row, "Highest Sale Qty"),
        // "All" = every merchant / shop combined (100% when the snapshot has a total target).
        targetPercent: query.entity
          ? valueOf(row, "Target %")
          : section.totalTarget != null
            ? 100
            : null,
        budgetedQty: valueOf(row, "Budgeted Qty"),
        currentStock: valueOf(row, "Current Stock"),
        currentRop: valueOf(row, "Current ROP"),
        sellingPrice: priceOf(row.fixed[fixedCol("Selling Price")]),
        compareAtPrice: priceOf(row.fixed[fixedCol("Compare at Price")]),
        budgetedRevenue: valueOf(row, "Budgeted Revenue"),
        edited: edited.has(`${vat}|${commonSku}`),
      };
    });

  const sorted = (values: Array<string | null>) =>
    [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));
  const brands = sorted(rows.map((r) => r.brand));
  const priorities = sorted(rows.map((r) => r.priority));

  if (query.brand) rows = rows.filter((r) => r.brand === query.brand);
  if (query.priority === SALES_BUDGET_NO_PRIORITY) rows = rows.filter((r) => !r.priority);
  else if (query.priority) rows = rows.filter((r) => r.priority === query.priority);
  const q = query.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      [r.commonSku, r.brand, r.productTitle].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / query.limit));
  const page = Math.min(Math.max(1, query.page), pageCount);
  const revenue = sumCells(rows.map((r) => r.budgetedRevenue ?? ""));

  const suffix = query.tab === "shop" ? (query.channel === "shop" ? " (shop)" : " (online)") : "";
  const entityTotals = query.entity ? section.entityTotals[entityIndex] : null;
  return {
    targetMonth,
    lastUpdatedAt: saved.lastUpdatedAt.toISOString(),
    rows: rows.slice((page - 1) * query.limit, page * query.limit),
    total,
    page,
    limit: query.limit,
    entities: section.entities,
    brands,
    priorities,
    target: {
      totalLabel: query.tab === "online" ? "Online total" : `All Shops total${suffix}`,
      total: section.totalTarget,
      selectedLabel: query.entity
        ? query.tab === "online"
          ? `${query.entity}'s target`
          : `${query.entity} target${suffix}`
        : null,
      selected: entityTotals?.target ?? null,
      percent: query.entity ? (entityTotals?.percent ?? null) : section.totalTarget != null ? 100 : null,
    },
    budgetedRevenueTotal: typeof revenue === "number" ? revenue : rows.length > 0 ? 0 : null,
  };
}
