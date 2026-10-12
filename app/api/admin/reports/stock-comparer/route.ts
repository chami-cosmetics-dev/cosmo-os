import { NextRequest, NextResponse } from "next/server";

import {
  buildBrandWarehouseViolations,
  buildCosmeticsStockReportDetails,
  buildFocusedStockReport,
  attachSubjectRopPercent,
  decorateReportRows,
  filterReportByMainRopPercent,
  listWarehouseOptions,
  markCriticalTopSellers,
  selectWatchedTargets,
  type RopColumnRef,
  type StockBalanceRow,
} from "@/lib/cosmetics-stock-comparer";
import { loadWebsiteSalesLast90d } from "@/lib/cosmetics-stock-comparer-sales";
import { buildCatalogRows } from "@/lib/osf/catalog-rows";
import { resolveOsfColumns } from "@/lib/osf/column-config";
import { fetchBinActualQty, getAllOsfErpInstances, OsfErpError } from "@/lib/osf/erp-stock";
import { vatStatusLabel } from "@/lib/osf/vat-membership";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseThreshold(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("threshold") ?? "0";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRopPercent(request: NextRequest): number | null | "invalid" {
  const raw = request.nextUrl.searchParams.get("ropPercent");
  if (raw == null || raw.trim() === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return "invalid";
  return parsed;
}

function erpSourceFromLabel(label: string | null, index: number): "ERP1" | "ERP2" {
  const normalized = (label ?? "").toLowerCase();
  if (/\berp[\s_-]*2\b/.test(normalized)) return "ERP2";
  if (/\berp[\s_-]*1\b/.test(normalized)) return "ERP1";
  return index === 1 ? "ERP2" : "ERP1";
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("reports.stock_comparer");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const threshold = parseThreshold(request);
  if (threshold == null) {
    return NextResponse.json({ error: "Stock threshold must be a number" }, { status: 400 });
  }

  const ropPercent = parseRopPercent(request);
  if (ropPercent === "invalid") {
    return NextResponse.json(
      { error: "Reorder percent must be a number from 0 through 100" },
      { status: 400 },
    );
  }

  const [catalog, columns, erpInstances] = await Promise.all([
    buildCatalogRows(companyId),
    resolveOsfColumns(companyId),
    getAllOsfErpInstances(companyId),
  ]);

  if (erpInstances.length === 0) {
    return NextResponse.json(
      {
        error: "ERP credentials missing",
        code: "ERP_UNAVAILABLE",
        detail: "Configure ERPNext instances before loading live stock.",
      },
      { status: 502 },
    );
  }

  const itemCodes = catalog.map((item) => item.sku);
  const titleBySku = new Map(catalog.map((item) => [item.sku, item.productTitle]));
  const instanceById = new Map(erpInstances.map((instance) => [instance.id, instance]));
  const sourceByInstanceId = new Map(
    erpInstances.map((instance, index) => [instance.id, erpSourceFromLabel(instance.label, index)]),
  );

  const warehousesByInstance = new Map<string, Set<string>>();
  for (const column of columns) {
    if (!column.active || !column.includeInStock || !column.erpnextInstanceId) continue;
    const set = warehousesByInstance.get(column.erpnextInstanceId) ?? new Set<string>();
    for (const warehouse of column.warehouses) set.add(warehouse);
    warehousesByInstance.set(column.erpnextInstanceId, set);
  }

  const ropColumns: RopColumnRef[] = columns
    .filter((column) => column.active)
    .map((column) => ({
      key: column.key,
      label: column.label,
      warehouses: column.warehouses,
      erpSource: column.erpnextInstanceId
        ? (sourceByInstanceId.get(column.erpnextInstanceId) ?? "")
        : "",
      active: column.active,
      includeInRop: column.includeInRop,
      companyLocationName: column.companyLocationName,
    }));
  const watchedTargets = selectWatchedTargets(ropColumns);
  const warehouses = listWarehouseOptions(ropColumns, watchedTargets);
  const focusRaw = request.nextUrl.searchParams.get("focusWarehouse")?.trim() ?? "";
  let focusWarehouse: string | null = null;
  if (focusRaw) {
    const match = warehouses.find((warehouse) => warehouse.name.toLowerCase() === focusRaw.toLowerCase());
    if (!match) {
      return NextResponse.json({ error: "Unknown warehouse" }, { status: 400 });
    }
    focusWarehouse = match.name;
  }

  if (![...warehousesByInstance.values()].some((names) => names.size > 0)) {
    return NextResponse.json(
      {
        error: "ERP warehouses missing",
        code: "ERP_WAREHOUSES_MISSING",
        detail: "Configure active OSF stock warehouses before running the Stock Comparer report.",
      },
      { status: 409 },
    );
  }

  try {
    const perInstanceBins = await Promise.all(
      [...warehousesByInstance.entries()].map(async ([instanceId, names]) => {
        const instance = instanceById.get(instanceId);
        if (!instance) return { instanceId, warehouses: [...names], bins: new Map<string, number>() };
        const bins = await fetchBinActualQty({
          cfg: instance.cfg,
          warehouses: [...names],
          itemCodes,
        });
        return { instanceId, warehouses: [...names], bins };
      }),
    );

    const stockRows: StockBalanceRow[] = [];
    for (const result of perInstanceBins) {
      const erpSource = sourceByInstanceId.get(result.instanceId) ?? "";
      for (const sku of itemCodes) {
        for (const warehouse of result.warehouses) {
          const qty = result.bins.get(`${warehouse}::${sku}`) ?? 0;
          stockRows.push({
            Item: sku,
            "Item Name": titleBySku.get(sku) ?? sku,
            Company: erpSource,
            Warehouse: warehouse,
            "Balance Qty": qty,
            "__ERP Source": erpSource,
          });
        }
      }
    }

    const thresholdRows = focusWarehouse
      ? buildFocusedStockReport(stockRows, focusWarehouse, threshold)
      : buildCosmeticsStockReportDetails(stockRows, threshold);
    const brandViolations = buildBrandWarehouseViolations(stockRows);

    let salesStatus: "ok" | "unavailable" = "ok";
    let salesWindow: {
      from: string;
      to: string;
      timezone: "Asia/Colombo";
      days: 90;
    } | null = null;
    let salesBySku = new Map<string, number>();
    try {
      const sales = await loadWebsiteSalesLast90d(companyId);
      salesWindow = sales.window;
      salesBySku = sales.unitsBySku;
    } catch (salesErr) {
      console.error("[stock-comparer sales]", salesErr);
      salesStatus = "unavailable";
    }

    const listSource =
      ropPercent == null
        ? thresholdRows
        : focusWarehouse
          ? buildFocusedStockReport(stockRows, focusWarehouse, Number.POSITIVE_INFINITY)
          : buildCosmeticsStockReportDetails(stockRows, Number.POSITIVE_INFINITY);
    const { rows: marked, cutoff } = markCriticalTopSellers(listSource, salesBySku, salesStatus === "ok");

    const identities = catalog.map((item) => ({
      sku: item.sku,
      productTitle: item.productTitle,
      erp1ProductPriority: item.erp1ProductPriority,
      erp2ProductPriority: item.erp2ProductPriority,
      vatStatus: vatStatusLabel(item),
    }));
    const mainColumnKey = watchedTargets.find((target) => target.role === "cosmetics-main")?.columnKey ?? null;
    const focusColumnKey = focusWarehouse
      ? (ropColumns.find((column) =>
          column.warehouses.some((warehouse) => warehouse.trim().toLowerCase() === focusWarehouse.toLowerCase()),
        )?.key ?? null)
      : mainColumnKey;
    const ropBySkuColumn = new Map<string, number>();
    const ropRows = await prisma.productOsfRop.findMany({
      where: { companyId },
      select: { sku: true, columnKey: true, ropQty: true },
    });
    for (const rop of ropRows) {
      ropBySkuColumn.set(`${rop.sku.trim().toLowerCase()}::${rop.columnKey}`, rop.ropQty);
    }
    const percentRows =
      ropPercent == null
        ? marked
        : filterReportByMainRopPercent(marked, ropBySkuColumn, focusColumnKey, ropPercent);
    const rows = attachSubjectRopPercent(
      decorateReportRows(percentRows, identities),
      ropBySkuColumn,
      focusColumnKey,
    );

    return NextResponse.json({
      threshold,
      ropPercent,
      focusWarehouse,
      itemCount: itemCodes.length,
      warehouseCount: new Set(stockRows.map((row) => String(row.Warehouse))).size,
      watchedWarehouseCount: watchedTargets.length,
      warehouses,
      salesWindow,
      salesStatus,
      criticalCutoffUnits: cutoff,
      rows,
      brandViolations,
    });
  } catch (err) {
    if (err instanceof OsfErpError) {
      return NextResponse.json(
        {
          error: "ERP unreachable",
          code: "ERP_UNAVAILABLE",
          detail: err.message,
        },
        { status: 502 },
      );
    }
    console.error("[stock-comparer live]", err);
    return NextResponse.json({ error: "Failed to load live stock" }, { status: 500 });
  }
}
