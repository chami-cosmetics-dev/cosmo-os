import "server-only";

import { inferDistrictFromAddressText, resolveAddressDistrict } from "@/lib/address-district";
import { osfCompletedSalesOrderWhere } from "@/lib/osf/assist-sales";
import { matchesPriorityFilter } from "@/lib/osf/assist-window";
import { prisma } from "@/lib/prisma";

import {
  percentChange,
  resolveEffectivePriority,
  speedPerDay,
} from "@/lib/item-trends/aggregate";
import {
  isPhysicalShopLocation,
  loadPhysicalShops,
  nearestPhysicalShopName,
  shopDistrictForLocation,
  type PhysicalShopMeta,
} from "@/lib/item-trends/physical-shops";
import { classifyMovementSignal } from "@/lib/item-trends/signals";
import type {
  DistrictDemandRow,
  ExpansionOpportunityRow,
  GrowthStatus,
  ItemMovementRow,
  ItemTrendDateRange,
} from "@/lib/item-trends/types";

export const UNMAPPED_DISTRICT = "Unmapped";

type DistrictTotals = {
  units: number;
  amount: number;
};

type DistrictSkuTotals = {
  units: number;
  amount: number;
};

type ParsedLine = {
  district: string;
  sku: string;
  quantity: number;
  amount: number;
  shopDistrict: string | null;
};

type LocationMeta = {
  id: string;
  name: string;
  district: string | null;
};

export function rollupDistrictTotals(
  rows: Array<{ district: string; quantity: number; amount: number }>,
): Map<string, DistrictTotals> {
  const map = new Map<string, DistrictTotals>();
  for (const row of rows) {
    const district = row.district.trim() || UNMAPPED_DISTRICT;
    const prev = map.get(district) ?? { units: 0, amount: 0 };
    map.set(district, {
      units: prev.units + row.quantity,
      amount: prev.amount + row.amount,
    });
  }
  return map;
}

export function classifyDistrictGrowthStatus(
  unitsCurrent: number,
  unitsPrior: number,
  changePct: number | null,
): GrowthStatus {
  if (unitsPrior < 5 && unitsCurrent >= 5) return "emerging";
  if (changePct == null) return unitsCurrent > 0 ? "stable" : "stable";
  if (changePct >= 10) return "growing";
  if (changePct <= -10) return "declining";
  return "stable";
}

function formatAmount(value: number): string {
  return value.toFixed(2);
}

async function loadLocationMeta(companyId: string): Promise<Map<string, LocationMeta>> {
  const locations = await prisma.companyLocation.findMany({
    where: { companyId },
    select: { id: true, name: true, address: true },
  });

  const map = new Map<string, LocationMeta>();
  for (const loc of locations) {
    const district = inferDistrictFromAddressText(loc.address);
    map.set(loc.id, { id: loc.id, name: loc.name, district });
  }
  return map;
}

async function fetchParsedLines(
  companyId: string,
  range: ItemTrendDateRange,
  locationMeta: Map<string, LocationMeta>,
  physicalShops: PhysicalShopMeta[],
  priority?: string | null,
): Promise<ParsedLine[]> {
  const lines = await prisma.orderLineItem.findMany({
    where: {
      order: osfCompletedSalesOrderWhere(companyId, range.rangeStart, range.rangeEndExclusive),
    },
    select: {
      quantity: true,
      price: true,
      productItem: {
        select: {
          sku: true,
          erp1ProductPriority: true,
          erp2ProductPriority: true,
        },
      },
      order: {
        select: {
          shippingAddress: true,
          companyLocationId: true,
          deliveryCompleteAt: true,
          invoiceCompleteAt: true,
        },
      },
    },
  });

  const parsed: ParsedLine[] = [];
  for (const line of lines) {
    const sku = line.productItem.sku?.trim();
    if (!sku) continue;
    if (
      !matchesPriorityFilter(
        line.productItem.erp1ProductPriority,
        line.productItem.erp2ProductPriority,
        priority,
      )
    ) {
      continue;
    }
    const at = line.order.deliveryCompleteAt ?? line.order.invoiceCompleteAt;
    if (!at || at < range.rangeStart || at >= range.rangeEndExclusive) continue;

    const district = resolveAddressDistrict(line.order.shippingAddress) || UNMAPPED_DISTRICT;
    const amount = line.quantity * Number(line.price);
    const locId = line.order.companyLocationId;
    const locationDistricts = new Map(
      [...locationMeta.entries()].map(([id, meta]) => [id, meta.district]),
    );
    const shopDistrict = isPhysicalShopLocation(locId, physicalShops)
      ? shopDistrictForLocation(locId, physicalShops, locationDistricts)
      : null;

    parsed.push({
      district,
      sku,
      quantity: line.quantity,
      amount,
      shopDistrict,
    });
  }
  return parsed;
}

