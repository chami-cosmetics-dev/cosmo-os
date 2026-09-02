import "server-only";

import { aggregateSalesBySkuInRange } from "@/lib/osf/assist-sales";
import { prisma } from "@/lib/prisma";

import {
  percentChange,
  resolveEffectivePriority,
  speedPerDay,
} from "@/lib/item-trends/aggregate";
import { isSlowdown } from "@/lib/item-trends/signals";
import type { ItemMovementRow, ItemTrendDateRange } from "@/lib/item-trends/types";

export async function fetchSlowdownAlerts(
  companyId: string,
  current: ItemTrendDateRange,
  prior: ItemTrendDateRange,
  limit = 50,
): Promise<ItemMovementRow[]> {
  const [currentSales, priorSales, items] = await Promise.all([
    aggregateSalesBySkuInRange(companyId, current.rangeStart, current.rangeEndExclusive),
    aggregateSalesBySkuInRange(companyId, prior.rangeStart, prior.rangeEndExclusive),
    prisma.productItem.findMany({
      where: { companyId, sku: { not: null }, status: { not: "archived" } },
      select: {
        sku: true,
        productTitle: true,
        erp1ProductPriority: true,
        erp2ProductPriority: true,
      },
    }),
  ]);

  const rows: ItemMovementRow[] = [];
  for (const item of items) {
    const sku = item.sku?.trim();
    if (!sku) continue;
    const priority = resolveEffectivePriority(item.erp1ProductPriority, item.erp2ProductPriority);
    if (priority !== "Top Priority") continue;

    const unitsCurrent = currentSales.get(sku) ?? 0;
    const unitsPrior = priorSales.get(sku) ?? 0;
    if (!isSlowdown(unitsCurrent, unitsPrior)) continue;

    rows.push({
      sku,
      title: item.productTitle,
      priority,
      unitsCurrent,
      unitsPrior,
      speedPerDay: speedPerDay(unitsCurrent, current.fromYmd, current.toYmd),
      speedChangePct: percentChange(unitsCurrent, unitsPrior),
      signal: "slowdown",
      signalSource: "rule_based",
      sparkline: [],
    });
  }

  rows.sort((a, b) => (a.speedChangePct ?? 0) - (b.speedChangePct ?? 0));
  return rows.slice(0, limit);
}
