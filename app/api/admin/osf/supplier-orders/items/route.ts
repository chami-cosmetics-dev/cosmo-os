import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { computeTotalOrderQtyForSkus } from "@/lib/osf/supplier-orders-reorder";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { osfSupplierOrdersItemsQuerySchema } from "@/lib/validation/osf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function canUseSupplierOrders(context: NonNullable<Awaited<ReturnType<typeof getCurrentUserContext>>>) {
  return (
    hasPermission(context, "purchasing.osf.read") ||
    hasPermission(context, "purchasing.osf.manage") ||
    hasPermission(context, "purchasing.tools.read") ||
    hasPermission(context, "purchasing.tools.manage")
  );
}

export async function GET(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseSupplierOrders(context)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = context.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = osfSupplierOrdersItemsQuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    vendorId: searchParams.get("vendorId") ?? undefined,
    priority: searchParams.get("priority") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { q, vendorId, priority, page, pageSize } = parsed.data;
  const where: Prisma.ProductItemWhereInput = {
    companyId,
    sku: { not: null },
    status: { not: "archived" },
  };
  if (vendorId) where.vendorId = vendorId;

  const priorityTrim = priority?.trim();
  if (priorityTrim) {
    where.OR = [
      { erp1ProductPriority: priorityTrim },
      { erp2ProductPriority: priorityTrim },
    ];
  }

  const qTrim = q?.trim();
  if (qTrim) {
    const qFilter: Prisma.ProductItemWhereInput = {
      OR: [
        { sku: { contains: qTrim, mode: "insensitive" } },
        { productTitle: { contains: qTrim, mode: "insensitive" } },
      ],
    };
    where.AND = Array.isArray(where.AND)
      ? [...where.AND, qFilter]
      : where.AND
        ? [where.AND, qFilter]
        : [qFilter];
  }

  const [total, rows] = await Promise.all([
    prisma.productItem.count({ where }),
    prisma.productItem.findMany({
      where,
      orderBy: [{ sku: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        sku: true,
        productTitle: true,
        vendorId: true,
        vendor: { select: { id: true, name: true } },
      },
    }),
  ]);

  const skus = rows.map((r) => r.sku!).filter(Boolean);
  let qtyMap = new Map<string, number>();
  try {
    qtyMap = await computeTotalOrderQtyForSkus(companyId, skus);
  } catch (err) {
    console.error("[osf supplier-orders/items] reorder qty", err);
  }

  const items = rows
    .filter((r) => r.sku)
    .map((r) => ({
      sku: r.sku!,
      description: r.productTitle ?? "",
      vendorId: r.vendorId ?? r.vendor?.id ?? "",
      vendorName: r.vendor?.name ?? "",
      reorderQty: qtyMap.get(r.sku!) ?? 0,
    }));

  return NextResponse.json({
    items,
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
  });
}
