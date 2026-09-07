import "server-only";

import { formatAppIsoDate } from "@/lib/format-datetime";
import { addUtcDays } from "@/lib/osf/assist-window";
import { resolveOsfColumns } from "@/lib/osf/column-config";
import {
  fetchPositiveBinsByWarehouses,
  getAllOsfErpInstances,
} from "@/lib/osf/erp-stock";
import { prisma } from "@/lib/prisma";
import { yesterdaySnapshotDate } from "@/lib/item-trends/snapshot-date";

const SNAPSHOT_RETENTION_DAYS = 90;
const INSERT_BATCH = 500;

export type StockSnapshotMeta = {
  snapshotDate: string;
  capturedAt: Date;
};

export async function latestStockSnapshotMeta(companyId: string): Promise<StockSnapshotMeta | null> {
  const row = await prisma.erpStockSnapshot.findFirst({
    where: { companyId },
    orderBy: [{ snapshotDate: "desc" }, { capturedAt: "desc" }],
    select: { snapshotDate: true, capturedAt: true },
  });
  if (!row) return null;
  return { snapshotDate: row.snapshotDate, capturedAt: row.capturedAt };
}

export async function listSnapshotDates(companyId: string): Promise<StockSnapshotMeta[]> {
  const rows = await prisma.erpStockSnapshot.groupBy({
    by: ["snapshotDate"],
    where: { companyId },
    _max: { capturedAt: true },
    orderBy: { snapshotDate: "desc" },
  });
  return rows
    .filter((row) => row._max.capturedAt)
    .map((row) => ({ snapshotDate: row.snapshotDate, capturedAt: row._max.capturedAt! }));
}

export async function resolveSnapshotMeta(
  companyId: string,
  requested?: string | null,
): Promise<StockSnapshotMeta & { usedFallback: boolean; requestedDate: string } | { snapshotDate: null; capturedAt: null; usedFallback: false; requestedDate: string }> {
  const wanted = (requested ?? "").trim() || yesterdaySnapshotDate();
  const dates = await listSnapshotDates(companyId);
  const exact = dates.find((d) => d.snapshotDate === wanted);
  if (exact) {
    return { ...exact, usedFallback: false, requestedDate: wanted };
  }
  const latest = dates[0];
  if (!latest) {
    return { snapshotDate: null, capturedAt: null, usedFallback: false, requestedDate: wanted };
  }
  return { ...latest, usedFallback: latest.snapshotDate !== wanted, requestedDate: wanted };
}

/** Bin map keyed `${warehouse}::${sku}` for one snapshot date. */
export async function loadSnapshotBinMap(
  companyId: string,
  snapshotDate: string,
): Promise<Map<string, number>> {
  const rows = await prisma.erpStockSnapshot.findMany({
    where: { companyId, snapshotDate },
    select: { warehouse: true, sku: true, qty: true },
  });
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.warehouse}::${row.sku}`;
    map.set(key, (map.get(key) ?? 0) + row.qty);
  }
  return map;
}

export async function pruneErpStockSnapshots(companyId: string, asOf = new Date()): Promise<number> {
  const cutoff = addUtcDays(formatAppIsoDate(asOf), -SNAPSHOT_RETENTION_DAYS);
  const result = await prisma.erpStockSnapshot.deleteMany({
    where: { companyId, snapshotDate: { lt: cutoff } },
  });
  return result.count;
}

export async function captureErpStockSnapshot(companyId: string): Promise<{
  snapshotDate: string;
  capturedAt: Date;
  rowCount: number;
}> {
  const capturedAt = new Date();
  const snapshotDate = formatAppIsoDate(capturedAt);
  const [columns, erpInstances] = await Promise.all([
    resolveOsfColumns(companyId),
    getAllOsfErpInstances(companyId),
  ]);

  const warehousesByInstance = new Map<string, Set<string>>();
  for (const col of columns) {
    if (!col.active || !col.includeInStock || !col.erpnextInstanceId) continue;
    const set = warehousesByInstance.get(col.erpnextInstanceId) ?? new Set<string>();
    for (const wh of col.warehouses) {
      if (wh.trim()) set.add(wh.trim());
    }
    warehousesByInstance.set(col.erpnextInstanceId, set);
  }

  const binMap = new Map<string, number>();
  await Promise.all(
    erpInstances.map(async (inst) => {
      const warehouses = [...(warehousesByInstance.get(inst.id) ?? [])];
      if (warehouses.length === 0) return;
      const bins = await fetchPositiveBinsByWarehouses({ cfg: inst.cfg, warehouses });
      for (const [key, qty] of bins) {
        binMap.set(key, (binMap.get(key) ?? 0) + qty);
      }
    }),
  );

  const rows: Array<{
    companyId: string;
    snapshotDate: string;
    capturedAt: Date;
    sku: string;
    warehouse: string;
    qty: number;
  }> = [];
  for (const [key, qty] of binMap) {
    const sep = key.indexOf("::");
    if (sep < 0) continue;
    const warehouse = key.slice(0, sep);
    const sku = key.slice(sep + 2);
    if (!warehouse || !sku) continue;
    rows.push({ companyId, snapshotDate, capturedAt, sku, warehouse, qty });
  }

  await prisma.$transaction(async (tx) => {
    await tx.erpStockSnapshot.deleteMany({ where: { companyId, snapshotDate } });
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      await tx.erpStockSnapshot.createMany({ data: rows.slice(i, i + INSERT_BATCH) });
    }
  });

  await pruneErpStockSnapshots(companyId, capturedAt);

  return { snapshotDate, capturedAt, rowCount: rows.length };
}

export async function captureErpStockSnapshotsForAllCompanies(): Promise<{
  companies: number;
  ok: number;
  failed: number;
}> {
  const companies = await prisma.company.findMany({
    where: { erpnextInstances: { some: {} } },
    select: { id: true },
  });
  let ok = 0;
  let failed = 0;
  for (const company of companies) {
    try {
      await captureErpStockSnapshot(company.id);
      ok += 1;
    } catch {
      failed += 1;
    }
  }
  return { companies: companies.length, ok, failed };
}
