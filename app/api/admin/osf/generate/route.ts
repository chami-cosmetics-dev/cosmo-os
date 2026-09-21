import { NextRequest, NextResponse } from "next/server";

import { buildOsfWorkbookBuffer, type OsfProfileData } from "@/lib/osf/build-workbook";
import { listOsfBuyers } from "@/lib/osf/buyer-config";
import { buildCatalogRows } from "@/lib/osf/catalog-rows";
import { resolveEffectiveOsfColumnKeys } from "@/lib/osf/column-visibility";
import { resolveOsfColumns } from "@/lib/osf/column-config";
import { fetchLatestCostAndSupplier, OsfErpError } from "@/lib/osf/erp-cost-supplier";
import { mergeInstanceErpData, type InstanceErpData } from "@/lib/osf/erp-merge";
import { fetchLastPurchaseByItem } from "@/lib/osf/erp-purchases";
import { fetchBinActualQty, getAllOsfErpInstances, stockForColumn } from "@/lib/osf/erp-stock";
import { aggregateMonthlySalesBySku } from "@/lib/osf/monthly-sales";
import { syncOgfPricesFromErp } from "@/lib/osf/sync-ogf-prices-from-erp";
import { isBelowReorderThreshold } from "@/lib/osf/threshold";
import { filterCatalogByOsfVariant, type OsfVariant } from "@/lib/osf/vat-membership";
import {
  findCosmeticsLkRopColumn,
  selectVatRopColumns,
  selectVatStockColumns,
  totalRopForColumns,
  totalRopForVat,
} from "@/lib/osf/vat-rop-columns";
import { ensureCosmeticsShopOsfColumns } from "@/lib/osf/shop-column-sync";
import { prisma } from "@/lib/prisma";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { getCurrentUserContext, hasPermission, requirePermission } from "@/lib/rbac";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { osfGenerateBodySchema } from "@/lib/validation/osf";

function todayColombo(): string {
  return formatAppIsoDate(new Date());
}

