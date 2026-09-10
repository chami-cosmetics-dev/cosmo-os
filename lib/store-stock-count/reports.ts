import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeSkuKey } from "@/lib/store-stock-count/company-key";
import { fetchMergedBarcodeMap, fetchStockForSelectedCompanies } from "@/lib/store-stock-count/erp";
import {
  allCountersSaved,
  displayManualCount,
} from "@/lib/store-stock-count/lanes";
import { matchScan } from "@/lib/store-stock-count/match-scan";
import type {
  SelectableErpCompany,
  StoreStockCountReportListItem,
  StoreStockCountReportStatus,
  StoreStockCountSavedItem,
  StoreStockCountSavedReport,
  StoreStockCountWarehouseColumn,
} from "@/lib/store-stock-count/types";

type Actor = {
  userId: string;
  name: string | null;
  email: string | null;
};

type CountPatch = { itemId: string; manualCount: number | null };
type QbStockPatch = { sku: string; qbStock: number | null };
const SAVE_BATCH_SIZE = 100;
const CREATE_ITEM_BATCH_SIZE = 500;

function countDifference(
  manualCount: number | null,
  stockSum: number | null,
): number | null {
  if (manualCount == null || stockSum == null) return null;
  return manualCount - stockSum;
}

function asCompanies(value: Prisma.JsonValue): SelectableErpCompany[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const r = raw as Record<string, unknown>;
      const instanceId = String(r.instanceId ?? "").trim();
      const instanceLabel = String(r.instanceLabel ?? "").trim();
      const erpCompany = String(r.erpCompany ?? "").trim();
      if (!instanceId || !erpCompany) return null;
      return { instanceId, instanceLabel, erpCompany };
    })
    .filter((row): row is SelectableErpCompany => row != null);
}

function asWarehouses(
  value: Prisma.JsonValue,
): StoreStockCountWarehouseColumn[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const r = raw as Record<string, unknown>;
      const key = String(r.key ?? "").trim();
      const label = String(r.label ?? "").trim();
      const warehouse = String(r.warehouse ?? "").trim();
      const instanceId = String(r.instanceId ?? "").trim();
      const instanceLabel = String(r.instanceLabel ?? "").trim();
      const erpCompany = String(r.erpCompany ?? "").trim();
      if (!key || !warehouse || !instanceId || !erpCompany) return null;
      return {
        key,
        label: label || warehouse,
        warehouse,
        instanceId,
        instanceLabel,
        erpCompany,
      };
    })
    .filter((row): row is StoreStockCountWarehouseColumn => row != null);
}

function asStockMap(value: Prisma.JsonValue): Record<string, number | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number | null> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw == null) {
      out[key] = null;
      continue;
    }
    const n = Number(raw);
    out[key] = Number.isFinite(n) ? n : null;
  }
  return out;
}

function reportStatus(value: string): StoreStockCountReportStatus {
  return value === "submitted" ? "submitted" : "draft";
}

function toSavedItem(row: {
  id: string;
  reportId: string;
  sku: string;
  skuKey: string;
  name: string;
  description: string;
  barcodes: string[];
  stockByWarehouse: Prisma.JsonValue;
  stockSum: number | null;
  qbStock: number | null;
  manualCount: number | null;
  updatedAt?: Date;
}): StoreStockCountSavedItem {
  const stockByWarehouse = asStockMap(row.stockByWarehouse);
  return {
    id: row.id,
    reportId: row.reportId,
    sku: row.sku,
    skuKey: row.skuKey,
    name: row.name,
    description: row.description,
    barcodes: row.barcodes,
    stockByCompany: {},
    stockByWarehouse,
    stockSum: row.stockSum,
    qbStock: row.qbStock,
    manualCount: row.manualCount,
    updatedAt: row.updatedAt?.toISOString(),
  };
}