function buildDistrictRows(
  currentTotals: Map<string, DistrictTotals>,
  priorTotals: Map<string, DistrictTotals>,
  sortBy: "units" | "amount" | "speed",
  fromYmd: string,
  toYmd: string,
): DistrictDemandRow[] {
  const allDistricts = new Set([...currentTotals.keys(), ...priorTotals.keys()]);
  const companyUnits = [...currentTotals.values()].reduce((s, v) => s + v.units, 0);

  const rows: DistrictDemandRow[] = [];
  for (const district of allDistricts) {
    const current = currentTotals.get(district) ?? { units: 0, amount: 0 };
    const prior = priorTotals.get(district) ?? { units: 0, amount: 0 };
    const changePct = percentChange(current.units, prior.units);
    const sharePct =
      companyUnits > 0 ? Math.round((current.units / companyUnits) * 1000) / 10 : 0;

    rows.push({
      district,
      units: current.units,
      amount: formatAmount(current.amount),
      sharePct,
      changePct,
      growthStatus: classifyDistrictGrowthStatus(current.units, prior.units, changePct),
    });
  }

  rows.sort((a, b) => {
    if (a.district === UNMAPPED_DISTRICT) return 1;
    if (b.district === UNMAPPED_DISTRICT) return -1;
    if (sortBy === "amount") {
      return Number(b.amount) - Number(a.amount);
    }
    if (sortBy === "speed") {
      const speedA = speedPerDay(a.units, fromYmd, toYmd);
      const speedB = speedPerDay(b.units, fromYmd, toYmd);
      return speedB - speedA;
    }
    return b.units - a.units;
  });

  return rows;
}

export async function fetchDistrictLeaderboard(
  companyId: string,
  current: ItemTrendDateRange,
  prior: ItemTrendDateRange,
  sortBy: "units" | "amount" | "speed" = "units",
  priority?: string | null,
): Promise<DistrictDemandRow[]> {
  const [locationMeta, physicalShops] = await Promise.all([
    loadLocationMeta(companyId),
    loadPhysicalShops(companyId),
  ]);
  const [currentLines, priorLines] = await Promise.all([
    fetchParsedLines(companyId, current, locationMeta, physicalShops, priority),
    fetchParsedLines(companyId, prior, locationMeta, physicalShops, priority),
  ]);

  const currentTotals = rollupDistrictTotals(currentLines);
  const priorTotals = rollupDistrictTotals(priorLines);

  return buildDistrictRows(currentTotals, priorTotals, sortBy, current.fromYmd, current.toYmd);
}

export async function fetchDistrictItems(
  companyId: string,
  district: string,
  current: ItemTrendDateRange,
  prior: ItemTrendDateRange,
  limit = 50,
  priority?: string | null,
): Promise<ItemMovementRow[]> {
  const [locationMeta, physicalShops] = await Promise.all([
    loadLocationMeta(companyId),
    loadPhysicalShops(companyId),
  ]);
  const [currentLines, priorLines] = await Promise.all([
    fetchParsedLines(companyId, current, locationMeta, physicalShops, priority),
    fetchParsedLines(companyId, prior, locationMeta, physicalShops, priority),
  ]);

  const target = district.trim();
  const currentBySku = new Map<string, DistrictSkuTotals>();
  const priorBySku = new Map<string, number>();

  for (const line of currentLines) {
    if (line.district !== target) continue;
    const prev = currentBySku.get(line.sku) ?? { units: 0, amount: 0 };
    currentBySku.set(line.sku, {
      units: prev.units + line.quantity,
      amount: prev.amount + line.amount,
    });
  }
  for (const line of priorLines) {
    if (line.district !== target) continue;
    priorBySku.set(line.sku, (priorBySku.get(line.sku) ?? 0) + line.quantity);
  }

  const skus = [...currentBySku.keys()];
  if (skus.length === 0) return [];

  const items = await prisma.productItem.findMany({
    where: { companyId, sku: { in: skus }, status: { not: "archived" } },
    select: {
      sku: true,
      productTitle: true,
      erp1ProductPriority: true,
      erp2ProductPriority: true,
    },
  });

  const rows: ItemMovementRow[] = [];
  for (const item of items) {
    const sku = item.sku?.trim();
    if (!sku) continue;
    const totals = currentBySku.get(sku);
    if (!totals) continue;
    const unitsCurrent = totals.units;
    const unitsPrior = priorBySku.get(sku) ?? 0;
    const priority = resolveEffectivePriority(item.erp1ProductPriority, item.erp2ProductPriority);

    rows.push({
      sku,
      title: item.productTitle,
      priority,
      unitsCurrent,
      unitsPrior,
      speedPerDay: speedPerDay(unitsCurrent, current.fromYmd, current.toYmd),
      speedChangePct: percentChange(unitsCurrent, unitsPrior),
      signal: classifyMovementSignal(unitsCurrent, unitsPrior, priority),
      signalSource: "rule_based",
      sparkline: [],
    });
  }

  rows.sort((a, b) => b.unitsCurrent - a.unitsCurrent);
  return rows.slice(0, limit);
}

