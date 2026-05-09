import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

/** First page of products for manual order UI (avoid loading thousands of rows). */
const INITIAL_PRODUCT_LIMIT = 400;

export async function GET(request: NextRequest) {
  const auth = await requirePermission("orders.create_manual");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const idResult = cuidSchema.safeParse(
    request.nextUrl.searchParams.get("location_id")?.trim()
  );
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid location_id" }, { status: 400 });
  }

  const locationId = idResult.data;

  const location = await prisma.companyLocation.findFirst({
    where: { id: locationId, companyId },
    select: { id: true },
  });
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const [shippingCharges, productRows, totalProductItems] = await Promise.all([
    prisma.shippingChargeOption.findMany({
      where: { companyId, companyLocationId: locationId },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      select: { id: true, label: true, amount: true, sortOrder: true },
    }),
    prisma.productItem.findMany({
      where: { companyId, companyLocationId: locationId },
      orderBy: [{ productTitle: "asc" }, { variantTitle: "asc" }],
      select: {
        id: true,
        productTitle: true,
        variantTitle: true,
        sku: true,
        price: true,
        compareAtPrice: true,
      },
      take: INITIAL_PRODUCT_LIMIT,
    }),
    prisma.productItem.count({
      where: { companyId, companyLocationId: locationId },
    }),
  ]);

  return NextResponse.json({
    shippingCharges: shippingCharges.map((s) => ({
      id: s.id,
      label: s.label,
      amount: s.amount.toString(),
      sortOrder: s.sortOrder,
    })),
    productItems: productRows.map((p) => ({
      id: p.id,
      productTitle: p.productTitle,
      variantTitle: p.variantTitle,
      sku: p.sku,
      price: p.price.toString(),
      compareAtPrice: p.compareAtPrice?.toString() ?? null,
    })),
    totalProductItems,
    productItemsTruncated: totalProductItems > INITIAL_PRODUCT_LIMIT,
  });
}
