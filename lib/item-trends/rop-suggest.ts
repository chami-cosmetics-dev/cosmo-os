import "server-only";

import { roundHalfUp } from "@/lib/osf/assist-window";
import { aggregateSalesBySkuInRange } from "@/lib/osf/assist-sales";
import { resolveOsfColumns } from "@/lib/osf/column-config";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";

import { resolveEffectivePriority } from "@/lib/item-trends/aggregate";
import { classifyRopOverlay } from "@/lib/item-trends/signals";
import type { ItemTrendDateRange, RopSuggestionRow } from "@/lib/item-trends/types";

export type RopWindowPreset = "3m" | "2m" | "custom";

export function resolveRopSalesWindow(input: {
  preset: RopWindowPreset;
  ropFrom?: string | null;
  ropTo?: string | null;
  asOf?: Date;
}): { windowLabel: string; rangeStart: Date; rangeEndExclusive: Date; fromYmd: string; toYmd: string } {
  const asOf = input.asOf ?? new Date();
  const toYmd = formatAppIsoDate(asOf);

  if (input.preset === "custom") {
    const fromYmd = (input.ropFrom ?? "").trim();
    const toYmdCustom = (input.ropTo ?? toYmd).trim();
    if (!fromYmd || !toYmdCustom) {
      throw new Error("ropFrom and ropTo required for custom ROP window");
    }
    const start = new Date(`${fromYmd}T00:00:00+05:30`);
    const end = new Date(`${toYmdCustom}T23:59:59.999+05:30`);
    return {
      windowLabel: `${fromYmd} – ${toYmdCustom}`,
      rangeStart: start,
      rangeEndExclusive: new Date(end.getTime() + 1),
      fromYmd,
      toYmd: toYmdCustom,
    };
  }

  const months = input.preset === "2m" ? 2 : 3;
  const fromDate = new Date(asOf);
  fromDate.setMonth(fromDate.getMonth() - months);
  fromDate.setDate(1);
  const fromYmd = formatAppIsoDate(fromDate);
  const start = new Date(`${fromYmd}T00:00:00+05:30`);
  const end = new Date(`${toYmd}T23:59:59.999+05:30`);

  return {
    windowLabel: input.preset === "2m" ? "Last 2 calendar months" : "Last 3 calendar months",
    rangeStart: start,
    rangeEndExclusive: new Date(end.getTime() + 1),
    fromYmd,
    toYmd,
  };
}

export async function computeRopSuggestions(input: {
  companyId: string;
  ropWindow: RopWindowPreset;
  ropFrom?: string | null;
  ropTo?: string | null;
  movementRange: ItemTrendDateRange;
  priorRange: ItemTrendDateRange;
  priority?: string | null;
  offset?: number;
  limit?: number;
}): Promise<{ rows: RopSuggestionRow[]; total: number; windowLabel: string }> {
  const ropRange = resolveRopSalesWindow({
    preset: input.ropWindow,
    ropFrom: input.ropFrom,
    ropTo: input.ropTo,
  });

  const columns = await resolveOsfColumns(input.companyId);
  const primaryRopCol = columns.find((c) => c.active && c.includeInRop);
  const columnKey = primaryRopCol?.key ?? "common_rop";

  const [windowSalesMap, movementSales, priorSales, items, ropRows] = await Promise.all([
    aggregateSalesBySkuInRange(input.companyId, ropRange.rangeStart, ropRange.rangeEndExclusive),
    aggregateSalesBySkuInRange(
      input.companyId,
      input.movementRange.rangeStart,
      input.movementRange.rangeEndExclusive,
    ),
    aggregateSalesBySkuInRange(
      input.companyId,
      input.priorRange.rangeStart,
      input.priorRange.rangeEndExclusive,
    ),
    prisma.productItem.findMany({
      where: { companyId: input.companyId, sku: { not: null }, status: { not: "archived" } },
      select: {
        sku: true,
        erp1ProductPriority: true,
        erp2ProductPriority: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.productOsfRop.findMany({ where: { companyId: input.companyId } }),
  ]);

  const ropBySku = new Map<string, number>();
  for (const row of ropRows) {
    if (row.columnKey === columnKey) ropBySku.set(row.sku, row.ropQty);
  }

  const priorityFilter = input.priority?.trim();
  const rows: RopSuggestionRow[] = [];

  for (const item of items) {
    const sku = item.sku?.trim();
    if (!sku) continue;
    const priority = resolveEffectivePriority(item.erp1ProductPriority, item.erp2ProductPriority);
    if (priorityFilter && priorityFilter !== "all" && priority !== priorityFilter) continue;

    const windowSales = windowSalesMap.get(sku) ?? 0;
    const suggestedRop = roundHalfUp(windowSales * 2);
    const currentRop = ropBySku.get(sku) ?? null;
    const unitsCurrent = movementSales.get(sku) ?? 0;
    const unitsPrior = priorSales.get(sku) ?? 0;

    rows.push({
      sku,
      priority,
      currentRop,
      windowSales,
      suggestedRop,
      overlay: classifyRopOverlay(unitsCurrent, unitsPrior, currentRop, suggestedRop),
      windowLabel: ropRange.windowLabel,
      columnKey,
    });
  }

  rows.sort((a, b) => b.windowSales - a.windowSales);
  const total = rows.length;
  const offset = input.offset ?? 0;
  const limit = Math.min(input.limit ?? 50, 100);

  return {
    rows: rows.slice(offset, offset + limit),
    total,
    windowLabel: ropRange.windowLabel,
  };
}

/** Placeholder for Phase 2 statistical signals. */
export function intelligentSignalsDisabled(): boolean {
  return true;
}
