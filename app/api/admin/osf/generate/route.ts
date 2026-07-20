import { NextRequest, NextResponse } from "next/server";

import { buildOsfWorkbookBuffer, type OsfProfileData } from "@/lib/osf/build-workbook";
import { listOsfBuyers } from "@/lib/osf/buyer-config";
import { buildCatalogRows } from "@/lib/osf/catalog-rows";
import { resolveOsfColumns } from "@/lib/osf/column-config";
import { fetchLatestCostAndSupplier, OsfErpError } from "@/lib/osf/erp-cost-supplier";
import { mergeInstanceErpData, type InstanceErpData } from "@/lib/osf/erp-merge";
import { fetchLastPurchaseByItem } from "@/lib/osf/erp-purchases";
import { fetchBinActualQty, getAllOsfErpInstances } from "@/lib/osf/erp-stock";
import { aggregateMonthlySalesBySku } from "@/lib/osf/monthly-sales";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { osfGenerateBodySchema } from "@/lib/validation/osf";

function todayColombo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("purchasing.osf.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = osfGenerateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const asOfDate = parsed.data.asOfDate ?? todayColombo();
  const { salesMonth, includeInactive, vendorIds, itemStatusCategories, skuPrefix } = parsed.data;

  // "Recently purchased" window used to flag potential double-orders.
  const RECENT_PURCHASE_WINDOW_DAYS = 30;
  const recentSinceDate = new Date(
    Date.parse(`${asOfDate}T00:00:00Z`) - RECENT_PURCHASE_WINDOW_DAYS * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);

  const erpInstances = await getAllOsfErpInstances(companyId);
  if (erpInstances.length === 0) {
    return NextResponse.json(
      {
        error: "ERP credentials missing",
        code: "ERP_UNAVAILABLE",
        detail: "Configure an ERPNext instance for this company before generating OSF stock/cost.",
      },
      { status: 502 },
    );
  }

  try {
    const [catalog, columns, profiles, ropRows, monthlySales, buyers, allowedSuppliers] =
      await Promise.all([
        buildCatalogRows(companyId, {
          includeInactive,
          vendorIds,
          itemStatusCategories,
          skuPrefix,
        }),
        resolveOsfColumns(companyId),
        prisma.productOsfProfile.findMany({ where: { companyId } }),
        prisma.productOsfRop.findMany({ where: { companyId } }),
        aggregateMonthlySalesBySku(companyId, salesMonth),
        listOsfBuyers(companyId),
        prisma.supplier.findMany({
          where: { companyId },
          select: { name: true, code: true },
        }),
      ]);

    const profileMap = new Map<string, OsfProfileData>();
    for (const p of profiles) {
      profileMap.set(p.sku, {
        shopAvailability: p.shopAvailability,
        ogfPrice: p.ogfPrice != null ? Number(p.ogfPrice) : null,
        rops: {},
      });
    }
    for (const r of ropRows) {
      const entry = profileMap.get(r.sku) ?? {
        shopAvailability: null,
        ogfPrice: null,
        rops: {},
      };
      entry.rops[r.columnKey] = r.ropQty;
      profileMap.set(r.sku, entry);
    }

    const skus = catalog.map((c) => c.sku);

    // Stock columns can map to warehouses in different ERP instances, so group
    // each column's warehouses by its location's ERP instance.
    const warehousesByInstance = new Map<string, Set<string>>();
    for (const col of columns) {
      if (!col.active || !col.includeInStock || !col.erpnextInstanceId) continue;
      const set = warehousesByInstance.get(col.erpnextInstanceId) ?? new Set<string>();
      for (const wh of col.warehouses) set.add(wh);
      warehousesByInstance.set(col.erpnextInstanceId, set);
    }

    // Fetch stock (per-instance warehouses), cost, and purchases from every ERP
    // instance in parallel, then merge into company-wide maps.
    const perInstanceResults = await Promise.all(
      erpInstances.map(async (inst) => {
        const whs = [...(warehousesByInstance.get(inst.id) ?? [])];
        const [bins, costs, purchases] = await Promise.all([
          whs.length
            ? fetchBinActualQty({ cfg: inst.cfg, warehouses: whs, itemCodes: skus })
            : Promise.resolve(new Map<string, number>()),
          fetchLatestCostAndSupplier({ cfg: inst.cfg, itemCodes: skus }),
          fetchLastPurchaseByItem({
            cfg: inst.cfg,
            itemCodes: skus,
            recentSinceDate,
            allowedSuppliers,
          }),
        ]);
        return { bins, costs, purchases };
      }),
    );

    // Bin keys are `${warehouse}::${item}`; warehouse names are unique per
    // instance, so a plain union is safe.
    const binMap = new Map<string, number>();
    for (const { bins } of perInstanceResults) {
      for (const [key, qty] of bins) binMap.set(key, qty);
    }

    const perInstanceErp: InstanceErpData[] = perInstanceResults.map((r) => ({
      costs: r.costs,
      purchases: r.purchases,
    }));
    const { costMap, purchaseMap } = mergeInstanceErpData(skus, perInstanceErp);

    const buffer = buildOsfWorkbookBuffer({
      catalog,
      columns,
      profiles: profileMap,
      binMap,
      costMap,
      purchaseMap,
      monthlySales,
      salesMonth,
      asOfDate,
      buyers: buyers
        .filter((b) => b.active)
        .map((b) => ({ name: b.name, brands: b.brands })),
    });

    const filename = `OSF-${asOfDate}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
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
    console.error("[OSF generate]", err);
    return NextResponse.json({ error: "Failed to generate OSF" }, { status: 500 });
  }
}
