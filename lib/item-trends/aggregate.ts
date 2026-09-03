import "server-only";

import { addUtcDays, colomboDayStartUtc, parseIsoDate } from "@/lib/osf/assist-window";
import { aggregateSalesBySkuInRange, osfCompletedSalesOrderWhere } from "@/lib/osf/assist-sales";
import { matchesPriorityFilter } from "@/lib/osf/assist-window";
import { formatAppIsoDate, parseAppCalendarDayEnd, parseAppCalendarDayStart } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";

import {
  classifyMovementSignal,
  classifyNewItemSignal,
  rankPriority,
} from "@/lib/item-trends/signals";
import { fetchSlowdownAlerts } from "@/lib/item-trends/slowdown";
import type {
  ItemMovementRow,
  ItemTrendDateRange,
  ItemTrendKpiSummary,
  MovementLeaderboardFilters,
} from "@/lib/item-trends/types";

export function resolveItemTrendWindows(input: {
  fromYmd: string;
  toYmd: string;
  compareFromYmd?: string | null;
  compareToYmd?: string | null;
}): {
  current: ItemTrendDateRange;
  prior: ItemTrendDateRange;
} {
  const fromYmd = input.fromYmd.trim();
  const toYmd = input.toYmd.trim();
  const rangeStart = parseAppCalendarDayStart(fromYmd);
  const rangeEndExclusive = parseAppCalendarDayEnd(toYmd);
  if (!rangeStart || !rangeEndExclusive) {
    throw new Error("Invalid date range");
  }
  const endExclusive = new Date(rangeEndExclusive.getTime() + 1);

  const current: ItemTrendDateRange = { fromYmd, toYmd, rangeStart, rangeEndExclusive: endExclusive };

  let priorFrom = input.compareFromYmd?.trim();
  let priorTo = input.compareToYmd?.trim();
  if (!priorFrom || !priorTo) {
    const days = calendarDaysInclusive(fromYmd, toYmd);
    priorTo = addUtcDays(fromYmd, -1);
    priorFrom = addUtcDays(fromYmd, -days);
  }

  const priorStart = parseAppCalendarDayStart(priorFrom);
  const priorEnd = parseAppCalendarDayEnd(priorTo);
  if (!priorStart || !priorEnd) {
    throw new Error("Invalid comparison date range");
  }

  const prior: ItemTrendDateRange = {
    fromYmd: priorFrom,
    toYmd: priorTo,
    rangeStart: priorStart,
    rangeEndExclusive: new Date(priorEnd.getTime() + 1),
  };

  return { current, prior };
}

export function calendarDaysInclusive(fromYmd: string, toYmd: string): number {
  const from = parseIsoDate(fromYmd);
  const to = parseIsoDate(toYmd);
  if (!from || !to) return 1;
  const start = colomboDayStartUtc(from).getTime();
  const end = colomboDayStartUtc(to).getTime();
  const diff = Math.floor((end - start) / 86_400_000) + 1;
  return Math.max(1, diff);
}

export function speedPerDay(units: number, fromYmd: string, toYmd: string): number {
  const days = calendarDaysInclusive(fromYmd, toYmd);
  return units / days;
}