function osfDownloadFilename(variant: OsfVariant, asOfDate: string, belowThresholdOnly: boolean): string {
  if (belowThresholdOnly) {
    if (variant === "vat") return `OSF-reorder-vat-items-${asOfDate}.xlsx`;
    if (variant === "non_vat") return `OSF-reorder-non-vat-${asOfDate}.xlsx`;
    return `OSF-reorder-${asOfDate}.xlsx`;
  }
  if (variant === "vat") return `OSF-vat-items-${asOfDate}.xlsx`;
  if (variant === "non_vat") return `OSF-non-vat-${asOfDate}.xlsx`;
  return `OSF-${asOfDate}.xlsx`;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = osfGenerateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const belowThresholdOnly = parsed.data.belowThresholdOnly === true;
  const osfVariant = parsed.data.osfVariant ?? "main";

  if (belowThresholdOnly) {
    const context = await getCurrentUserContext();
    if (!context?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const canTools =
      hasPermission(context, "purchasing.tools.read") ||
      hasPermission(context, "purchasing.tools.manage");
    if (!canTools) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    const auth = await requirePermission("purchasing.osf.read");
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
  }

  if (isVaultOsDeployment()) {
    return NextResponse.json(
      {
        error: "Cosmo OSF is not available on Vault OS",
        code: "COSMO_OSF_NOT_ON_VAULT",
      },
      { status: 409 },
    );
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const asOfDate = parsed.data.asOfDate ?? todayColombo();
  const {
    salesMonth,
    includeInactive,
    vendorIds,
    itemStatusCategories,
    skuPrefix,
    maxStockPctOfRop,
  } = parsed.data;

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

  // Refresh OSF ogfPrice from Cosmo ERP OGF Price List before workbook build.
  await syncOgfPricesFromErp(companyId);

  try {
    // Ensure Cosmetics shop warehouses from ERP1 exist as OSF columns before resolve.
    try {
      await ensureCosmeticsShopOsfColumns(companyId);
    } catch (err) {
      if (!(err instanceof OsfErpError)) throw err;
      // Shop sync failure should not block generate if columns already exist; surface only if no columns later.
      console.warn("[OSF] shop column sync failed:", err.message);
    }

    const [catalogRaw, columns, profiles, ropRows, monthlySales, buyers, allowedSuppliers] =
      await Promise.all([
        buildCatalogRows(companyId, {
          includeInactive,
          vendorIds,
          // Variant membership is authoritative for vat / non_vat.
          itemStatusCategories: osfVariant === "main" ? itemStatusCategories : undefined,
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
        reorderThresholdPercent: p.reorderThresholdPercent,
        rops: {},
      });
    }
    for (const r of ropRows) {
      const entry = profileMap.get(r.sku) ?? {
        shopAvailability: null,
        ogfPrice: null,
        reorderThresholdPercent: null,
        rops: {},
      };
      entry.rops[r.columnKey] = r.ropQty;
      profileMap.set(r.sku, entry);
    }

    let catalog = filterCatalogByOsfVariant(catalogRaw, osfVariant);
    let skus = catalog.map((c) => c.sku);

    const warehousesByInstance = new Map<string, Set<string>>();
    for (const col of columns) {
      if (!col.active || !col.includeInStock || !col.erpnextInstanceId) continue;
      const set = warehousesByInstance.get(col.erpnextInstanceId) ?? new Set<string>();
      for (const wh of col.warehouses) set.add(wh);
      warehousesByInstance.set(col.erpnextInstanceId, set);
    }

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

    const binMap = new Map<string, number>();
    for (const { bins } of perInstanceResults) {
      for (const [key, qty] of bins) binMap.set(key, qty);
    }

    if (belowThresholdOnly || maxStockPctOfRop != null) {
      const stockCols =
        osfVariant === "vat"
          ? selectVatStockColumns(columns)
          : columns.filter((c) => c.active && c.includeInStock);
      const mainRopCols = columns.filter((c) => c.active && c.includeInRop);
      const vatRopCols = selectVatRopColumns(columns);
      const cosmeticsLkKey = findCosmeticsLkRopColumn(vatRopCols)?.key ?? null;
      catalog = catalog.filter((row) => {
        let totalStock = 0;
        for (const col of stockCols) {
          const qty = stockForColumn(binMap, col.warehouses, row.sku);
          if (qty != null) totalStock += qty;
        }
        const profile = profileMap.get(row.sku);
        const totalRop =
          osfVariant === "vat"
            ? totalRopForVat(profile?.rops, cosmeticsLkKey)
            : totalRopForColumns(profile?.rops, mainRopCols);
        const belowSkuThreshold = isBelowReorderThreshold(
          totalStock,
          totalRop,
          profile?.reorderThresholdPercent ?? null,
        );
        const belowMaxPct =
          maxStockPctOfRop == null ||
          isBelowReorderThreshold(totalStock, totalRop, maxStockPctOfRop);
        if (belowThresholdOnly && maxStockPctOfRop != null) {
          return belowSkuThreshold && belowMaxPct;
        }
        if (belowThresholdOnly) return belowSkuThreshold;
        return belowMaxPct;
      });
      skus = catalog.map((c) => c.sku);
    }

    const perInstanceErp: InstanceErpData[] = perInstanceResults.map((r) => ({
      costs: r.costs,
      purchases: r.purchases,
    }));
    const { costMap, purchaseMap } = mergeInstanceErpData(skus, perInstanceErp);

    const effectiveColumnKeys = context?.user
      ? await resolveEffectiveOsfColumnKeys(context, companyId, osfVariant)
      : new Set<string>();

    const buffer = await buildOsfWorkbookBuffer({
      catalog,
      columns,
      profiles: profileMap,
      binMap,
      costMap,
      purchaseMap,
      monthlySales,
      salesMonth,
      asOfDate,
      belowThresholdOnly,
      effectiveColumnKeys,
      osfVariant,
      buyers: buyers
        .filter((b) => b.active)
        .map((b) => ({ name: b.name, brands: b.brands })),
    });

    const filename = osfDownloadFilename(osfVariant, asOfDate, belowThresholdOnly);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-OSF-Row-Count": String(catalog.length),
        "X-OSF-Variant": osfVariant,
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