function toSavedReport(row: {
  id: string;
  title: string;
  status: string;
  selectedCompanies: Prisma.JsonValue;
  warehouses: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  createdBy: { name: string | null; email: string | null } | null;
  updatedBy: { name: string | null; email: string | null } | null;
  submittedBy: { name: string | null; email: string | null } | null;
  items: Parameters<typeof toSavedItem>[0][];
}): StoreStockCountSavedReport {
  return {
    id: row.id,
    title: row.title,
    status: reportStatus(row.status),
    selectedCompanies: asCompanies(row.selectedCompanies),
    warehouses: asWarehouses(row.warehouses),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    createdByName: row.createdBy?.name ?? row.createdBy?.email ?? null,
    updatedByName: row.updatedBy?.name ?? row.updatedBy?.email ?? null,
    submittedByName: row.submittedBy?.name ?? row.submittedBy?.email ?? null,
    countView: "personal",
    myCountsSaved: false,
    counterCount: 0,
    savedCounterCount: 0,
    items: row.items.map(toSavedItem),
  };
}

export async function listStoreStockCountReports(
  companyId: string,
): Promise<StoreStockCountReportListItem[]> {
  const reports = await prisma.storeStockCountReport.findMany({
    where: { companyId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      createdBy: { select: { name: true, email: true } },
      updatedBy: { select: { name: true, email: true } },
      submittedBy: { select: { name: true, email: true } },
      _count: { select: { items: true } },
      items: {
        where: {
          OR: [{ manualCount: { not: null } }, { lanes: { some: {} } }],
        },
        select: { id: true },
      },
    },
  });

  return reports.map((report) => ({
    id: report.id,
    title: report.title,
    itemCount: report._count.items,
    countedCount: report.items.length,
    status: reportStatus(report.status),
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    submittedAt: report.submittedAt?.toISOString() ?? null,
    createdByName: report.createdBy?.name ?? report.createdBy?.email ?? null,
    updatedByName: report.updatedBy?.name ?? report.updatedBy?.email ?? null,
    submittedByName:
      report.submittedBy?.name ?? report.submittedBy?.email ?? null,
  }));
}

export async function getStoreStockCountReport(input: {
  companyId: string;
  reportId: string;
  viewerUserId?: string;
}): Promise<StoreStockCountSavedReport | null> {
  const report = await prisma.storeStockCountReport.findFirst({
    where: { id: input.reportId, companyId: input.companyId },
    include: {
      createdBy: { select: { name: true, email: true } },
      updatedBy: { select: { name: true, email: true } },
      submittedBy: { select: { name: true, email: true } },
      items: { orderBy: { sku: "asc" } },
    },
  });
  if (!report) return null;

  const [lanes, saves] = await Promise.all([
    prisma.storeStockCountItemLane.findMany({
      where: { reportId: input.reportId, companyId: input.companyId },
      select: { itemId: true, userId: true, quantity: true },
    }),
    prisma.storeStockCountUserSave.findMany({
      where: { reportId: input.reportId, companyId: input.companyId },
      select: { userId: true },
    }),
  ]);

  const totals = new Map<string, number>();
  const mine = new Map<string, number>();
  const laneItems = new Set<string>();
  const counterIds = new Set<string>();
  for (const lane of lanes) {
    laneItems.add(lane.itemId);
    counterIds.add(lane.userId);
    totals.set(lane.itemId, (totals.get(lane.itemId) ?? 0) + lane.quantity);
    if (input.viewerUserId && lane.userId === input.viewerUserId) {
      mine.set(lane.itemId, lane.quantity);
    }
  }

  const combined =
    report.status === "submitted" || report.combinedAt != null;
  const saved = toSavedReport(report);
  saved.countView = combined ? "combined" : "personal";
  saved.myCountsSaved = Boolean(
    input.viewerUserId &&
      saves.some((row) => row.userId === input.viewerUserId),
  );
  saved.counterCount = counterIds.size;
  saved.savedCounterCount = saves.filter((row) =>
    counterIds.has(row.userId),
  ).length;
  saved.items = saved.items.map((item) => ({
    ...item,
    manualCount: displayManualCount({
      combined,
      hasLanes: laneItems.has(item.id),
      myQuantity: mine.get(item.id) ?? null,
      combinedQuantity: totals.get(item.id) ?? null,
      legacyCount: item.manualCount,
    }),
  }));
  return saved;
}