export function percentChange(current: number, prior: number): number | null {
  if (prior <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

export function resolveEffectivePriority(
  erp1: string | null | undefined,
  erp2: string | null | undefined,
): string {
  const p1 = (erp1 ?? "").trim();
  if (p1) return p1;
  return (erp2 ?? "").trim() || "Non Priority";
}

export async function aggregateSparklinesBySku(
  companyId: string,
  start: Date,
  endExclusive: Date,
  skuFilter?: string[],
): Promise<Map<string, number[]>> {
  const skuList = skuFilter?.map((s) => s.trim()).filter(Boolean);
  const lines = await prisma.orderLineItem.findMany({
    where: {
      order: {
        companyId,
        cancelledAt: null,
        fulfillmentStage: { in: ["delivery_complete", "invoice_complete"] },
        OR: [
          { deliveryCompleteAt: { gte: start, lt: endExclusive } },
          {
            AND: [
              { deliveryCompleteAt: null },
              { invoiceCompleteAt: { gte: start, lt: endExclusive } },
            ],
          },
        ],
      },
      ...(skuList?.length ? { productItem: { sku: { in: skuList } } } : {}),
    },
    select: {
      quantity: true,
      productItem: { select: { sku: true } },
      order: {
        select: {
          deliveryCompleteAt: true,
          invoiceCompleteAt: true,
        },
      },
    },
  });

  const bucketKeys: string[] = [];
  const bucketSet = new Set<string>();
  for (const line of lines) {
    const at = line.order.deliveryCompleteAt ?? line.order.invoiceCompleteAt;
    if (!at || at < start || at >= endExclusive) continue;
    const day = formatAppIsoDate(at);
    if (!bucketSet.has(day)) {
      bucketSet.add(day);
      bucketKeys.push(day);
    }
  }
  bucketKeys.sort();

  const result = new Map<string, number[]>();
  for (const line of lines) {
    const sku = line.productItem.sku?.trim();
    if (!sku) continue;
    const at = line.order.deliveryCompleteAt ?? line.order.invoiceCompleteAt;
    if (!at || at < start || at >= endExclusive) continue;
    const day = formatAppIsoDate(at);
    const idx = bucketKeys.indexOf(day);
    if (idx < 0) continue;
    let arr = result.get(sku);
    if (!arr) {
      arr = new Array(bucketKeys.length).fill(0);
      result.set(sku, arr);
    }
    arr[idx] += line.quantity;
  }
  return result;
}

export async function aggregateSalesBySkuInRangeForLocation(
  companyId: string,
  start: Date,
  endExclusive: Date,
  companyLocationId: string,
  skuFilter?: string[],
): Promise<Map<string, number>> {
  const skuList = skuFilter?.map((s) => s.trim()).filter(Boolean);
  const lines = await prisma.orderLineItem.findMany({
    where: {
      order: {
        ...osfCompletedSalesOrderWhere(companyId, start, endExclusive),
        companyLocationId,
      },
      ...(skuList?.length ? { productItem: { sku: { in: skuList } } } : {}),
    },
    select: {
      quantity: true,
      productItem: { select: { sku: true } },
      order: {
        select: {
          deliveryCompleteAt: true,
          invoiceCompleteAt: true,
        },
      },
    },
  });

  const map = new Map<string, number>();
  for (const line of lines) {
    const sku = line.productItem.sku?.trim();
    if (!sku) continue;
    const at = line.order.deliveryCompleteAt ?? line.order.invoiceCompleteAt;
    if (!at) continue;
    if (at < start || at >= endExclusive) continue;
    map.set(sku, (map.get(sku) ?? 0) + line.quantity);
  }
  return map;
}

export async function filterSkusByPriority(
  companyId: string,
  skus: string[],
  priority?: string | null,
): Promise<string[]> {
  const filter = (priority ?? "").trim();
  if (!filter || filter.toLowerCase() === "all" || skus.length === 0) return skus;
  const items = await prisma.productItem.findMany({
    where: { companyId, sku: { in: skus } },
    select: {
      sku: true,
      erp1ProductPriority: true,
      erp2ProductPriority: true,
    },
  });
  const keep = new Set<string>();
  for (const item of items) {
    const sku = item.sku?.trim();
    if (!sku) continue;
    if (matchesPriorityFilter(item.erp1ProductPriority, item.erp2ProductPriority, filter)) {
      keep.add(sku);
    }
  }
  return skus.filter((sku) => keep.has(sku));
}

export async function fetchMovementLeaderboard(
  companyId: string,
  current: ItemTrendDateRange,
  prior: ItemTrendDateRange,
  filters: MovementLeaderboardFilters = {},
): Promise<ItemMovementRow[]> {
  const priorityFilter = filters.priority?.trim() || "Top Priority";
  const locationId = filters.companyLocationId?.trim();

  const salesFn = locationId
    ? (cid: string, start: Date, end: Date) =>
        aggregateSalesBySkuInRangeForLocation(cid, start, end, locationId)
    : aggregateSalesBySkuInRange;

  const [currentSales, priorSales, items] = await Promise.all([
    salesFn(companyId, current.rangeStart, current.rangeEndExclusive),
    salesFn(companyId, prior.rangeStart, prior.rangeEndExclusive),
    prisma.productItem.findMany({
      where: {
        companyId,
        sku: { not: null },
        status: { not: "archived" },
      },
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
    const unitsCurrent = currentSales.get(sku) ?? 0;
    const unitsPrior = priorSales.get(sku) ?? 0;

    const priority = resolveEffectivePriority(item.erp1ProductPriority, item.erp2ProductPriority);
    if (!matchesPriorityFilter(item.erp1ProductPriority, item.erp2ProductPriority, priorityFilter)) {
      continue;
    }

    const spd = speedPerDay(unitsCurrent, current.fromYmd, current.toYmd);
    const signal = classifyMovementSignal(unitsCurrent, unitsPrior, priority);

    rows.push({
      sku,
      title: item.productTitle,
      priority,
      unitsCurrent,
      unitsPrior,
      speedPerDay: Math.round(spd * 100) / 100,
      speedChangePct: percentChange(unitsCurrent, unitsPrior),
      signal,
      signalSource: "rule_based",
      sparkline: [],
    });
  }

  rows.sort((a, b) => {
    const pr = rankPriority(a.priority) - rankPriority(b.priority);
    if (pr !== 0 && priorityFilter === "Top Priority") return pr;
    if (b.speedPerDay !== a.speedPerDay) return b.speedPerDay - a.speedPerDay;
    return a.sku.localeCompare(b.sku);
  });

  const sparklineSkus = rows
    .filter((row) => row.unitsCurrent > 0 || row.unitsPrior > 0)
    .slice(0, 100)
    .map((row) => row.sku);
  if (sparklineSkus.length > 0) {
    const sparklines = await aggregateSparklinesBySku(
      companyId,
      current.rangeStart,
      current.rangeEndExclusive,
      sparklineSkus,
    );
    for (const row of rows) {
      row.sparkline = sparklines.get(row.sku) ?? [];
    }
  }

  return rows;
}

export async function fetchNewItemRows(
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
    if (priority !== "Newly Added") continue;

    const unitsCurrent = currentSales.get(sku) ?? 0;
    const unitsPrior = priorSales.get(sku) ?? 0;
    const signal = classifyNewItemSignal(unitsCurrent, unitsPrior);

    rows.push({
      sku,
      title: item.productTitle,
      priority,
      unitsCurrent,
      unitsPrior,
      speedPerDay: speedPerDay(unitsCurrent, current.fromYmd, current.toYmd),
      speedChangePct: percentChange(unitsCurrent, unitsPrior),
      signal,
      signalSource: "rule_based",
      sparkline: [],
    });
  }

  rows.sort((a, b) => b.unitsCurrent - a.unitsCurrent);
  return rows;
}

export async function fetchSkuWeekdayBuckets(
  companyId: string,
  range: ItemTrendDateRange,
): Promise<Map<string, number[]>> {
  const lines = await prisma.orderLineItem.findMany({
    where: {
      order: osfCompletedSalesOrderWhere(companyId, range.rangeStart, range.rangeEndExclusive),
    },
    select: {
      quantity: true,
      productItem: { select: { sku: true } },
      order: {
        select: {
          deliveryCompleteAt: true,
          invoiceCompleteAt: true,
        },
      },
    },
  });

  const map = new Map<string, number[]>();
  for (const line of lines) {
    const sku = line.productItem.sku?.trim();
    if (!sku) continue;
    const at = line.order.deliveryCompleteAt ?? line.order.invoiceCompleteAt;
    if (!at || at < range.rangeStart || at >= range.rangeEndExclusive) continue;
    const day = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Colombo",
      weekday: "short",
    }).format(at);
    const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
    if (dayIndex < 0) continue;
    let buckets = map.get(sku);
    if (!buckets) {
      buckets = [0, 0, 0, 0, 0, 0, 0];
      map.set(sku, buckets);
    }
    buckets[dayIndex] += line.quantity;
  }
  return map;
}

export async function fetchSlowdownRows(
  companyId: string,
  current: ItemTrendDateRange,
  prior: ItemTrendDateRange,
  limit = 50,
): Promise<ItemMovementRow[]> {
  return fetchSlowdownAlerts(companyId, current, prior, limit);
}

export function buildKpiSummary(input: {
  movement: ItemMovementRow[];
  newItems: ItemMovementRow[];
  slowdowns: ItemMovementRow[];
  topDistrict?: string | null;
  patternHitCount?: number;
}): ItemTrendKpiSummary {
  const fastMoverCount = input.movement.filter((r) => r.signal === "fast_mover").length;
  const newItemSignalCount = input.newItems.filter(
    (r) => r.signal === "accelerating" || r.signal === "stalling",
  ).length;
  const totalUnitsTracked = input.movement.reduce((s, r) => s + r.unitsCurrent, 0);

  return {
    fastMoverCount,
    newItemSignalCount,
    slowdownCount: input.slowdowns.length,
    patternHitCount: input.patternHitCount ?? 0,
    topDistrict: input.topDistrict ?? null,
    totalUnitsTracked,
  };
}
