import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { fetchProductItemsPageData } from "@/lib/page-data/product-items";
import { requirePermission } from "@/lib/rbac";
import { limitSchema, pageSchema, sortOrderSchema } from "@/lib/validation";

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

  const searchParams = request.nextUrl.searchParams;
  const pageResult = pageSchema.safeParse(searchParams.get("page"));
  const limitResult = limitSchema.safeParse(searchParams.get("limit"));
  const sortOrderResult = sortOrderSchema.safeParse(searchParams.get("sort_order"));
  const usePaginatedShape =
    searchParams.has("page") || searchParams.has("limit");
  const data = await fetchProductItemsPageData(companyId, {
    page: pageResult.success ? pageResult.data : 1,
    limit: limitResult.success ? limitResult.data : 50,
    sortBy: searchParams.get("sort_by")?.trim() ?? undefined,
    sortOrder: sortOrderResult.success ? sortOrderResult.data : "asc",
    locationId: searchParams.get("location_id") ?? undefined,
    vendorId: searchParams.get("vendor_id") ?? undefined,
    categoryId: searchParams.get("category_id") ?? undefined,
    familyId: searchParams.get("family_id") ?? undefined,
    itemStatusCategory: searchParams.get("item_status_category") ?? undefined,
    search: searchParams.get("search")?.trim() ?? undefined,
  });

  if (!usePaginatedShape) {
    return NextResponse.json(data.items);
  }

  return NextResponse.json({
    items: data.items,
    total: data.total,
    page: data.page,
    limit: data.limit,
  });
}
