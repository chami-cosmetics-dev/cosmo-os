import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("purchasing.osf.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 50) || 50));
  const shopAvailability = searchParams.get("shop_availability");

  const productWhere = {
    companyId,
    sku: { not: null as string | null },
    ...(q
      ? {
          OR: [
            { sku: { contains: q, mode: "insensitive" as const } },
            { productTitle: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const products = await prisma.productItem.findMany({
    where: productWhere,
    orderBy: { updatedAt: "desc" },
    select: {
      sku: true,
      productTitle: true,
      vendor: { select: { name: true } },
    },
  });

  const bySku = new Map<string, { sku: string; productTitle: string; brand: string | null }>();
  for (const p of products) {
    const sku = p.sku?.trim();
    if (!sku || bySku.has(sku)) continue;
    bySku.set(sku, {
      sku,
      productTitle: p.productTitle,
      brand: p.vendor?.name ?? null,
    });
  }

  const skus = [...bySku.keys()];
  const profiles = await prisma.productOsfProfile.findMany({
    where: {
      companyId,
      sku: { in: skus },
      ...(shopAvailability === "allowed" || shopAvailability === "not_allowed"
        ? { shopAvailability }
        : {}),
    },
  });
  const profileBySku = new Map(profiles.map((p) => [p.sku, p]));

  const rops = await prisma.productOsfRop.findMany({
    where: { companyId, sku: { in: skus } },
  });
  const ropsBySku = new Map<string, Record<string, number>>();
  for (const r of rops) {
    const map = ropsBySku.get(r.sku) ?? {};
    map[r.columnKey] = r.ropQty;
    ropsBySku.set(r.sku, map);
  }

  let items = skus.map((sku) => {
    const catalog = bySku.get(sku)!;
    const profile = profileBySku.get(sku);
    return {
      sku,
      productTitle: catalog.productTitle,
      brand: catalog.brand,
      shopAvailability: profile?.shopAvailability ?? null,
      ogfPrice: profile?.ogfPrice != null ? Number(profile.ogfPrice) : null,
      reorderThresholdPercent: profile?.reorderThresholdPercent ?? null,
      rops: ropsBySku.get(sku) ?? {},
    };
  });

  if (shopAvailability === "allowed" || shopAvailability === "not_allowed") {
    items = items.filter((i) => i.shopAvailability === shopAvailability);
  }

  const total = items.length;
  const pageItems = items.slice((page - 1) * limit, page * limit);

  return NextResponse.json({ items: pageItems, total, page, limit });
}
