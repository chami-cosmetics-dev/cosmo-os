import { NextRequest, NextResponse } from "next/server";

import {
  buildBrandWarehouseViolations,
  buildCosmeticsStockReportDetails,
  type StockBalanceRow,
} from "@/lib/cosmetics-stock-comparer";
import { buildCatalogRows } from "@/lib/osf/catalog-rows";
import { resolveOsfColumns } from "@/lib/osf/column-config";
import { fetchBinActualQty, getAllOsfErpInstances, OsfErpError } from "@/lib/osf/erp-stock";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseThreshold(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("threshold") ?? "0";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
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

  if (![...warehousesByInstance.values()].some((warehouses) => warehouses.size > 0)) {
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
      [...warehousesByInstance.entries()].map(async ([instanceId, warehouses]) => {
        const instance = instanceById.get(instanceId);
        if (!instance) return { instanceId, warehouses: [...warehouses], bins: new Map<string, number>() };
        const bins = await fetchBinActualQty({
          cfg: instance.cfg,
          warehouses: [...warehouses],
          itemCodes,
        });
        return { instanceId, warehouses: [...warehouses], bins };
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

    const rows = buildCosmeticsStockReportDetails(stockRows, threshold);
    const brandViolations = buildBrandWarehouseViolations(stockRows);

    return NextResponse.json({
      threshold,
      itemCount: itemCodes.length,
      warehouseCount: new Set(stockRows.map((row) => String(row.Warehouse))).size,
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
