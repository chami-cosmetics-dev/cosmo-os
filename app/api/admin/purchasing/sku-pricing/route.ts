import { NextRequest, NextResponse } from "next/server";

import { fetchLatestCostAndSupplier, OsfErpError } from "@/lib/osf/erp-cost-supplier";
import { mergeInstanceErpData, type InstanceErpData } from "@/lib/osf/erp-merge";
import { fetchLastPurchaseByItem } from "@/lib/osf/erp-purchases";
import { getAllOsfErpInstances } from "@/lib/osf/erp-stock";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { LIMITS } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
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
  const companyId = context.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? searchParams.get("sku") ?? "").trim().slice(0, LIMITS.sku.max);
  if (!q) {
    return NextResponse.json({ items: [] });
  }

  const products = await prisma.productItem.findMany({
    where: {
      companyId,
      sku: { not: null },
      OR: [
        { sku: { contains: q, mode: "insensitive" } },
        { productTitle: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 80,
    select: {
      sku: true,
      productTitle: true,
      price: true,
      compareAtPrice: true,
      vendor: { select: { name: true } },
    },
  });

  const bySku = new Map<
    string,
    {
      sku: string;
      productTitle: string;
      brand: string | null;
      discountedPrice: number | null;
      mrp: number | null;
    }
  >();
  for (const p of products) {
    const sku = p.sku?.trim();
    if (!sku || bySku.has(sku)) continue;
    bySku.set(sku, {
      sku,
      productTitle: p.productTitle,
      brand: p.vendor?.name ?? null,
      discountedPrice: p.price != null ? Number(p.price) : null,
      mrp: p.compareAtPrice != null ? Number(p.compareAtPrice) : null,
    });
  }

  const skus = [...bySku.keys()].slice(0, 30);
  if (skus.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const suppliers = await prisma.supplier.findMany({
    where: { companyId },
    select: { name: true, code: true },
  });

  const erpInstances = await getAllOsfErpInstances(companyId);
  let costMap = new Map<string, { cost: number | null; supplier: string | null }>();
  let purchaseMap = new Map<
    string,
    {
      supplier: string | null;
      qty: number | null;
      rate: number | null;
      date: string | null;
      recentQty: number | null;
    }
  >();

  try {
    if (erpInstances.length > 0) {
      const perInstance: InstanceErpData[] = await Promise.all(
        erpInstances.map(async (inst) => {
          const [costs, purchases] = await Promise.all([
            fetchLatestCostAndSupplier({ cfg: inst.cfg, itemCodes: skus }),
            fetchLastPurchaseByItem({
              cfg: inst.cfg,
              itemCodes: skus,
              allowedSuppliers: suppliers,
            }),
          ]);
          return { costs, purchases };
        }),
      );
      const merged = mergeInstanceErpData(skus, perInstance);
      costMap = merged.costMap;
      purchaseMap = merged.purchaseMap;
    }
  } catch (err) {
    if (!(err instanceof OsfErpError)) throw err;
    console.error("[purchasing sku-pricing] ERP", err.message);
  }

  const items = skus.map((sku) => {
    const catalog = bySku.get(sku)!;
    const purchase = purchaseMap.get(sku);
    const costInfo = costMap.get(sku);
    const latestCost = costInfo?.cost ?? purchase?.rate ?? null;
    const latestSupplier = purchase?.supplier ?? costInfo?.supplier ?? null;
    let costSource: "item_rate" | "purchase_receipt" | null = null;
    if (costInfo?.cost != null) costSource = "item_rate";
    else if (purchase?.rate != null) costSource = "purchase_receipt";
    return {
      sku: catalog.sku,
      productTitle: catalog.productTitle,
      brand: catalog.brand,
      discountedPrice: catalog.discountedPrice,
      mrp: catalog.mrp,
      latestCost,
      latestSupplier,
      costSource,
    };
  });

  return NextResponse.json({ items });
}
