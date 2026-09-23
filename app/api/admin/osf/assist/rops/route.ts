import { NextRequest, NextResponse } from "next/server";

import { resolveOsfColumns } from "@/lib/osf/column-config";
import { isDiscontinuedForOsf } from "@/lib/osf/discontinued";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";
import { osfAssistRopsPutSchema } from "@/lib/validation/osf";

export async function PUT(request: NextRequest) {
  const auth = await requirePermission("purchasing.osf.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = osfAssistRopsPutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const columns = await resolveOsfColumns(companyId);
  const ropKeys = columns.filter((c) => c.active && c.includeInRop).map((c) => c.key);
  if (ropKeys.length === 0) {
    return NextResponse.json(
      { error: "No active includeInRop columns configured" },
      { status: 400 },
    );
  }

  const items = parsed.data.items;
  const skus = [...new Set(items.map((i) => i.sku.trim()).filter(Boolean))];
  const known = await prisma.productItem.findMany({
    where: {
      companyId,
      sku: { in: skus },
      status: { not: "archived" },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      sku: true,
      erp1ProductPriority: true,
      erp2ProductPriority: true,
      itemStatusCategory: true,
    },
  });
  const knownByLower = new Map<string, string>();
  const discontinuedByLower = new Set<string>();
  for (const row of known) {
    const s = row.sku?.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (knownByLower.has(key) || discontinuedByLower.has(key)) continue;
    if (!isVaultOsDeployment() && isDiscontinuedForOsf(row)) {
      discontinuedByLower.add(key);
      continue;
    }
    knownByLower.set(key, s);
  }

  let updatedSkus = 0;
  let updatedCells = 0;
  const errors: Array<{ sku: string; message: string }> = [];

  for (const item of items) {
    const skuInput = item.sku.trim();
    const key = skuInput.toLowerCase();
    if (discontinuedByLower.has(key)) {
      errors.push({ sku: skuInput, message: "Discontinued SKU — excluded from OSF" });
      continue;
    }
    const canonical = knownByLower.get(key);
    if (!canonical) {
      errors.push({ sku: skuInput, message: "Unknown SKU" });
      continue;
    }

    try {
      for (const columnKey of ropKeys) {
        await prisma.productOsfRop.upsert({
          where: {
            companyId_sku_columnKey: {
              companyId,
              sku: canonical,
              columnKey,
            },
          },
          create: {
            companyId,
            sku: canonical,
            columnKey,
            ropQty: item.ropQty,
          },
          update: { ropQty: item.ropQty },
        });
        updatedCells += 1;
      }
      updatedSkus += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      errors.push({ sku: skuInput, message: message.slice(0, 200) });
    }
  }

  return NextResponse.json({
    updatedSkus,
    updatedCells,
    errors,
  });
}
