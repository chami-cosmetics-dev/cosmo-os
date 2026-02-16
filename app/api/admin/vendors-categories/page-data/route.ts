import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import type { Prisma } from "@prisma/client";
import { limitSchema, pageSchema, sortOrderSchema } from "@/lib/validation";

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

  const vendorsPage = pageSchema.safeParse(request.nextUrl.searchParams.get("vendors_page"));
  const vendorsLimit = limitSchema.safeParse(request.nextUrl.searchParams.get("vendors_limit"));
  const vendorsSortBy = request.nextUrl.searchParams.get("vendors_sort_by")?.trim();
  const vendorsSortOrderResult = sortOrderSchema.safeParse(
    request.nextUrl.searchParams.get("vendors_sort_order")
  );
  const categoriesPage = pageSchema.safeParse(request.nextUrl.searchParams.get("categories_page"));
  const categoriesLimit = limitSchema.safeParse(request.nextUrl.searchParams.get("categories_limit"));
  const categoriesSortBy = request.nextUrl.searchParams.get("categories_sort_by")?.trim();
  const categoriesSortOrderResult = sortOrderSchema.safeParse(
    request.nextUrl.searchParams.get("categories_sort_order")
  );

  const vPage = vendorsPage.success ? vendorsPage.data : 1;
  const vLimit = vendorsLimit.success ? vendorsLimit.data : 10;
  const vSortOrder = vendorsSortOrderResult.success ? vendorsSortOrderResult.data : "asc";
  const cPage = categoriesPage.success ? categoriesPage.data : 1;
  const cLimit = categoriesLimit.success ? categoriesLimit.data : 10;
  const cSortOrder = categoriesSortOrderResult.success ? categoriesSortOrderResult.data : "asc";

  const vendorOrderBy: Prisma.VendorOrderByWithRelationInput =
    vendorsSortBy === "items"
      ? { productItems: { _count: vSortOrder } }
      : { name: vSortOrder };

  const categoryOrderBy: Prisma.CategoryOrderByWithRelationInput =
    categoriesSortBy === "items"
      ? { productItems: { _count: cSortOrder } }
      : categoriesSortBy === "full_name"
        ? { fullName: cSortOrder }
        : { name: cSortOrder };

  const [vendorsResult, categoriesResult] = await Promise.all([
    Promise.all([
      prisma.vendor.count({ where: { companyId } }),
      prisma.vendor.findMany({
        where: { companyId },
        orderBy: vendorOrderBy,
        skip: (vPage - 1) * vLimit,
        take: vLimit,
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { productItems: true } },
        },
      }),
    ]),
    Promise.all([
      prisma.category.count({ where: { companyId } }),
      prisma.category.findMany({
        where: { companyId },
        orderBy: categoryOrderBy,
        skip: (cPage - 1) * cLimit,
        take: cLimit,
        select: {
          id: true,
          name: true,
          fullName: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { productItems: true } },
        },
      }),
    ]),
  ]);

  const [vendorsTotal, vendors] = vendorsResult;
  const [categoriesTotal, categories] = categoriesResult;

  return NextResponse.json({
    vendors,
    vendorsTotal,
    vendorsPage: vPage,
    vendorsLimit: vLimit,
    vendorsSortBy: vendorsSortBy ?? "name",
    vendorsSortOrder: vSortOrder,
    categories,
    categoriesTotal,
    categoriesPage: cPage,
    categoriesLimit: cLimit,
    categoriesSortBy: categoriesSortBy ?? "name",
    categoriesSortOrder: cSortOrder,
  });
}
