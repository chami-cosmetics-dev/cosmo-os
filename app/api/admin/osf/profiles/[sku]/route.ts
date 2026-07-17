import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { osfProfilePatchSchema } from "@/lib/validation/osf";

const skuParamSchema = z.string().trim().min(1).max(100);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ sku: string }> },
) {
  const auth = await requirePermission("purchasing.osf.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { sku: rawSku } = await context.params;
  const skuParsed = skuParamSchema.safeParse(decodeURIComponent(rawSku));
  if (!skuParsed.success) {
    return NextResponse.json({ error: "Invalid SKU" }, { status: 400 });
  }
  const sku = skuParsed.data;

  const body = await request.json().catch(() => ({}));
  const parsed = osfProfilePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const catalog = await prisma.productItem.findFirst({
    where: { companyId, sku },
    select: { sku: true },
  });
  if (!catalog) {
    return NextResponse.json({ error: "SKU not found in catalog" }, { status: 404 });
  }

  const data = parsed.data;

  const profile = await prisma.productOsfProfile.upsert({
    where: { companyId_sku: { companyId, sku } },
    create: {
      companyId,
      sku,
      shopAvailability: data.shopAvailability === undefined ? null : data.shopAvailability,
      ogfPrice: data.ogfPrice === undefined ? null : data.ogfPrice,
    },
    update: {
      ...(data.shopAvailability !== undefined ? { shopAvailability: data.shopAvailability } : {}),
      ...(data.ogfPrice !== undefined ? { ogfPrice: data.ogfPrice } : {}),
    },
  });

  if (data.rops) {
    for (const [columnKey, ropQty] of Object.entries(data.rops)) {
      if (ropQty === null) {
        await prisma.productOsfRop.deleteMany({
          where: { companyId, sku, columnKey },
        });
        continue;
      }
      await prisma.productOsfRop.upsert({
        where: { companyId_sku_columnKey: { companyId, sku, columnKey } },
        create: { companyId, sku, columnKey, ropQty },
        update: { ropQty },
      });
    }
  }

  const rops = await prisma.productOsfRop.findMany({
    where: { companyId, sku },
  });
  const ropsMap: Record<string, number> = {};
  for (const r of rops) ropsMap[r.columnKey] = r.ropQty;

  return NextResponse.json({
    sku: profile.sku,
    shopAvailability: profile.shopAvailability,
    ogfPrice: profile.ogfPrice != null ? Number(profile.ogfPrice) : null,
    rops: ropsMap,
  });
}
