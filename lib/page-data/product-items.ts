import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cuidSchema } from "@/lib/validation";
import { maybeLogSlowDbRequest } from "@/lib/dbObservability";

export type ProductItemsPageParams = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  locationId?: string | null;
  vendorId?: string | null;
  categoryId?: string | null;
  search?: string | null;
};

export async function fetchProductItemsPageData(companyId: string, params: ProductItemsPageParams = {}) {
  const startedAt = Date.now();
  const page = params.page ?? 1;
  const limit = params.limit ?? 10;
  const sortOrder = params.sortOrder ?? "asc";
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
    params.sortBy && params.sortBy in SORT_FIELDS
      ? (SORT_FIELDS[params.sortBy] as Prisma.ProductItemOrderByWithRelationInput | Prisma.ProductItemOrderByWithRelationInput[])
      : defaultOrderBy;

  const where: Prisma.ProductItemWhereInput = {
    companyId,
  };

  if (params.locationId) {
    const idResult = cuidSchema.safeParse(params.locationId);
    if (idResult.success) {
      where.companyLocationId = idResult.data;
    }
  }

  if (params.vendorId) {
    const idResult = cuidSchema.safeParse(params.vendorId);
    if (idResult.success) {
      where.vendorId = idResult.data;
    }
  }

  if (params.categoryId) {
    const idResult = cuidSchema.safeParse(params.categoryId);
    if (idResult.success) {
      where.categoryId = idResult.data;
    }
  }

  if (params.search) {
    where.OR = [
      { productTitle: { contains: params.search, mode: "insensitive" } },
      { variantTitle: { contains: params.search, mode: "insensitive" } },
      { sku: { contains: params.search, mode: "insensitive" } },
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

  const [total, rawItems] = itemsResult;

  const items = rawItems.map((item) => ({
    ...item,
    price: item.price.toString(),
    compareAtPrice: item.compareAtPrice?.toString() ?? null,
    companyLocation: item.companyLocation ? { name: item.companyLocation.name } : null,
  }));

  maybeLogSlowDbRequest("product_items.page_data", startedAt, {
    companyId,
    page,
    limit,
    total,
  });

  return {
    items,
    total,
    page,
    limit,
    locations,
    vendors,
    categories,
  };
}
