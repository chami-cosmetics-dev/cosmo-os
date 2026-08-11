import { NextRequest, NextResponse } from "next/server";

import { resolveOsfColumns } from "@/lib/osf/column-config";
import { OsfErpError } from "@/lib/osf/erp-cost-supplier";
import { fetchBinActualQty, getAllOsfErpInstances, stockForColumn } from "@/lib/osf/erp-stock";
import { computeTotalOrderQtyForSkus } from "@/lib/osf/supplier-orders-reorder";
import { allocateTakeQty } from "@/lib/store-allocation/allocate";
import { requireStoreAllocationAccess } from "@/lib/store-allocation/auth";
import { filterStoreAllocationColumns } from "@/lib/store-allocation/osf-columns";
import { salesByOsfColumnLast90d } from "@/lib/store-allocation/location-sales";
import { prisma } from "@/lib/prisma";
import { storeAllocationPlanQuerySchema } from "@/lib/validation/store-allocation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requireStoreAllocationAccess();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = storeAllocationPlanQuerySchema.safeParse({
    sku: searchParams.get("sku") ?? "",
    takeQty: searchParams.get("takeQty") ?? "0",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { sku, takeQty } = parsed.data;

  const item = await prisma.productItem.findFirst({
    where: {
      companyId: auth.companyId,
      sku,
      status: { not: "archived" },
    },
    select: {
      sku: true,
      barcode: true,
      productTitle: true,
    },
  });
  if (!item?.sku) {
    return NextResponse.json({ error: "SKU not found" }, { status: 404 });
  }

  const columns = filterStoreAllocationColumns(await resolveOsfColumns(auth.companyId));

  const [qtyMap, ropRows, salesMap] = await Promise.all([
    computeTotalOrderQtyForSkus(auth.companyId, [sku]),
    prisma.productOsfRop.findMany({
      where: { companyId: auth.companyId, sku },
    }),
    salesByOsfColumnLast90d(auth.companyId, sku, columns),
  ]);

  const ropByKey = new Map(ropRows.map((r) => [r.columnKey, r.ropQty]));

  let erpAvailable = true;
  const binMap = new Map<string, number>();
  const warehousesByInstance = new Map<string, Set<string>>();
  for (const col of columns) {
    if (!col.erpnextInstanceId) continue;
    const set = warehousesByInstance.get(col.erpnextInstanceId) ?? new Set<string>();
    for (const wh of col.warehouses) set.add(wh);
    warehousesByInstance.set(col.erpnextInstanceId, set);
  }

  try {
    const erpInstances = await getAllOsfErpInstances(auth.companyId);
    await Promise.all(
      erpInstances.map(async (inst) => {
        const whs = [...(warehousesByInstance.get(inst.id) ?? [])];
        if (!whs.length) return;
        const bins = await fetchBinActualQty({
          cfg: inst.cfg,
          warehouses: whs,
          itemCodes: [sku],
        });
        for (const [key, qty] of bins) binMap.set(key, qty);
      }),
    );
  } catch (err) {
    erpAvailable = false;
    if (!(err instanceof OsfErpError)) {
      console.error("[store-allocation/plan] stock", err);
    }
  }

  const allocateInputs = columns.map((col) => {
    const locationRop = ropByKey.get(col.key);
    const rop = locationRop != null && Number.isFinite(locationRop) ? locationRop : 0;
    const stockRaw = stockForColumn(binMap, col.warehouses, sku);
    const stock = stockRaw != null && Number.isFinite(stockRaw) ? stockRaw : 0;
    const need = Math.max(0, Math.floor(rop) - Math.floor(stock));
    const sales90d = salesMap.get(col.key) ?? 0;
    return {
      columnKey: col.key,
      label: col.label,
      locationRop: rop,
      stock,
      need,
      sales90d,
    };
  });

  const suggestions = allocateTakeQty(
    takeQty,
    allocateInputs.map((r) => ({ key: r.columnKey, need: r.need, sales: r.sales90d })),
  );
  const suggestedByKey = new Map(suggestions.map((s) => [s.key, s.qty]));

  const companyReorderQty = qtyMap.get(sku) ?? 0;

  return NextResponse.json({
    sku: item.sku,
    description: item.productTitle ?? "",
    barcode: item.barcode,
    companyReorderQty,
    takeQty,
    shortShipment: takeQty > 0 && takeQty < companyReorderQty,
    erpAvailable,
    locations: allocateInputs.map((row) => ({
      ...row,
      suggestedQty: suggestedByKey.get(row.columnKey) ?? 0,
    })),
  });
}
