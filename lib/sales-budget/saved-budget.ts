import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { budgetSaveBlockedReason } from "@/lib/sales-budget/budget-month";
import {
  budgetSheetFor,
  SALES_BUDGET_VAT_LABELS,
  type BudgetPriceChange,
  type SalesBudgetPageData,
  type SalesBudgetShopChannel,
  type SalesBudgetTab,
  type SalesBudgetVatFilter,
} from "@/lib/sales-budget/config";
import {
  buildSalesBudgetExport,
  currentItemPrices,
  itemLineKey,
  type Cell,
  type SalesBudgetExportSection,
} from "@/lib/sales-budget/export";
import {
  revenuePriceOf,
  sumCells,
  writeSalesBudgetWorkbook,
} from "@/lib/sales-budget/export-workbook";
import { loadSalesBudgetBase } from "@/lib/sales-budget/page-data";

/**
 * Saved Sales Budget = a snapshot, like the report snapshots (ReceivableOutstandingSnapshot):
 * ONE SalesBudgetSnapshot record per budget month holding the frozen budget as JSON — every
 * line of the Export sheets (all merchants / shops) plus the Budgeted Qty cells users edited.
 * Screens read the snapshot; Download builds the Excel (Export layout) from it, never from live
 * data. The first save freezes every value (prices, stock, ROP, Highest Sale Qty) as of that
 * day; later saves change only the edited cells and what depends on them (Budgeted Revenue
 * beside them, the totals), plus — when the user chooses — today's prices for items whose
 * price changed, and Common SKUs activated since the first save (added with today's values;
 * existing lines untouched).
 */

type VatClass = Exclude<SalesBudgetVatFilter, "all">;

/** One edited Budgeted Qty cell. `originalQty` = the cell's value before its first edit. */
export type SavedBudgetEdit = {
  sheet: string;
  entity: string;
  /** VAT column label ("VAT" / "NON-VAT" / "VAT/NON-VAT"). */
  vat: string;
  commonSku: string;
  qty: number;
  originalQty: Cell;
  savedAt: string;
  savedBy: string;
};

/** What a snapshot holds: the Export sheets' lines + the user edits. */
export type ParsedBudget = { sections: SalesBudgetExportSection[]; edits: SavedBudgetEdit[] };

export class SalesBudgetSaveError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Extra JSON for the screen (e.g. the price-change preview). */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export { budgetSheetFor };

export { revenuePriceOf };

const revenueCell = (qty: number, price: number | null): Cell =>
  price == null ? "" : Math.round(qty * price * 100) / 100;

const toNumberOrNull = (cell: Cell | undefined) => (typeof cell === "number" ? cell : null);

/** Snapshot JSON → budget (a fresh object on every DB read). */
function fromSnapshot(json: Prisma.JsonValue): ParsedBudget {
  const value = json as unknown as Partial<ParsedBudget> | null;
  if (!value || !Array.isArray(value.sections)) {
    throw new Error("Saved budget snapshot is not readable");
  }
  return { sections: value.sections, edits: value.edits ?? [] };
}

const toSnapshot = (budget: ParsedBudget) => budget as unknown as Prisma.InputJsonValue;

export type BudgetQtyChange = { commonSku: string; budgetedQty: number };

/**
 * Writes the changed Budgeted Qty (and the Budgeted Revenue beside it, from the saved
 * Selling Price) into one merchant / shop block, and re-totals that block. Item-wise TOTAL
 * columns, the TOTAL row and SUMMARY are recomputed when the workbook is written.
 */
