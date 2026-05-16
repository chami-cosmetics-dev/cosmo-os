import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getProductItemStatusMeta } from "@/lib/product-item-status";
import { requirePermission } from "@/lib/rbac";

function toAcademyProductName(productTitle: string) {
  return productTitle
    .replace(/\s+\d+(?:\.\d+)?\s*(?:ml|l|g|kg|mg|oz|pcs|pc|tabs|tablets|caps|capsules)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("products.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
  if (search.length < 2) {
    return NextResponse.json({ items: [] });
  }

  const where: Prisma.ProductItemWhereInput = {
    companyId,
    OR: [
      { productTitle: { contains: search, mode: "insensitive" } },
      { variantTitle: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
    ],
  };

  const rawItems = await prisma.productItem.findMany({
    where,
    orderBy: [{ productTitle: "asc" }, { variantTitle: "asc" }],
    take: 60,
    select: {
      id: true,
      shopifyProductId: true,
      productTitle: true,
      variantTitle: true,
      sku: true,
      imageUrl: true,
      itemStatusCategory: true,
      itemStatusLabel: true,
      vendor: { select: { name: true } },
      category: { select: { name: true } },
    },
  });

  const groupedItems = new Map<string, (typeof rawItems)[number]>();
  for (const item of rawItems) {
    const productKey =
      item.shopifyProductId || toAcademyProductName(item.productTitle).toLowerCase();
    const existing = groupedItems.get(productKey);
    if (!existing) {
      groupedItems.set(productKey, item);
      continue;
    }

    const existingHasImage = Boolean(existing.imageUrl);
    const itemHasImage = Boolean(item.imageUrl);
    const existingHasSku = Boolean(existing.sku);
    const itemHasSku = Boolean(item.sku);
    if ((!existingHasImage && itemHasImage) || (!existingHasSku && itemHasSku)) {
      groupedItems.set(productKey, item);
    }
  }

  const items = Array.from(groupedItems.values()).slice(0, 12);

  const productKeys = Array.from(
    new Set(items.map((item) => item.shopifyProductId || item.id))
  );
  const explainedKeys =
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
  const explainedKeySet = new Set(explainedKeys.map((item) => item.productKey));

  return NextResponse.json({
    items: items.map((item) => {
      const statusMeta = getProductItemStatusMeta(item.itemStatusCategory);
      return {
        ...item,
        academyProductTitle: toAcademyProductName(item.productTitle),
        priorityLabel: item.itemStatusLabel || statusMeta.label,
        brandPriority: statusMeta.brandPriority,
        productPriority: statusMeta.productPriority,
        lifecycle: statusMeta.lifecycle,
        hasExplanation: explainedKeySet.has(item.shopifyProductId || item.id),
      };
    }),
  });
}
