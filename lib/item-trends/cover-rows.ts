import "server-only";

import { resolveOsfColumns, type OsfResolvedColumn } from "@/lib/osf/column-config";
import { getAllOsfErpInstances, stockForColumn } from "@/lib/osf/erp-stock";
import { resolveErpSlots } from "@/lib/product-items/erp-priority-sync";
import { prisma } from "@/lib/prisma";

import {
  calendarDaysInclusive,
  filterSkusByPriority,
  resolveEffectivePriority,
  resolveItemTrendWindows,
} from "@/lib/item-trends/aggregate";
import { loadSkuCatalog } from "@/lib/item-trends/catalog";
import { compareChannelKind, computeCoverMath, trailing30Window } from "@/lib/item-trends/cover";
import { displayWarehouseName } from "@/lib/item-trends/location-name";
import { salesByOsfColumnInRange } from "@/lib/item-trends/outlets";
import {
  coverLocationOwner,
  coverOutletDisplayName,
  compareCoverLocationGroup,
  isPhysicalShopOsfColumn,
  loadPhysicalShops,
  osfColumnChannelKind,
} from "@/lib/item-trends/physical-shops";
import { allowedInstanceIds, columnMatchesErpScope, type ErpStockScope } from "@/lib/item-trends/erp-scope";
import { ropMapKey } from "@/lib/item-trends/rop-resolve";
import { resolveCoverSkuFilter } from "@/lib/item-trends/sku-group";
import { loadLiveBinMapForColumns, loadSnapshotBinMap, resolveSnapshotMeta } from "@/lib/item-trends/stock-snapshot";
import type { CoverRow, ItemTrendDateRange, ItemTrendFilterLocation } from "@/lib/item-trends/types";

function stockColumns(all: OsfResolvedColumn[]) {
  return all
    .filter((c) => c.active && c.includeInStock)
    .sort(
      (a, b) =>
        compareChannelKind(osfColumnChannelKind(a), osfColumnChannelKind(b)) ||
        a.label.localeCompare(b.label),
    );
}

async function erpSlotIds(companyId: string) {
  const instances = await getAllOsfErpInstances(companyId);
  const slots = resolveErpSlots(instances);
  return { erp1: slots.erp1?.id ?? null, erp2: slots.erp2?.id ?? null };
}

export async function listItemTrendErpScopes(companyId: string): Promise<
  Array<{ value: ErpStockScope; label: string; instanceId: string | null }>
> {
  const instances = await getAllOsfErpInstances(companyId);
  const slots = resolveErpSlots(instances);
  const out: Array<{ value: ErpStockScope; label: string; instanceId: string | null }> = [
    { value: "both", label: "Both ERPs", instanceId: null },
  ];
  if (slots.erp1) {
    out.push({
      value: "erp1",
      label: slots.erp1.label?.trim() || "ERP1",
      instanceId: slots.erp1.id,
    });
  }
  if (slots.erp2) {
    out.push({
      value: "erp2",
      label: slots.erp2.label?.trim() || "ERP2",
      instanceId: slots.erp2.id,
    });
  }
  return out;
}

export async function listItemTrendFilterLocations(companyId: string): Promise<ItemTrendFilterLocation[]> {
  const columns = await resolveOsfColumns(companyId);
  return stockColumns(columns).map((col) => {
    const owner = coverLocationOwner(col);
    return {
      columnKey: col.key,
      label: coverOutletDisplayName(col, displayWarehouseName),
      channelKind: osfColumnChannelKind(col),
      erpnextInstanceId: col.erpnextInstanceId,
      locationGroup: owner.group,
    };
  });
}

