import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, LIMITS, trimmedString } from "@/lib/validation";
import { z } from "zod";

const querySchema = z.object({
  location_id: cuidSchema,
  q: trimmedString(1, LIMITS.productTitle.max),
  limit: z.coerce.number().int().min(1).max(100).optional().default(80),
});

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

  const parsed = querySchema.safeParse({
    location_id: request.nextUrl.searchParams.get("location_id")?.trim(),
    q: request.nextUrl.searchParams.get("q")?.trim() ?? "",
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { location_id: locationId, q, limit } = parsed.data;

  const location = await prisma.companyLocation.findFirst({
    where: { id: locationId, companyId },
    select: { id: true },
  });
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const term = q.trim();
  const where: Prisma.ProductItemWhereInput = {
    companyId,
    companyLocationId: locationId,
    OR: [
      { productTitle: { contains: term, mode: "insensitive" } },
      { variantTitle: { contains: term, mode: "insensitive" } },
      { sku: { contains: term, mode: "insensitive" } },
    ],
  };

  const items = await prisma.productItem.findMany({
    where,
    orderBy: [{ productTitle: "asc" }, { variantTitle: "asc" }],
    select: {
      id: true,
      productTitle: true,
      variantTitle: true,
      sku: true,
      price: true,
      compareAtPrice: true,
    },
    take: limit,
  });

  return NextResponse.json({
    productItems: items.map((p) => ({
      id: p.id,
      productTitle: p.productTitle,
      variantTitle: p.variantTitle,
      sku: p.sku,
      price: p.price.toString(),
      compareAtPrice: p.compareAtPrice?.toString() ?? null,
    })),
  });
}
