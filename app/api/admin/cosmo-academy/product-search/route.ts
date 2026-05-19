import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getProductFamilyName } from "@/lib/product-item-family";
import { getProductItemStatusMeta } from "@/lib/product-item-status";
import { requirePermission } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("academy.manage");
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

  type FamilySkuEntry = {
    sku: string;
    productTitle: string;
    variantTitle: string | null;
    itemStatusCategory: string;
    itemStatusLabel: string | null;
  };

  type GroupEntry = {
    representative: (typeof rawItems)[number];
    skus: Map<string, FamilySkuEntry>;
    productKeys: Set<string>;
  };

  // Group purely by family name — merges cross-origin variants like "Serum - Korea"
  // with the base "Serum" regardless of their shopifyProductId
  const grouped = new Map<string, GroupEntry>();
  for (const item of rawItems) {
    const familyKey = getProductFamilyName(item.productTitle).toLowerCase();
    const existing = grouped.get(familyKey);
    const skuEntry: FamilySkuEntry = {
      sku: item.sku!,
      productTitle: item.productTitle,
      variantTitle: item.variantTitle,
      itemStatusCategory: item.itemStatusCategory,
      itemStatusLabel: item.itemStatusLabel,
    };
    if (!existing) {
      const skus = new Map<string, FamilySkuEntry>();
      if (item.sku) skus.set(item.sku, skuEntry);
      const pKeys = new Set<string>();
      pKeys.add(item.shopifyProductId || item.id);
      grouped.set(familyKey, { representative: item, skus, productKeys: pKeys });
    } else {
      existing.productKeys.add(item.shopifyProductId || item.id);
      const rep = existing.representative;
      if ((!rep.imageUrl && item.imageUrl) || (!rep.sku && item.sku)) {
        existing.representative = item;
      }
      if (item.sku) existing.skus.set(item.sku, skuEntry);
    }
  }

  const groups = Array.from(grouped.values()).slice(0, 12);

  const allProductKeys = Array.from(new Set(groups.flatMap((g) => Array.from(g.productKeys))));
  const explainedKeys = allProductKeys.length > 0
    ? await prisma.cosmoAcademyExplanation.findMany({
        where: { companyId, productKey: { in: allProductKeys }, status: "published" },
        select: { productKey: true },
        distinct: ["productKey"],
      })
    : [];
  const explainedKeySet = new Set(explainedKeys.map((e) => e.productKey));

  return NextResponse.json({
    items: groups.map(({ representative: item, skus, productKeys: pKeys }) => {
      const statusMeta = getProductItemStatusMeta(item.itemStatusCategory);
      const hasExplanation = Array.from(pKeys).some((k) => explainedKeySet.has(k));
      return {
        ...item,
        academyProductTitle: getProductFamilyName(item.productTitle),
        priorityLabel: item.itemStatusLabel || statusMeta.label,
        brandPriority: statusMeta.brandPriority,
        productPriority: statusMeta.productPriority,
        lifecycle: statusMeta.lifecycle,
        hasExplanation,
        familySkus: Array.from(skus.values()).sort((a, b) => a.sku.localeCompare(b.sku)),
      };
    }),
  });
}