async function syncCombinedCountForItem(
  tx: Pick<typeof prisma, "storeStockCountItemLane" | "storeStockCountReportItem">,
  itemId: string,
) {
  const grouped = await tx.storeStockCountItemLane.aggregate({
    where: { itemId },
    _sum: { quantity: true },
  });
  await tx.storeStockCountReportItem.update({
    where: { id: itemId },
    data: { manualCount: grouped._sum.quantity ?? null },
  });
}

async function combineAllLanes(reportId: string, companyId: string) {
  const grouped = await prisma.storeStockCountItemLane.groupBy({
    by: ["itemId"],
    where: { reportId, companyId },
    _sum: { quantity: true },
  });
  for (let i = 0; i < grouped.length; i += SAVE_BATCH_SIZE) {
    const batch = grouped.slice(i, i + SAVE_BATCH_SIZE);
    await prisma.$transaction(
      batch.map((row) =>
        prisma.storeStockCountReportItem.update({
          where: { id: row.itemId },
          data: { manualCount: row._sum.quantity ?? 0 },
        }),
      ),
    );
  }
  await prisma.storeStockCountReport.update({
    where: { id: reportId },
    data: { combinedAt: new Date() },
  });
}

export async function saveMyStoreStockCountLanes(input: {
  companyId: string;
  reportId: string;
  actor: Actor;
}): Promise<StoreStockCountSavedReport | null> {
  const report = await prisma.storeStockCountReport.findFirst({
    where: { id: input.reportId, companyId: input.companyId },
    select: { id: true, status: true, combinedAt: true },
  });
  if (!report) return null;
  if (report.status === "submitted")
    throw new Error("Submitted reports cannot be edited");

  await prisma.storeStockCountUserSave.upsert({
    where: {
      reportId_userId: {
        reportId: input.reportId,
        userId: input.actor.userId,
      },
    },
    create: {
      companyId: input.companyId,
      reportId: input.reportId,
      userId: input.actor.userId,
    },
    update: { savedAt: new Date() },
  });

  const [laneUsers, saves] = await Promise.all([
    prisma.storeStockCountItemLane.findMany({
      where: { reportId: input.reportId, companyId: input.companyId },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.storeStockCountUserSave.findMany({
      where: { reportId: input.reportId, companyId: input.companyId },
      select: { userId: true },
    }),
  ]);
  if (
    laneUsers.length >= 2 &&
    allCountersSaved(
      laneUsers.map((row) => row.userId),
      saves.map((row) => row.userId),
    )
  ) {
    await combineAllLanes(input.reportId, input.companyId);
  }

  return getStoreStockCountReport({
    companyId: input.companyId,
    reportId: input.reportId,
    viewerUserId: input.actor.userId,
  });
}

export async function startNewStoreStockCountRound(input: {
  companyId: string;
  reportId: string;
  actor: Actor;
}): Promise<StoreStockCountSavedReport | null> {
  const report = await prisma.storeStockCountReport.findFirst({
    where: { id: input.reportId, companyId: input.companyId },
    select: { id: true, status: true, combinedAt: true },
  });
  if (!report) return null;
  if (report.status === "submitted") {
    throw new Error("Submitted reports cannot be edited");
  }
  if (report.combinedAt == null) {
    throw new Error("Combine and download this round before starting a new one");
  }

  await prisma.$transaction([
    prisma.storeStockCountUserSave.deleteMany({
      where: { reportId: input.reportId, companyId: input.companyId },
    }),
    prisma.storeStockCountReport.update({
      where: { id: input.reportId },
      data: {
        combinedAt: null,
        updatedByUserId: input.actor.userId,
      },
    }),
  ]);

  return getStoreStockCountReport({
    companyId: input.companyId,
    reportId: input.reportId,
    viewerUserId: input.actor.userId,
  });
}

export async function createStoreStockCountReport(input: {
  companyId: string;
  title: string;
  companies: SelectableErpCompany[];
  warehouses?: StoreStockCountWarehouseColumn[];
  actor: Actor;
}): Promise<StoreStockCountSavedReport> {
  const selectedCompanies = input.companies.map((company) => ({
    instanceId: company.instanceId,
    instanceLabel: company.instanceLabel,
    erpCompany: company.erpCompany,
  }));

  const rowsBySku = new Map<
    string,
    {
      sku: string;
      skuKey: string;
      name: string;
      description: string;
      barcodes: string[];
      stockByWarehouse: Record<string, number>;
    }
  >();
  const warehouses: StoreStockCountWarehouseColumn[] = [];

  const companyResults = await fetchStockForSelectedCompanies({
    companyId: input.companyId,
    companies: selectedCompanies,
    warehouses: input.warehouses,
  });

  for (const result of companyResults) {
    warehouses.push(...result.warehouses);

    for (const item of result.items) {
      const sku = item.sku.trim();
      if (!sku) continue;
      const skuKey = normalizeSkuKey(sku);
      const prev = rowsBySku.get(skuKey);
      if (!prev) {
        rowsBySku.set(skuKey, {
          sku,
          skuKey,
          name: item.name?.trim() || sku,
          description: item.description?.trim() || "",
          barcodes: item.barcodes.map((b) => b.trim()).filter(Boolean),
          stockByWarehouse: { ...item.stockByWarehouse },
        });
        continue;
      }
      for (const barcode of item.barcodes) {
        const b = barcode.trim();
        if (b && !prev.barcodes.includes(b)) prev.barcodes.push(b);
      }
      if ((!prev.name || prev.name === prev.sku) && item.name?.trim())
        prev.name = item.name.trim();
      if (!prev.description && item.description?.trim())
        prev.description = item.description.trim();
      prev.stockByWarehouse = {
        ...prev.stockByWarehouse,
        ...item.stockByWarehouse,
      };
    }
  }

  const warehouseKeys = warehouses.map((w) => w.key);
  const rows = [...rowsBySku.values()].sort((a, b) =>
    a.sku.localeCompare(b.sku),
  );

  const report = await prisma.storeStockCountReport.create({
    data: {
      companyId: input.companyId,
      title: input.title,
      selectedCompanies:
        selectedCompanies as unknown as Prisma.InputJsonValue,
      warehouses: warehouses as unknown as Prisma.InputJsonValue,
      status: "draft",
      createdByUserId: input.actor.userId,
      updatedByUserId: input.actor.userId,
    },
  });

  try {
    for (let i = 0; i < rows.length; i += CREATE_ITEM_BATCH_SIZE) {
      const batch = rows.slice(i, i + CREATE_ITEM_BATCH_SIZE);
      await prisma.storeStockCountReportItem.createMany({
        data: batch.map((row) => {
          const stockByWarehouse = Object.fromEntries(
            warehouseKeys.map((key) => [key, row.stockByWarehouse[key] ?? 0]),
          );
          const stockSum = Object.values(stockByWarehouse).reduce(
            (sum, raw) => sum + Number(raw || 0),
            0,
          );
          return {
            companyId: input.companyId,
            reportId: report.id,
            sku: row.sku,
            skuKey: row.skuKey,
            name: row.name,
            description: row.description,
            barcodes: row.barcodes,
            stockByWarehouse:
              stockByWarehouse as unknown as Prisma.InputJsonValue,
            stockSum,
            qbStock: null,
            manualCount: null,
          };
        }),
      });
    }
  } catch (err) {
    await prisma.storeStockCountReport.delete({ where: { id: report.id } });
    throw err;
  }

  const full = await getStoreStockCountReport({
    companyId: input.companyId,
    reportId: report.id,
    viewerUserId: input.actor.userId,
  });
  if (!full) throw new Error("Created report could not be loaded");
  return full;
}

export async function refreshStoreStockCountBarcodes(input: {
  companyId: string;
  reportId: string;
  actor: Actor;
}): Promise<StoreStockCountSavedReport | null> {
  const report = await prisma.storeStockCountReport.findFirst({
    where: { id: input.reportId, companyId: input.companyId },
    select: {
      id: true,
      status: true,
      selectedCompanies: true,
      items: { select: { id: true, sku: true, skuKey: true, barcodes: true } },
    },
  });
  if (!report) return null;
  if (report.status === "submitted") {
    throw new Error("Submitted reports cannot be edited");
  }

  const companies = asCompanies(report.selectedCompanies);
  const map = await fetchMergedBarcodeMap({
    companyId: input.companyId,
    instanceIds: companies.map((company) => company.instanceId),
  });

  const updates: Array<{ id: string; barcodes: string[] }> = [];
  for (const item of report.items) {
    const next = [
      ...new Set(
        [
          ...item.barcodes,
          ...(map.get(item.sku) ?? []),
          ...(map.get(item.skuKey) ?? []),
        ]
          .map((barcode) => barcode.trim())
          .filter(Boolean),
      ),
    ];
    if (next.length === item.barcodes.length && next.every((b, i) => b === item.barcodes[i])) {
      continue;
    }
    updates.push({ id: item.id, barcodes: next });
  }

  for (let i = 0; i < updates.length; i += SAVE_BATCH_SIZE) {
    const batch = updates.slice(i, i + SAVE_BATCH_SIZE);
    await prisma.$transaction(
      batch.map((row) =>
        prisma.storeStockCountReportItem.update({
          where: { id: row.id },
          data: { barcodes: row.barcodes },
        }),
      ),
    );
  }

  await prisma.storeStockCountReport.update({
    where: { id: input.reportId },
    data: { updatedByUserId: input.actor.userId },
  });

  return getStoreStockCountReport({
    companyId: input.companyId,
    reportId: input.reportId,
    viewerUserId: input.actor.userId,
  });
}

export async function saveStoreStockCountReport(input: {
  companyId: string;
  reportId: string;
  items: CountPatch[];
  actor: Actor;
  reload?: boolean;
}): Promise<
  StoreStockCountSavedReport | { id: string; updatedAt: string } | null
> {
  const report = await prisma.storeStockCountReport.findFirst({
    where: { id: input.reportId, companyId: input.companyId },
    select: { id: true, status: true },
  });
  if (!report) return null;
  if (report.status === "submitted")
    throw new Error("Submitted reports cannot be edited");

  const combined =
    (
      await prisma.storeStockCountReport.findFirst({
        where: { id: input.reportId },
        select: { combinedAt: true },
      })
    )?.combinedAt != null;

  const currentLanes = await prisma.storeStockCountItemLane.findMany({
    where: {
      itemId: { in: input.items.map((item) => item.itemId) },
      reportId: input.reportId,
      userId: input.actor.userId,
    },
    select: { itemId: true, quantity: true },
  });
  const currentById = new Map(
    currentLanes.map((lane) => [lane.itemId, lane.quantity]),
  );
  const changedItems = input.items.filter(
    (item) => (currentById.get(item.itemId) ?? null) !== item.manualCount,
  );

  for (const item of changedItems) {
    if (item.manualCount == null) {
      await prisma.storeStockCountItemLane.deleteMany({
        where: {
          itemId: item.itemId,
          reportId: input.reportId,
          userId: input.actor.userId,
        },
      });
    } else {
      await prisma.storeStockCountItemLane.upsert({
        where: {
          itemId_userId: {
            itemId: item.itemId,
            userId: input.actor.userId,
          },
        },
        create: {
          companyId: input.companyId,
          reportId: input.reportId,
          itemId: item.itemId,
          userId: input.actor.userId,
          quantity: item.manualCount,
        },
        update: { quantity: item.manualCount },
      });
    }
    if (combined) await syncCombinedCountForItem(prisma, item.itemId);
  }

  await prisma.storeStockCountReport.update({
    where: { id: input.reportId },
    data: { updatedByUserId: input.actor.userId },
  });
  if (input.reload === false) {
    const saved = await prisma.storeStockCountReport.findUnique({
      where: { id: input.reportId },
      select: { id: true, updatedAt: true },
    });
    return saved
      ? { id: saved.id, updatedAt: saved.updatedAt.toISOString() }
      : null;
  }

  return getStoreStockCountReport({
    companyId: input.companyId,
    reportId: input.reportId,
    viewerUserId: input.actor.userId,
  });
}

export async function incrementStoreStockCountBarcode(input: {
  companyId: string;
  reportId: string;
  barcode: string;
  actor: Actor;
}): Promise<{
  item: StoreStockCountSavedItem;
  status: "done" | "difference";
  difference: number | null;
} | null> {
  const code = input.barcode.trim();
  if (!code) throw new Error("Barcode is required");

  return prisma.$transaction(async (tx) => {
    const report = await tx.storeStockCountReport.findFirst({
      where: { id: input.reportId, companyId: input.companyId },
      select: { id: true, status: true, combinedAt: true },
    });
    if (!report) return null;
    if (report.status === "submitted") throw new Error("Report is submitted");

    let matches = await tx.storeStockCountReportItem.findMany({
      where: {
        reportId: input.reportId,
        companyId: input.companyId,
        barcodes: { has: code },
      },
      select: {
        id: true,
        reportId: true,
        sku: true,
        skuKey: true,
        name: true,
        description: true,
        barcodes: true,
        stockByWarehouse: true,
        stockSum: true,
        qbStock: true,
        manualCount: true,
        updatedAt: true,
      },
    });

    if (matches.length === 0) {
      const rows = await tx.storeStockCountReportItem.findMany({
        where: { reportId: input.reportId, companyId: input.companyId },
        select: {
          id: true,
          reportId: true,
          sku: true,
          skuKey: true,
          name: true,
          description: true,
          barcodes: true,
          stockByWarehouse: true,
          stockSum: true,
          qbStock: true,
          manualCount: true,
          updatedAt: true,
        },
      });
      const result = matchScan(code, rows);
      if (result.kind === "unique") {
        matches = rows.filter((row) => row.skuKey === result.skuKey);
      } else if (result.kind === "ambiguous") {
        throw new Error("Barcode matches multiple items");
      }
    }

    if (matches.length === 0) throw new Error("Item not found");
    const skuKeys = new Set(matches.map((item) => item.skuKey));
    if (skuKeys.size > 1) throw new Error("Barcode matches multiple items");

    const target = matches[0]!;
    const lane = await tx.storeStockCountItemLane.upsert({
      where: {
        itemId_userId: {
          itemId: target.id,
          userId: input.actor.userId,
        },
      },
      create: {
        companyId: input.companyId,
        reportId: input.reportId,
        itemId: target.id,
        userId: input.actor.userId,
        quantity: 1,
      },
      update: { quantity: { increment: 1 } },
    });
    if (report.combinedAt) {
      await syncCombinedCountForItem(tx, target.id);
    }
    const updated = await tx.storeStockCountReportItem.update({
      where: { id: target.id },
      data: { updatedAt: new Date() },
    });
    await tx.storeStockCountReport.update({
      where: { id: input.reportId },
      data: { updatedByUserId: input.actor.userId },
    });

    const item = toSavedItem({
      ...updated,
      manualCount: lane.quantity,
    });
    const diff = countDifference(item.manualCount, item.stockSum);
    return {
      item,
      status: diff === 0 ? "done" : "difference",
      difference: diff,
    };
  });
}
export async function importStoreStockCountQbStock(input: {
  companyId: string;
  reportId: string;
  items: QbStockPatch[];
  actor: Actor;
}): Promise<{
  report: StoreStockCountSavedReport;
  updatedCount: number;
  missingSkus: string[];
} | null> {
  const report = await prisma.storeStockCountReport.findFirst({
    where: { id: input.reportId, companyId: input.companyId },
    select: { id: true, status: true },
  });
  if (!report) return null;
  if (report.status === "submitted")
    throw new Error("Submitted reports cannot be edited");

  const normalized = new Map<string, number | null>();
  for (const item of input.items) {
    const skuKey = normalizeSkuKey(item.sku);
    if (skuKey) normalized.set(skuKey, item.qbStock);
  }

  const existingItems = await prisma.storeStockCountReportItem.findMany({
    where: {
      reportId: input.reportId,
      companyId: input.companyId,
      skuKey: { in: [...normalized.keys()] },
    },
    select: { id: true, skuKey: true },
  });
  const existingKeys = new Set(existingItems.map((item) => item.skuKey));
  const missingSkus = [...normalized.keys()].filter(
    (skuKey) => !existingKeys.has(skuKey),
  );
  const existingBySkuKey = new Map(
    existingItems.map((item) => [item.skuKey, item.id]),
  );
  let updatedCount = 0;

  const updates = [...normalized.entries()]
    .map(([skuKey, qbStock]) => {
      const itemId = existingBySkuKey.get(skuKey);
      return itemId ? { itemId, qbStock } : null;
    })
    .filter(
      (item): item is { itemId: string; qbStock: number | null } =>
        item != null,
    );

  for (let i = 0; i < updates.length; i += SAVE_BATCH_SIZE) {
    const batch = updates.slice(i, i + SAVE_BATCH_SIZE);
    await prisma.$transaction(
      batch.map((item) =>
        prisma.storeStockCountReportItem.update({
          where: { id: item.itemId },
          data: { qbStock: item.qbStock },
        }),
      ),
    );
    updatedCount += batch.length;
  }

  await prisma.storeStockCountReport.update({
    where: { id: input.reportId },
    data: { updatedByUserId: input.actor.userId },
  });

  const full = await getStoreStockCountReport({
    companyId: input.companyId,
    reportId: input.reportId,
    viewerUserId: input.actor.userId,
  });
  if (!full) return null;
  return { report: full, updatedCount, missingSkus };
}
export async function submitStoreStockCountReport(input: {
  companyId: string;
  reportId: string;
  actor: Actor;
}): Promise<StoreStockCountSavedReport | null> {
  const report = await prisma.storeStockCountReport.findFirst({
    where: { id: input.reportId, companyId: input.companyId },
    select: { id: true, status: true },
  });
  if (!report) return null;
  if (report.status !== "submitted") {
    await combineAllLanes(input.reportId, input.companyId);
    await prisma.storeStockCountReport.update({
      where: { id: input.reportId },
      data: {
        status: "submitted",
        submittedByUserId: input.actor.userId,
        submittedAt: new Date(),
        updatedByUserId: input.actor.userId,
      },
    });
  }
  return getStoreStockCountReport({
    companyId: input.companyId,
    reportId: input.reportId,
    viewerUserId: input.actor.userId,
  });
}

export async function deleteStoreStockCountReport(input: {
  companyId: string;
  reportId: string;
}): Promise<boolean> {
  const result = await prisma.storeStockCountReport.deleteMany({
    where: { id: input.reportId, companyId: input.companyId },
  });
  return result.count > 0;
}
