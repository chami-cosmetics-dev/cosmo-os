import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { ensureVaultForceIncludedRops } from "@/lib/vault-osf/ensure-force-included-rops";
import { resolveVaultOsfManualSkuKey } from "@/lib/vault-osf/sku-policy";
import { osfProfilePatchSchema } from "@/lib/validation/osf";

const skuParamSchema = z.string().trim().min(1).max(100);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ sku: string }> },
) {
  const userContext = await getCurrentUserContext();
  if (!userContext?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const canOsfManage = hasPermission(userContext, "purchasing.osf.manage");
  const canToolsManage = hasPermission(userContext, "purchasing.tools.manage");
  if (!canOsfManage && !canToolsManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = userContext.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { sku: rawSku } = await context.params;
  const skuParsed = skuParamSchema.safeParse(decodeURIComponent(rawSku));
  if (!skuParsed.success) {
    return NextResponse.json({ error: "Invalid SKU" }, { status: 400 });
  }
  let sku = skuParsed.data;
  const manualKey = resolveVaultOsfManualSkuKey(sku);
  if (manualKey) sku = manualKey;

  const body = await request.json().catch(() => ({}));
  const parsed = osfProfilePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // tools.manage alone may only update threshold; full OSF fields need osf.manage
  if (!canOsfManage) {
    const onlyThreshold =
      data.reorderThresholdPercent !== undefined &&
      data.shopAvailability === undefined &&
      data.ogfPrice === undefined &&
      data.rops === undefined;
    if (!onlyThreshold) {
      return NextResponse.json(
        { error: "purchasing.osf.manage required to edit availability, OGF, or ROP" },
        { status: 403 },
      );
    }
  }

  const catalog = await prisma.productItem.findFirst({
    where: { companyId, sku },
    select: { sku: true },
  });
  // Vault yellow/blue SKUs may exist only in ERP / checked workbook, not ProductItem.
  if (!catalog && !(isVaultOsDeployment() && manualKey)) {
    return NextResponse.json({ error: "SKU not found in catalog" }, { status: 404 });
  }

  if (isVaultOsDeployment()) {
    await ensureVaultForceIncludedRops(companyId);
  }

  const profile = await prisma.productOsfProfile.upsert({
    where: { companyId_sku: { companyId, sku } },
    create: {
      companyId,
      sku,
      shopAvailability: data.shopAvailability === undefined ? null : data.shopAvailability,
      ogfPrice: data.ogfPrice === undefined ? null : data.ogfPrice,
      reorderThresholdPercent:
        data.reorderThresholdPercent === undefined ? null : data.reorderThresholdPercent,
    },
    update: {
      ...(data.shopAvailability !== undefined ? { shopAvailability: data.shopAvailability } : {}),
      ...(data.ogfPrice !== undefined ? { ogfPrice: data.ogfPrice } : {}),
      ...(data.reorderThresholdPercent !== undefined
        ? { reorderThresholdPercent: data.reorderThresholdPercent }
        : {}),
    },
  });

  if (data.rops && canOsfManage) {
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
    reorderThresholdPercent: profile.reorderThresholdPercent,
    rops: ropsMap,
  });
}
