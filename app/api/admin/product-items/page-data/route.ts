import { NextRequest, NextResponse } from "next/server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, limitSchema, pageSchema, sortOrderSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("products.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  const companyId = user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const locationId = request.nextUrl.searchParams.get("location_id");
  const vendorId = request.nextUrl.searchParams.get("vendor_id");
  const categoryId = request.nextUrl.searchParams.get("category_id");
  const search = request.nextUrl.searchParams.get("search")?.trim();

  const pageResult = pageSchema.safeParse(request.nextUrl.searchParams.get("page"));
  const limitResult = limitSchema.safeParse(request.nextUrl.searchParams.get("limit"));
  const sortBy = request.nextUrl.searchParams.get("sort_by")?.trim();
  const sortOrderResult = sortOrderSchema.safeParse(request.nextUrl.searchParams.get("sort_order"));
  const page = pageResult.success ? pageResult.data : 1;
  const limit = limitResult.success ? limitResult.data : 10;
  const sortOrder = sortOrderResult.success ? sortOrderResult.data : "asc";
  const skip = (page - 1) * limit;

  const SORT_FIELDS: Record<string, Prisma.ProductItemOrderByWithRelationInput | Prisma.ProductItemOrderByWithRelationInput[]> = {
    product: [{ productTitle: sortOrder }, { variantTitle: sortOrder }],
    sku: { sku: sortOrder },
    price: { price: sortOrder },
    compare_at: { compareAtPrice: sortOrder },
    vendor: { vendor: { name: sortOrder } },
    category: { category: { name: sortOrder } },
    stock: { inventoryQuantity: sortOrder },
    location: { companyLocation: { name: sortOrder } },
  };
  const defaultOrderBy: Prisma.ProductItemOrderByWithRelationInput[] = [
    { productTitle: "asc" },
    { variantTitle: "asc" },
  ];
  const orderBy =
    sortBy && sortBy in SORT_FIELDS
      ? (SORT_FIELDS[sortBy] as Prisma.ProductItemOrderByWithRelationInput | Prisma.ProductItemOrderByWithRelationInput[])
      : defaultOrderBy;

  const where: Prisma.ProductItemWhereInput = {
    companyId,
  };

  if (locationId) {
    const idResult = cuidSchema.safeParse(locationId);
    if (idResult.success) {
      where.companyLocationId = idResult.data;
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

  if (search) {
    where.OR = [
      { productTitle: { contains: search, mode: "insensitive" } },
      { variantTitle: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
    ];
  }

  const [itemsResult, locations, vendors, categories] = await Promise.all([
    Promise.all([
      prisma.productItem.count({ where }),
      prisma.productItem.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          vendor: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, fullName: true } },
          companyLocation: { select: { id: true, name: true, shopifyLocationId: true } },
        },
      }),
    ]),
    prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.vendor.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.category.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const [total, items] = itemsResult;

  return NextResponse.json({
    items,
    total,
    page,
    limit,
    locations,
    vendors,
    categories,
  });
}