function shopUnitsByDistrict(lines: ParsedLine[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    if (!line.shopDistrict) continue;
    map.set(line.shopDistrict, (map.get(line.shopDistrict) ?? 0) + line.quantity);
  }
  return map;
}

function topSkusByDistrict(lines: ParsedLine[], district: string, limit = 5): string[] {
  const bySku = new Map<string, number>();
  for (const line of lines) {
    if (line.district !== district) continue;
    bySku.set(line.sku, (bySku.get(line.sku) ?? 0) + line.quantity);
  }
  return [...bySku.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([sku]) => sku);
}

function countFastMoversInDistrict(
  lines: ParsedLine[],
  district: string,
  skuPriorUnits: Map<string, number>,
): number {
  const bySku = new Map<string, number>();
  for (const line of lines) {
    if (line.district !== district) continue;
    bySku.set(line.sku, (bySku.get(line.sku) ?? 0) + line.quantity);
  }
  let count = 0;
  for (const [sku, units] of bySku) {
    if (classifyMovementSignal(units, skuPriorUnits.get(sku) ?? 0, "Top Priority") === "fast_mover") {
      count += 1;
    }
  }
  return count;
}

function nearestStoreName(district: string, physicalShops: PhysicalShopMeta[]): string | null {
  return nearestPhysicalShopName(district, physicalShops);
}

export function computeExpansionScore(input: {
  deliveryUnits: number;
  shopUnits: number;
  growthPct: number | null;
  maxDeliveryUnits: number;
}): number {
  if (input.deliveryUnits <= 0) return 0;
  const normalizedDelivery =
    input.maxDeliveryUnits > 0 ? input.deliveryUnits / input.maxDeliveryUnits : 0;
  const coverageGap = 1 - Math.min(1, input.shopUnits / input.deliveryUnits);
  const growthFactor = input.growthPct != null && input.growthPct > 0 ? 1 + input.growthPct / 100 : 1;
  return Math.round(Math.min(100, normalizedDelivery * growthFactor * coverageGap * 100));
}

export async function fetchExpansionOpportunities(
  companyId: string,
  current: ItemTrendDateRange,
  prior: ItemTrendDateRange,
  leaderboard: DistrictDemandRow[],
  priority?: string | null,
): Promise<ExpansionOpportunityRow[]> {
  const [locationMeta, physicalShops] = await Promise.all([
    loadLocationMeta(companyId),
    loadPhysicalShops(companyId),
  ]);
  const [currentLines, priorLines] = await Promise.all([
    fetchParsedLines(companyId, current, locationMeta, physicalShops, priority),
    fetchParsedLines(companyId, prior, locationMeta, physicalShops, priority),
  ]);

  const shopUnits = shopUnitsByDistrict(currentLines);
  const priorByDistrict = rollupDistrictTotals(priorLines);

  const skuPriorByDistrict = (district: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (const line of priorLines) {
      if (line.district !== district) continue;
      map.set(line.sku, (map.get(line.sku) ?? 0) + line.quantity);
    }
    return map;
  };

  const maxDelivery = Math.max(
    ...leaderboard.filter((r) => r.district !== UNMAPPED_DISTRICT).map((r) => r.units),
    1,
  );

  const rows: ExpansionOpportunityRow[] = [];
  for (const row of leaderboard) {
    if (row.district === UNMAPPED_DISTRICT) continue;
    const deliveryUnits = row.units;
    const shop = shopUnits.get(row.district) ?? 0;
    const priorUnits = priorByDistrict.get(row.district)?.units ?? 0;
    const growthPct = percentChange(deliveryUnits, priorUnits);
    const score = computeExpansionScore({
      deliveryUnits,
      shopUnits: shop,
      growthPct,
      maxDeliveryUnits: maxDelivery,
    });
    if (score < 5 && deliveryUnits < 10) continue;

    const reasons: string[] = [];
    if (deliveryUnits >= 20) reasons.push("High delivery demand");
    if (shop < deliveryUnits * 0.3) reasons.push("Low shop coverage");
    if (growthPct != null && growthPct >= 10) reasons.push(`${growthPct}% growth vs prior period`);
    const fastCount = countFastMoversInDistrict(
      currentLines,
      row.district,
      skuPriorByDistrict(row.district),
    );
    if (fastCount > 0) {
      reasons.push(`${fastCount} Top Priority fast mover${fastCount > 1 ? "s" : ""}`);
    }
    if (reasons.length === 0) reasons.push("Delivery demand exceeds local shop sales");

    rows.push({
      district: row.district,
      score,
      deliveryUnits,
      shopUnits: shop,
      growthPct,
      topSkus: topSkusByDistrict(currentLines, row.district),
      nearestStore: nearestStoreName(row.district, physicalShops),
      reasons,
    });
  }

  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, 20);
}

export async function fetchAreaGrowthStatus(
  companyId: string,
  current: ItemTrendDateRange,
  prior: ItemTrendDateRange,
  priority?: string | null,
): Promise<DistrictDemandRow[]> {
  return fetchDistrictLeaderboard(companyId, current, prior, "units", priority);
}