function applyQtyChanges(
  budget: ParsedBudget,
  view: { sheet: string; entity: string; vat: SalesBudgetVatFilter },
  changes: BudgetQtyChange[],
  stamp: { savedAt: string; savedBy: string },
) {
  if (changes.length === 0) return;
  const section = budget.sections.find((s) => s.sheetName === view.sheet);
  const entityIndex = section?.entities.indexOf(view.entity) ?? -1;
  if (!section || entityIndex === -1) {
    throw new SalesBudgetSaveError(
      `${view.entity} is not in the saved budget (${view.sheet}).`,
      409,
    );
  }
  const skuCol = section.fixedHeaders.indexOf("Common SKU");
  const vatCol = section.fixedHeaders.indexOf("VAT");
  const priceCol = section.fixedHeaders.indexOf("Selling Price");
  const qtyOffset = section.metricHeaders.indexOf("Budgeted Qty");
  const revenueOffset = section.metricHeaders.indexOf("Budgeted Revenue");
  const vatLabel = view.vat === "all" ? null : SALES_BUDGET_VAT_LABELS[view.vat as VatClass];

  const problems: string[] = [];
  for (const change of changes) {
    const matches = section.rows.filter(
      (r) => r.fixed[skuCol] === change.commonSku && (!vatLabel || r.fixed[vatCol] === vatLabel),
    );
    if (matches.length !== 1) {
      problems.push(
        matches.length === 0
          ? `${change.commonSku} is not in the saved budget`
          : `${change.commonSku} has VAT and NON-VAT lines; pick the VAT filter to edit it`,
      );
      continue;
    }
    const row = matches[0];
    const block = (row.metrics[entityIndex] ??= section.metricHeaders.map((): Cell => ""));
    const key = (e: SavedBudgetEdit) =>
      e.sheet === view.sheet &&
      e.entity === view.entity &&
      e.vat === row.fixed[vatCol] &&
      e.commonSku === change.commonSku;
    const previous = budget.edits.find(key);
    const originalQty = previous ? previous.originalQty : block[qtyOffset];

    block[qtyOffset] = change.budgetedQty;
    block[revenueOffset] = revenueCell(change.budgetedQty, revenuePriceOf(row.fixed[priceCol]));

    budget.edits = budget.edits.filter((e) => !key(e));
    // Back to the original value = no longer an edit.
    if (change.budgetedQty !== originalQty) {
      budget.edits.push({
        sheet: view.sheet,
        entity: view.entity,
        vat: String(row.fixed[vatCol]),
        commonSku: change.commonSku,
        qty: change.budgetedQty,
        originalQty,
        ...stamp,
      });
    }
  }
  if (problems.length > 0) {
    throw new SalesBudgetSaveError(`Not saved: ${problems.slice(0, 5).join("; ")}.`, 409);
  }

  const column = (offset: number) => section.rows.map((r) => r.metrics[entityIndex]?.[offset] ?? "");
  section.entityTotals[entityIndex] = {
    ...section.entityTotals[entityIndex],
    qty: toNumberOrNull(sumCells(column(qtyOffset))),
    revenue: toNumberOrNull(sumCells(column(revenueOffset))),
  };
}
/** Re-totals every merchant / shop block of a sheet (after rows or prices changed). */
function retotalAll(section: SalesBudgetExportSection) {
  const qtyOffset = section.metricHeaders.indexOf("Budgeted Qty");
  const revenueOffset = section.metricHeaders.indexOf("Budgeted Revenue");
  section.entityTotals = section.entityTotals.map((t, i) => {
    const column = (offset: number) => section.rows.map((r) => r.metrics[i]?.[offset] ?? "");
    return {
      ...t,
      qty: toNumberOrNull(sumCells(column(qtyOffset))),
      revenue: toNumberOrNull(sumCells(column(revenueOffset))),
    };
  });
}

type CurrentPrices = ReturnType<typeof currentItemPrices>;

/** Item lines (same on every sheet, so read from the first) whose prices changed. */
function findPriceChanges(budget: ParsedBudget, current: CurrentPrices): BudgetPriceChange[] {
  const section = budget.sections[0];
  if (!section) return [];
  const col = (h: string) => section.fixedHeaders.indexOf(h);
  const [skuCol, vatCol, sellCol, compareCol] = [
    col("Common SKU"),
    col("VAT"),
    col("Selling Price"),
    col("Compare at Price"),
  ];
  const out: BudgetPriceChange[] = [];
  for (const row of section.rows) {
    // Items no longer active keep their saved prices.
    const now = current.get(itemLineKey(row.fixed[vatCol], row.fixed[skuCol]));
    if (!now) continue;
    if (now.selling === row.fixed[sellCol] && now.compareAt === row.fixed[compareCol]) continue;
    out.push({
      commonSku: String(row.fixed[skuCol]),
      vat: String(row.fixed[vatCol]),
      oldSellingPrice: row.fixed[sellCol],
      newSellingPrice: now.selling,
      oldCompareAtPrice: row.fixed[compareCol],
      newCompareAtPrice: now.compareAt,
    });
  }
  return out;
}

