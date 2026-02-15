import { NextRequest, NextResponse } from "next/server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

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
  const search = request.nextUrl.searchParams.get("search")?.trim();

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

  const items = await prisma.productItem.findMany({
    where,
    orderBy: [{ productTitle: "asc" }, { variantTitle: "asc" }],
    include: {
      vendor: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, fullName: true } },
      companyLocation: { select: { id: true, name: true, shopifyLocationId: true } },
    },
  });

  return NextResponse.json(items);
}
