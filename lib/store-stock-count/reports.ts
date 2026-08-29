import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeSkuKey } from "@/lib/store-stock-count/company-key";
import { fetchCompanyStockItems } from "@/lib/store-stock-count/erp";
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
const SAVE_BATCH_SIZE = 100;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function countDifference(manualCount: number | null, stockSum: number | null): number | null {
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

function asWarehouses(value: Prisma.JsonValue): StoreStockCountWarehouseColumn[] {
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
      return { key, label: label || warehouse, warehouse, instanceId, instanceLabel, erpCompany };
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
  manualCount: number | null;
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
    manualCount: row.manualCount,
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
      items: { where: { manualCount: { not: null } }, select: { id: true } },
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
    submittedByName: report.submittedBy?.name ?? report.submittedBy?.email ?? null,
  }));
}

export async function getStoreStockCountReport(input: {
  companyId: string;
  reportId: string;
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
  return report ? toSavedReport(report) : null;
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
  const selectedWarehousesByCompany = new Map<string, StoreStockCountWarehouseColumn[]>();
  for (const warehouse of input.warehouses ?? []) {
    const key = `${warehouse.instanceId}::${warehouse.erpCompany}`;
    const list = selectedWarehousesByCompany.get(key) ?? [];
    list.push(warehouse);
    selectedWarehousesByCompany.set(key, list);
  }

  for (const company of selectedCompanies) {
    const result = await fetchCompanyStockItems({
      companyId: input.companyId,
      instanceId: company.instanceId,
      erpCompany: company.erpCompany,
      warehouses: selectedWarehousesByCompany.get(`${company.instanceId}::${company.erpCompany}`),
    });
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
      if ((!prev.name || prev.name === prev.sku) && item.name?.trim()) prev.name = item.name.trim();
      if (!prev.description && item.description?.trim()) prev.description = item.description.trim();
      prev.stockByWarehouse = { ...prev.stockByWarehouse, ...item.stockByWarehouse };
    }
  }

  const warehouseKeys = warehouses.map((w) => w.key);
  const rows = [...rowsBySku.values()].sort((a, b) => a.sku.localeCompare(b.sku));

  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.storeStockCountReport.create({
      data: {
        companyId: input.companyId,
        title: input.title,
        selectedCompanies: selectedCompanies as unknown as Prisma.InputJsonValue,
        warehouses: warehouses as unknown as Prisma.InputJsonValue,
        status: "draft",
        createdByUserId: input.actor.userId,
        updatedByUserId: input.actor.userId,
      },
    });

    if (rows.length > 0) {
      await tx.storeStockCountReportItem.createMany({
        data: rows.map((row) => {
          const stockByWarehouse = Object.fromEntries(
            warehouseKeys.map((key) => [key, row.stockByWarehouse[key] ?? 0]),
          );
          const stockSum = Object.values(stockByWarehouse).reduce((sum, raw) => sum + Number(raw || 0), 0);
          return {
            companyId: input.companyId,
            reportId: created.id,
            sku: row.sku,
            skuKey: row.skuKey,
            name: row.name,
            description: row.description,
            barcodes: row.barcodes,
            stockByWarehouse: stockByWarehouse as unknown as Prisma.InputJsonValue,
            stockSum,
            manualCount: null,
          };
        }),
      });
    }

    return created;
  });

  const full = await getStoreStockCountReport({ companyId: input.companyId, reportId: report.id });
  if (!full) throw new Error("Created report could not be loaded");
  return full;
}

export async function saveStoreStockCountReport(input: {
  companyId: string;
  reportId: string;
  items: CountPatch[];
  actor: Actor;
  reload?: boolean;
}): Promise<StoreStockCountSavedReport | { id: string; updatedAt: string } | null> {
  const report = await prisma.storeStockCountReport.findFirst({
    where: { id: input.reportId, companyId: input.companyId },
    select: { id: true, status: true },
  });
  if (!report) return null;
  if (report.status === "submitted") throw new Error("Submitted reports cannot be edited");
  const currentItems = await prisma.storeStockCountReportItem.findMany({
    where: {
      id: { in: input.items.map((item) => item.itemId) },
      reportId: input.reportId,
      companyId: input.companyId,
    },
    select: { id: true, manualCount: true },
  });
  const currentById = new Map(currentItems.map((item) => [item.id, item.manualCount]));
  const changedItems = input.items.filter((item) => currentById.get(item.itemId) !== item.manualCount);

  for (let i = 0; i < changedItems.length; i += SAVE_BATCH_SIZE) {
    const batch = changedItems.slice(i, i + SAVE_BATCH_SIZE);
    await prisma.$transaction(
      batch.map((item) =>
        prisma.storeStockCountReportItem.updateMany({
          where: { id: item.itemId, reportId: input.reportId, companyId: input.companyId },
          data: { manualCount: item.manualCount },
        }),
      ),
    );
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
    return saved ? { id: saved.id, updatedAt: saved.updatedAt.toISOString() } : null;
  }

  return getStoreStockCountReport({ companyId: input.companyId, reportId: input.reportId });
}

export async function incrementStoreStockCountBarcode(input: {
  companyId: string;
  reportId: string;
  barcode: string;
  actor: Actor;
}): Promise<{ item: StoreStockCountSavedItem; status: "done" | "difference"; difference: number | null } | null> {
  const code = input.barcode.trim();
  if (!code) throw new Error("Barcode is required");

  return prisma.$transaction(async (tx) => {
    const report = await tx.storeStockCountReport.findFirst({
      where: { id: input.reportId, companyId: input.companyId },
      select: { id: true, status: true },
    });
    if (!report) return null;
    if (report.status === "submitted") throw new Error("Report is submitted");

    let matches = await tx.storeStockCountReportItem.findMany({
      where: { reportId: input.reportId, companyId: input.companyId, barcodes: { has: code } },
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
        manualCount: true,
      },
    });

    if (matches.length === 0) {
      const scannedDigits = digitsOnly(code);
      if (scannedDigits) {
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
            manualCount: true,
          },
        });
        matches = rows.filter((row) => row.barcodes.some((barcode) => digitsOnly(barcode) === scannedDigits));
      }
    }

    if (matches.length === 0) throw new Error("Item not found");
    const skuKeys = new Set(matches.map((item) => item.skuKey));
    if (skuKeys.size > 1) throw new Error("Barcode matches multiple items");

    const target = matches[0]!;
    await tx.storeStockCountReportItem.updateMany({
      where: { id: target.id, reportId: input.reportId, companyId: input.companyId, manualCount: null },
      data: { manualCount: 0 },
    });
    const updated = await tx.storeStockCountReportItem.update({
      where: { id: target.id },
      data: { manualCount: { increment: 1 } },
    });
    await tx.storeStockCountReport.update({
      where: { id: input.reportId },
      data: { updatedByUserId: input.actor.userId },
    });

    const item = toSavedItem(updated);
    const diff = countDifference(item.manualCount, item.stockSum);
    return { item, status: diff === 0 ? "done" : "difference", difference: diff };
  });
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
  return getStoreStockCountReport({ companyId: input.companyId, reportId: input.reportId });
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