/**
 * Writes today's Selling / Compare at Price into the changed item lines on every sheet and
 * recalculates their Budgeted Revenue in every merchant / shop block (qty × the new price
 * — a range uses its lowest price). Quantities are not touched.
 */
function applyPriceChanges(budget: ParsedBudget, changes: BudgetPriceChange[]) {
  if (changes.length === 0) return;
  const byKey = new Map(changes.map((c) => [itemLineKey(c.vat, c.commonSku), c]));
  for (const section of budget.sections) {
    const col = (h: string) => section.fixedHeaders.indexOf(h);
    const [skuCol, vatCol, sellCol, compareCol] = [
      col("Common SKU"),
      col("VAT"),
      col("Selling Price"),
      col("Compare at Price"),
    ];
    const qtyOffset = section.metricHeaders.indexOf("Budgeted Qty");
    const revenueOffset = section.metricHeaders.indexOf("Budgeted Revenue");
    for (const row of section.rows) {
      const change = byKey.get(itemLineKey(row.fixed[vatCol], row.fixed[skuCol]));
      if (!change) continue;
      row.fixed[sellCol] = change.newSellingPrice;
      row.fixed[compareCol] = change.newCompareAtPrice;
      const price = revenuePriceOf(change.newSellingPrice);
      for (const block of row.metrics) {
        const qty = block?.[qtyOffset];
        if (block && typeof qty === "number") block[revenueOffset] = revenueCell(qty, price);
      }
    }
    retotalAll(section);
  }
}

/**
 * Adds Common SKUs that are not in the snapshot at all (activated after the first save) with
 * today's values, in Common SKU order. Existing lines are left as they are. Merchants / shops
 * added since the first save have no block in the snapshot, so they are skipped.
 */
function addNewItems(budget: ParsedBudget, fresh: SalesBudgetExportSection[]): number {
  let added = 0;
  for (const section of budget.sections) {
    const source = fresh.find((s) => s.sheetName === section.sheetName);
    if (!source) continue;
    const skuCol = section.fixedHeaders.indexOf("Common SKU");
    const known = new Set(section.rows.map((r) => String(r.fixed[skuCol])));
    const entityIndex = section.entities.map((name) => source.entities.indexOf(name));
    let changed = false;
    for (const row of source.rows) {
      const sku = String(row.fixed[skuCol]);
      if (known.has(sku)) continue;
      const line = { fixed: row.fixed, metrics: entityIndex.map((i) => (i === -1 ? null : row.metrics[i])) };
      const at = section.rows.findIndex((r) => String(r.fixed[skuCol]).localeCompare(sku) > 0);
      section.rows.splice(at === -1 ? section.rows.length : at, 0, line);
      changed = true;
      if (section === budget.sections[0]) added += 1;
    }
    if (changed) retotalAll(section);
  }
  return added;
}

/** Common SKUs active today that the snapshot doesn't have. */
function hasNewItems(budget: ParsedBudget, current: CurrentPrices): boolean {
  const section = budget.sections[0];
  if (!section) return false;
  const skuCol = section.fixedHeaders.indexOf("Common SKU");
  const known = new Set(section.rows.map((r) => String(r.fixed[skuCol])));
  return [...current.values()].some((item) => !known.has(item.commonSku));
}


