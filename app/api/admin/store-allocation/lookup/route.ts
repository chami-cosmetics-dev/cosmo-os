import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { computeTotalOrderQtyForSkus } from "@/lib/osf/supplier-orders-reorder";
import { requireStoreAllocationAccess } from "@/lib/store-allocation/auth";
import { prisma } from "@/lib/prisma";
import { storeAllocationLookupQuerySchema } from "@/lib/validation/store-allocation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requireStoreAllocationAccess();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = storeAllocationLookupQuerySchema.safeParse({
    q: searchParams.get("q") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const q = parsed.data.q.trim();

  const baseWhere: Prisma.ProductItemWhereInput = {
    companyId: auth.companyId,
    status: { not: "archived" },
    sku: { not: null },
  };

  const exactBarcode = await prisma.productItem.findFirst({
    where: { ...baseWhere, barcode: q },
    select: {
      sku: true,
      barcode: true,
      productTitle: true,
      erp1ProductPriority: true,
      erp2ProductPriority: true,
      itemStatusCategory: true,
      itemStatusLabel: true,
    },
  });

  if (exactBarcode?.sku) {
    const qtyMap = await computeTotalOrderQtyForSkus(auth.companyId, [exactBarcode.sku]);
    return NextResponse.json({
      item: {
        sku: exactBarcode.sku,
        barcode: exactBarcode.barcode,
        description: exactBarcode.productTitle ?? "",
        priorityErp1: exactBarcode.erp1ProductPriority,
        priorityErp2: exactBarcode.erp2ProductPriority,
        companyReorderQty: qtyMap.get(exactBarcode.sku) ?? 0,
        itemStatusCategory: exactBarcode.itemStatusCategory,
        itemStatusLabel: exactBarcode.itemStatusLabel,
      },
      matches: [],
    });
  }

  const exactSku = await prisma.productItem.findFirst({
    where: { ...baseWhere, sku: q },
    select: {
      sku: true,
      barcode: true,
      productTitle: true,
      erp1ProductPriority: true,
      erp2ProductPriority: true,
      itemStatusCategory: true,
      itemStatusLabel: true,
    },
  });

  if (exactSku?.sku) {
    const qtyMap = await computeTotalOrderQtyForSkus(auth.companyId, [exactSku.sku]);
    return NextResponse.json({
      item: {
        sku: exactSku.sku,
        barcode: exactSku.barcode,
        description: exactSku.productTitle ?? "",
        priorityErp1: exactSku.erp1ProductPriority,
        priorityErp2: exactSku.erp2ProductPriority,
        companyReorderQty: qtyMap.get(exactSku.sku) ?? 0,
        itemStatusCategory: exactSku.itemStatusCategory,
        itemStatusLabel: exactSku.itemStatusLabel,
      },
      matches: [],
    });
  }

  const partial = await prisma.productItem.findMany({
    where: {
      ...baseWhere,
      OR: [
        { sku: { contains: q, mode: "insensitive" } },
        { productTitle: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { sku: "asc" },
    take: 25,
    select: {
      sku: true,
      barcode: true,
      productTitle: true,
      erp1ProductPriority: true,
      erp2ProductPriority: true,
      itemStatusCategory: true,
      itemStatusLabel: true,
    },
  });

  const matches = partial
    .filter((p) => p.sku)
    .map((p) => ({
      sku: p.sku!,
      barcode: p.barcode,
      description: p.productTitle ?? "",
      priorityErp1: p.erp1ProductPriority,
      priorityErp2: p.erp2ProductPriority,
      itemStatusCategory: p.itemStatusCategory,
      itemStatusLabel: p.itemStatusLabel,
    }));

  if (matches.length === 1) {
    const only = matches[0]!;
    const qtyMap = await computeTotalOrderQtyForSkus(auth.companyId, [only.sku]);
    return NextResponse.json({
      item: {
        ...only,
        companyReorderQty: qtyMap.get(only.sku) ?? 0,
      },
      matches: [],
    });
  }

  return NextResponse.json({
    item: null,
    matches,
  });
}
