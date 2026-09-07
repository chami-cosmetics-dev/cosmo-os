import "server-only";

import { resolveOsfColumns, type OsfResolvedColumn } from "@/lib/osf/column-config";
import { getAllOsfErpInstances, stockForColumn } from "@/lib/osf/erp-stock";
import { resolveErpSlots } from "@/lib/product-items/erp-priority-sync";

import { calendarDaysInclusive, filterSkusByPriority, resolveEffectivePriority } from "@/lib/item-trends/aggregate";
import { loadSkuCatalog } from "@/lib/item-trends/catalog";
import { compareChannelKind, computeCoverMath } from "@/lib/item-trends/cover";
import { displayWarehouseName } from "@/lib/item-trends/location-name";
import { salesByOsfColumnInRange } from "@/lib/item-trends/outlets";
import {
  isPhysicalShopOsfColumn,
  loadPhysicalShops,
  osfColumnChannelKind,
} from "@/lib/item-trends/physical-shops";
import { allowedInstanceIds, columnMatchesErpScope, type ErpStockScope } from "@/lib/item-trends/erp-scope";
import { skuMatchesSearch } from "@/lib/item-trends/sku-group";
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
  return stockColumns(columns).map((col) => ({
    columnKey: col.key,
    label: displayWarehouseName(col.label),
    channelKind: osfColumnChannelKind(col),
    erpnextInstanceId: col.erpnextInstanceId,
  }));
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
  rows: CoverRow[];
}> {
  const daysInRange = calendarDaysInclusive(input.range.fromYmd, input.range.toYmd);
  const stockSource = input.stockSource === "snapshot" ? "snapshot" : "live";
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

  const skuFilter = [
    ...(input.skuFilter?.map((s) => s.trim()).filter(Boolean) ?? []),
    ...[...catalog.values()]
      .filter((entry) => input.commonSkuKey && entry.commonSkuKey === input.commonSkuKey)
      .map((entry) => entry.sku),
  ];
  const searchTerms = input.skuFilter?.map((s) => s.trim()).filter(Boolean) ?? [];
  if (searchTerms.length) {
    for (const entry of catalog.values()) {
      if (searchTerms.some((q) => skuMatchesSearch(entry.sku, entry.commonSkuKey, q))) {
        skuFilter.push(entry.sku);
      }
    }
  }
  const uniqueSkuFilter = [...new Set(skuFilter)];
  const salesMap = await salesByOsfColumnInRange(
    input.companyId,
    input.range,
    scoped,
    uniqueSkuFilter.length ? uniqueSkuFilter : undefined,
  );

  const binMapReady = stockReady;
  const soldSkus = uniqueSkuFilter.length ? uniqueSkuFilter : [...salesMap.keys()];
  const prioritySkus = uniqueSkuFilter.length
    ? soldSkus
    : await filterSkusByPriority(input.companyId, soldSkus, input.priority);

  const shopKeys = new Set(
    scoped.filter((c) => isPhysicalShopOsfColumn(c, shops)).map((c) => c.key),
  );
  const brand = input.brand?.trim().toLowerCase();

  const rows: CoverRow[] = [];
  for (const sku of prioritySkus) {
    const entry = catalog.get(sku);
    if (brand && (entry?.brand ?? "").trim().toLowerCase() !== brand) continue;

    const colSales = salesMap.get(sku) ?? new Map();
    for (const col of scoped) {
      const units = colSales.get(col.key)?.units ?? 0;
      const stock = binMapReady ? (stockForColumn(binMap, col.warehouses, sku) ?? 0) : 0;
      const math = computeCoverMath({
        stockQty: stock,
        unitsInRange: units,
        daysInRange,
      });
      const shouldSend = math.shouldSend && shopKeys.has(col.key);
      if (input.oosOnly && !math.isOosInRange) continue;
      if (input.sendOnly && !shouldSend) continue;
      if (!input.oosOnly && !input.sendOnly && units <= 0 && stock <= 0 && uniqueSkuFilter.length === 0) {
        continue;
      }

      rows.push({
        sku,
        title: entry?.title ?? null,
        variantTitle: entry?.variantTitle ?? null,
        brand: entry?.brand ?? null,
        commonSkuKey: entry?.commonSkuKey ?? sku,
        commonSkuTitle: entry?.commonSkuTitle ?? entry?.title ?? null,
        priority: resolveEffectivePriority(entry?.erp1ProductPriority, entry?.erp2ProductPriority),
        columnKey: col.key,
        outletName: displayWarehouseName(col.label),
        channelKind: osfColumnChannelKind(col),
        unitsInRange: units,
        daysInRange,
        avgDaily: math.avgDaily,
        weekNeed: math.weekNeed,
        stockQty: binMapReady ? stock : 0,
        stockPctOfSale: math.stockPctOfSale,
        stockPctOfWeek: math.stockPctOfWeek,
        coverDays: math.coverDays,
        shouldSend,
        suggestedSendQty: shouldSend ? math.suggestedSendQty : 0,
        isOosInRange: math.isOosInRange,
      });
    }
  }

  rows.sort(
    (a, b) =>
      Number(b.shouldSend) - Number(a.shouldSend) ||
      compareChannelKind(a.channelKind, b.channelKind) ||
      a.outletName.localeCompare(b.outletName) ||
      b.unitsInRange - a.unitsInRange,
  );

  return { stockSource, snapshotDate, capturedAt, usedFallback, daysInRange, rows };
}