export type SalesBudgetSaveInput = {
  companyId: string;
  userId: string;
  userLabel: string;
  targetMonth: string;
  /** The merchant / shop view the edits belong to; null when saving without edits. */
  view: {
    tab: SalesBudgetTab;
    channel: SalesBudgetShopChannel | null;
    entity: string;
    vat: SalesBudgetVatFilter;
  } | null;
  changes: BudgetQtyChange[];
  /**
   * Saved prices vs today's: "ask" stops with a 409 listing the changed items (nothing saved),
   * "update" writes today's prices (and revenue) into those items, "keep" leaves them.
   */
  prices: "ask" | "update" | "keep";
};

const PRICE_PREVIEW_COUNT = 5;

/**
 * Saves the month's snapshot. First save: the full calculated budget (every merchant / shop) +
 * `changes`. Later saves: only `changes` (+ the price update when chosen, + Common SKUs added
 * since). Saves for the same month run one at a time (Postgres advisory lock), each starting
 * from the latest snapshot, so one user's save never drops another's edits.
 */
export async function saveSalesBudget(input: SalesBudgetSaveInput) {
  const blocked = budgetSaveBlockedReason(input.targetMonth);
  if (blocked) throw new SalesBudgetSaveError(blocked, 403);
  const { view } = input;
  const sheet = view ? budgetSheetFor(view.tab, view.channel) : null;
  if (input.changes.length > 0 && (!view || !sheet)) {
    throw new SalesBudgetSaveError(
      "Pick a merchant / shop and a single channel to save Budgeted Qty.",
      400,
    );
  }

  const where = {
    companyId_targetMonth: { companyId: input.companyId, targetMonth: input.targetMonth },
  };
  const base = await loadSalesBudgetBase(input.companyId);
  const current = currentItemPrices(base);
  const existing = await prisma.salesBudgetSnapshot.findUnique({
    where,
    select: { snapshot: true },
  });
  // The first save builds the whole budget (slow); do it before taking the lock.
  let fresh = existing ? null : await buildSalesBudgetExport(input.companyId, base);

  if (existing && input.prices === "ask") {
    const changes = findPriceChanges(fromSnapshot(existing.snapshot), current);
    if (changes.length > 0) {
      throw new SalesBudgetSaveError(
        `Prices have changed for ${changes.length} items since this budget was saved.`,
        409,
        {
          code: "prices_changed",
          count: changes.length,
          preview: changes.slice(0, PRICE_PREVIEW_COUNT),
        },
      );
    }
  }

  return prisma.$transaction(
    async (tx) => {
      const lockKey = `sales-budget:${input.companyId}:${input.targetMonth}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const record = await tx.salesBudgetSnapshot.findUnique({
        where,
        select: { snapshot: true },
      });
      const now = new Date();
      let budget: ParsedBudget;
      let changed = !record;
      let addedItems = 0;
      let pricesUpdated = 0;
      if (record) {
        budget = fromSnapshot(record.snapshot);
        if (hasNewItems(budget, current)) {
          addedItems = addNewItems(budget, await buildSalesBudgetExport(input.companyId, base));
          changed ||= addedItems > 0;
        }
        if (input.prices === "update") {
          const priceChanges = findPriceChanges(budget, current);
          applyPriceChanges(budget, priceChanges);
          pricesUpdated = priceChanges.length;
          changed ||= pricesUpdated > 0;
        }
      } else {
        fresh ??= await buildSalesBudgetExport(input.companyId, base);
        budget = { sections: fresh, edits: [] };
      }

      if (view && sheet && input.changes.length > 0) {
        applyQtyChanges(
          budget,
          { sheet, entity: view.entity, vat: view.vat },
          input.changes,
          { savedAt: now.toISOString(), savedBy: input.userLabel },
        );
        changed = true;
      }

      // Nothing changed in the budget: keep the snapshot as it is, only record the save.
      const stamp = { lastUpdatedAt: now, lastSavedById: input.userId };
      const saved = await tx.salesBudgetSnapshot.upsert({
        where,
        create: {
          companyId: input.companyId,
          targetMonth: input.targetMonth,
          snapshot: toSnapshot(budget),
          ...stamp,
        },
        update: changed ? { snapshot: toSnapshot(budget), ...stamp } : stamp,
        select: { targetMonth: true, lastUpdatedAt: true },
      });
      return {
        targetMonth: saved.targetMonth,
        lastUpdatedAt: saved.lastUpdatedAt.toISOString(),
        created: !record,
        addedItems,
        pricesUpdated,
      };
    },
    // Building / editing the budget takes a while; a queued save waits its turn.
    { maxWait: 120_000, timeout: 240_000 },
  );
}

export type SalesBudgetFileInfo = SalesBudgetPageData["budgetFile"];

export async function getSalesBudgetFileInfo(
  companyId: string,
  targetMonth: string,
): Promise<SalesBudgetFileInfo> {
  const record = await prisma.salesBudgetSnapshot.findUnique({
    where: { companyId_targetMonth: { companyId, targetMonth } },
    select: {
      lastUpdatedAt: true,
      lastSavedBy: { select: { knownName: true, name: true, email: true } },
    },
  });
  const by = record?.lastSavedBy;
  return {
    targetMonth,
    lastUpdatedAt: record?.lastUpdatedAt.toISOString() ?? null,
    lastSavedBy: by ? (by.knownName ?? by.name ?? by.email ?? null) : null,
    blockedReason: budgetSaveBlockedReason(targetMonth),
  };
}

/** Read snapshots, by company + month; replaced when the record's lastUpdatedAt changes. */
const snapshotCache = new Map<string, { lastUpdatedAt: number; budget: ParsedBudget }>();
const SNAPSHOT_CACHE_MAX = 6;

/**
 * The month's saved budget (null when nothing is saved). The JSON is loaded only when the
 * record's lastUpdatedAt changed, so filters / pages / views reuse it. Read-only: callers must
 * not change it.
 */
export async function getParsedSavedBudget(
  companyId: string,
  targetMonth: string,
): Promise<{ lastUpdatedAt: Date; budget: ParsedBudget } | null> {
  const where = { companyId_targetMonth: { companyId, targetMonth } };
  const record = await prisma.salesBudgetSnapshot.findUnique({
    where,
    select: { lastUpdatedAt: true },
  });
  if (!record) return null;
  const key = `${companyId}|${targetMonth}`;
  const cached = snapshotCache.get(key);
  if (cached?.lastUpdatedAt === record.lastUpdatedAt.getTime()) {
    return { lastUpdatedAt: record.lastUpdatedAt, budget: cached.budget };
  }
  const full = await prisma.salesBudgetSnapshot.findUnique({
    where,
    select: { lastUpdatedAt: true, snapshot: true },
  });
  if (!full) return null;
  const budget = fromSnapshot(full.snapshot);
  snapshotCache.delete(key);
  snapshotCache.set(key, { lastUpdatedAt: full.lastUpdatedAt.getTime(), budget });
  // Oldest first (insertion order).
  while (snapshotCache.size > SNAPSHOT_CACHE_MAX) {
    snapshotCache.delete(snapshotCache.keys().next().value!);
  }
  return { lastUpdatedAt: full.lastUpdatedAt, budget };
}

/**
 * Download: the month's Excel (Export layout: SUMMARY, ONLINE, SHOP-SHOP, SHOP-ONLINE) built
 * from the saved snapshot only. Null when nothing is saved.
 */
export async function buildSavedBudgetWorkbook(
  companyId: string,
  targetMonth: string,
): Promise<{ buffer: Buffer; lastUpdatedAt: Date } | null> {
  const saved = await getParsedSavedBudget(companyId, targetMonth);
  if (!saved) return null;
  return {
    buffer: writeSalesBudgetWorkbook(saved.budget.sections),
    lastUpdatedAt: saved.lastUpdatedAt,
  };
}

/** Edited cells of the month's saved budget. */
export async function getSavedBudgetEdits(
  companyId: string,
  targetMonth: string,
): Promise<SavedBudgetEdit[]> {
  return (await getParsedSavedBudget(companyId, targetMonth))?.budget.edits ?? [];
}
