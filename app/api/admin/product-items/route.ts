import { NextRequest, NextResponse } from "next/server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { getShadowSourceLocationId } from "@/lib/shadow-location-products";
import { cuidSchema, limitSchema, pageSchema } from "@/lib/validation";
import { PRODUCT_ITEM_STATUS_CATEGORIES } from "@/lib/product-item-status";

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("products.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const locationId = request.nextUrl.searchParams.get("location_id");
  const vendorId = request.nextUrl.searchParams.get("vendor_id");
  const categoryId = request.nextUrl.searchParams.get("category_id");
  const itemStatusCategory = request.nextUrl.searchParams.get("item_status_category");
  const search = request.nextUrl.searchParams.get("search")?.trim();
  const pageResult = pageSchema.safeParse(request.nextUrl.searchParams.get("page"));
  const limitResult = limitSchema.safeParse(request.nextUrl.searchParams.get("limit"));
  const usePaginatedShape =
    request.nextUrl.searchParams.has("page") || request.nextUrl.searchParams.has("limit");
  const page = pageResult.success ? pageResult.data : 1;
  const limit = limitResult.success ? limitResult.data : 50;
  const skip = (page - 1) * limit;

  const where: Prisma.ProductItemWhereInput = {
    companyId,
  };

  if (locationId) {
    const idResult = cuidSchema.safeParse(locationId);
    if (idResult.success) {
      const location = await prisma.companyLocation.findFirst({
        where: { id: idResult.data, companyId },
        select: { id: true, shadowParentLocationId: true },
      });
      where.companyLocationId = location
        ? getShadowSourceLocationId(location)
        : idResult.data;
    }
  }

  if (vendorId) {
    const idResult = cuidSchema.safeParse(vendorId);
    if (idResult.success) {
      where.vendorId = idResult.data;
    }
  }

  if (categoryId) {
    const idResult = cuidSchema.safeParse(categoryId);
    if (idResult.success) {
      where.categoryId = idResult.data;
    }
  }

  if (
    itemStatusCategory &&
    (PRODUCT_ITEM_STATUS_CATEGORIES as readonly string[]).includes(itemStatusCategory)
  ) {
    where.itemStatusCategory = itemStatusCategory;
  }

  if (search) {
    where.OR = [
      { productTitle: { contains: search, mode: "insensitive" } },
      { variantTitle: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.productItem.count({ where }),
    prisma.productItem.findMany({
      where,
      orderBy: [{ productTitle: "asc" }, { variantTitle: "asc" }],
      skip,
      take: limit,
      include: {
        vendor: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, fullName: true } },
        companyLocation: { select: { id: true, name: true, shopifyLocationId: true } },
      },
    }),
  ]);
  const productKeys = Array.from(
    new Set(items.map((item) => item.shopifyProductId || item.id))
  );
  const explainedProductKeys =
    productKeys.length > 0
      ? await prisma.cosmoAcademyExplanation.findMany({
          where: {
            companyId,
            productKey: { in: productKeys },
            status: "published",
          },
          select: { productKey: true },
          distinct: ["productKey"],
        })
      : [];
  const explainedProductKeySet = new Set(
    explainedProductKeys.map((item) => item.productKey)
  );
  const itemsWithExplanationStatus = items.map((item) => ({
    ...item,
    hasExplanation: explainedProductKeySet.has(item.shopifyProductId || item.id),
  }));

  if (!usePaginatedShape) {
    return NextResponse.json(itemsWithExplanationStatus);
  }

  return NextResponse.json({
    items: itemsWithExplanationStatus,
    total,
    page,
    limit,
  });
}