export async function fetchCoverRows(input: {
  companyId: string;
  range: ItemTrendDateRange;
  columnKeys?: string[] | null;
  skuFilter?: string[];
  commonSkuKey?: string | null;
  snapshotDate?: string | null;
  stockSource?: "live" | "snapshot";
  priority?: string | null;
  brand?: string | null;
  oosOnly?: boolean;
  sendOnly?: boolean;
  erpScope?: ErpStockScope;
}): Promise<{
  stockSource: "live" | "snapshot";
  snapshotDate: string | null;
  capturedAt: string | null;
  usedFallback: boolean;
  daysInRange: number;
  trailing30From: string;
  trailing30To: string;
  rows: CoverRow[];
}> {
  const daysInRange = calendarDaysInclusive(input.range.fromYmd, input.range.toYmd);
  const stockSource: "live" | "snapshot" =
    input.stockSource === "snapshot" ? "snapshot" : "live";
  const trailYmd = trailing30Window();
  const trailing = resolveItemTrendWindows({ fromYmd: trailYmd.fromYmd, toYmd: trailYmd.toYmd }).current;

  const [allColumns, shops, catalog, slotIds] = await Promise.all([
    resolveOsfColumns(input.companyId),
    loadPhysicalShops(input.companyId),
    loadSkuCatalog(input.companyId),
    erpSlotIds(input.companyId),
  ]);

  const allowed = allowedInstanceIds(input.erpScope ?? "both", slotIds);
  const columns = stockColumns(allColumns).filter((col) =>
    columnMatchesErpScope(col.erpnextInstanceId, allowed),
  );
  const scoped =
    input.columnKeys?.length ? columns.filter((c) => input.columnKeys!.includes(c.key)) : columns;

  const empty = {
    stockSource,
    snapshotDate: null as string | null,
    capturedAt: null as string | null,
    usedFallback: false,
    daysInRange,
    trailing30From: trailYmd.fromYmd,
    trailing30To: trailYmd.toYmd,
    rows: [] as CoverRow[],
  };

  if (scoped.length === 0) {
    return empty;
  }

  let snapshotDate: string | null = null;
  let capturedAt: string | null = null;
  let usedFallback = false;
  let binMap = new Map<string, number>();
  let stockReady = false;

  if (stockSource === "live") {
    const fetchedAt = new Date();
    binMap = await loadLiveBinMapForColumns(input.companyId, scoped);
    capturedAt = fetchedAt.toISOString();
    stockReady = true;
  } else {
    const meta = await resolveSnapshotMeta(input.companyId, input.snapshotDate);
    snapshotDate = meta.snapshotDate;
    capturedAt = meta.capturedAt ? meta.capturedAt.toISOString() : null;
    usedFallback = meta.usedFallback;
    if (snapshotDate) {
      binMap = await loadSnapshotBinMap(input.companyId, snapshotDate);
      stockReady = true;
    }
  }

  const searchTerms = input.skuFilter?.map((s) => s.trim()).filter(Boolean) ?? [];
  const hasSkuConstraint = searchTerms.length > 0 || Boolean(input.commonSkuKey?.trim());
  const uniqueSkuFilter = resolveCoverSkuFilter({
    skuFilter: input.skuFilter,
    commonSkuKey: input.commonSkuKey,
    catalog: catalog.values(),
  });

  if (hasSkuConstraint && uniqueSkuFilter.length === 0) {
    return {
      stockSource,
      snapshotDate,
      capturedAt,
      usedFallback,
      daysInRange,
      trailing30From: trailYmd.fromYmd,
      trailing30To: trailYmd.toYmd,
      rows: [],
    };
  }

  const [salesMap, last30Map] = await Promise.all([
    salesByOsfColumnInRange(
      input.companyId,
      input.range,
      scoped,
      uniqueSkuFilter.length ? uniqueSkuFilter : undefined,
    ),
    salesByOsfColumnInRange(
      input.companyId,
      trailing,
      scoped,
      uniqueSkuFilter.length ? uniqueSkuFilter : undefined,
    ),
  ]);

  const binMapReady = stockReady;
  const soldSkus = uniqueSkuFilter.length ? uniqueSkuFilter : [...salesMap.keys()];
  const prioritySkus = uniqueSkuFilter.length
    ? soldSkus
    : await filterSkusByPriority(input.companyId, soldSkus, input.priority);

  const brand = input.brand?.trim().toLowerCase();

  const ropSkuSet = new Set<string>();
  for (const sku of prioritySkus) {
    ropSkuSet.add(sku);
    const entry = catalog.get(sku);
    if (entry?.commonSkuKey) ropSkuSet.add(entry.commonSkuKey);
  }
  const ropRows =
    ropSkuSet.size > 0
      ? await prisma.productOsfRop.findMany({
          where: { companyId: input.companyId, sku: { in: [...ropSkuSet] } },
          select: { sku: true, columnKey: true, ropQty: true },
        })
      : [];
  const ropBySkuColumn = new Map<string, number>();
  for (const row of ropRows) {
    ropBySkuColumn.set(ropMapKey(row.sku, row.columnKey), row.ropQty);
  }

  const rows: CoverRow[] = [];
  for (const sku of prioritySkus) {
    const entry = catalog.get(sku);
    if (brand && (entry?.brand ?? "").trim().toLowerCase() !== brand) continue;

    const colSales = salesMap.get(sku) ?? new Map();
    const colLast30 = last30Map.get(sku) ?? new Map();
    for (const col of scoped) {
      const units = colSales.get(col.key)?.units ?? 0;
      const last30Units = colLast30.get(col.key)?.units ?? 0;
      const stock = binMapReady ? (stockForColumn(binMap, col.warehouses, sku) ?? 0) : 0;
      const math = computeCoverMath({
        stockQty: stock,
        unitsInRange: units,
        daysInRange,
        last30Units,
      });
      if (input.oosOnly && !math.isOosInRange) continue;
      // sendOnly deprecated — ignored
      if (!input.oosOnly && units <= 0 && stock <= 0 && uniqueSkuFilter.length === 0) {
        continue;
      }

      const owner = coverLocationOwner(col);
      const commonKey = entry?.commonSkuKey ?? sku;
      const skuRopKey = ropMapKey(sku, col.key);
      const parentRopKey = ropMapKey(commonKey, col.key);
      const ropQty = ropBySkuColumn.has(skuRopKey) ? (ropBySkuColumn.get(skuRopKey) as number) : null;
      const commonRopQty = ropBySkuColumn.has(parentRopKey)
        ? (ropBySkuColumn.get(parentRopKey) as number)
        : null;

      rows.push({
        sku,
        title: entry?.title ?? null,
        variantTitle: entry?.variantTitle ?? null,
        brand: entry?.brand ?? null,
        commonSkuKey: commonKey,
        commonSkuTitle: entry?.commonSkuTitle ?? entry?.title ?? null,
        priority: resolveEffectivePriority(entry?.erp1ProductPriority, entry?.erp2ProductPriority),
        columnKey: col.key,
        outletName: coverOutletDisplayName(col, displayWarehouseName),
        locationGroup: owner.group,
        channelKind: osfColumnChannelKind(col),
        unitsInRange: units,
        daysInRange,
        avgDaily: math.avgDaily,
        weekNeed: math.weekNeed,
        last30Units,
        last30AvgDaily: math.last30AvgDaily,
        stockQty: binMapReady ? stock : 0,
        coverDays: math.coverDays,
        ropQty,
        commonRopQty,
        isOosInRange: math.isOosInRange,
      });
    }
  }

  rows.sort(
    (a, b) =>
      compareCoverLocationGroup(a.locationGroup, b.locationGroup) ||
      compareChannelKind(a.channelKind, b.channelKind) ||
      a.outletName.localeCompare(b.outletName) ||
      b.unitsInRange - a.unitsInRange,
  );

  return {
    stockSource,
    snapshotDate,
    capturedAt,
    usedFallback,
    daysInRange,
    trailing30From: trailYmd.fromYmd,
    trailing30To: trailYmd.toYmd,
    rows,
  };
}
