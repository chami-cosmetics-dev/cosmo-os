import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { PRODUCT_ITEM_STATUS_META } from "@/lib/product-item-status";
import { requireStoreAllocationAccess } from "@/lib/store-allocation/auth";
import { prisma } from "@/lib/prisma";
import { LIMITS, trimmedString } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sku: trimmedString(1, LIMITS.sku.max),
});

/**
 * Store allocation: acknowledge a DISCONTINUE item by flipping it to Newly Added
 * so take-qty / split can proceed.
 */
export async function POST(request: NextRequest) {
  const auth = await requireStoreAllocationAccess();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const item = await prisma.productItem.findFirst({
    where: {
      companyId: auth.companyId,
      sku: parsed.data.sku,
      status: { not: "archived" },
    },
    select: {
      id: true,
      sku: true,
      itemStatusCategory: true,
      itemStatusLabel: true,
    },
  });

  if (!item?.sku) {
    return NextResponse.json({ error: "SKU not found" }, { status: 404 });
  }

  if (item.itemStatusCategory !== "DISCONTINUE") {
    return NextResponse.json({
      sku: item.sku,
      itemStatusCategory: item.itemStatusCategory,
      itemStatusLabel: item.itemStatusLabel,
      alreadyContinued: true,
    });
  }

  const newly = PRODUCT_ITEM_STATUS_META.NEWLY_ADDED;
  const updated = await prisma.productItem.update({
    where: { id: item.id },
    data: {
      itemStatusCategory: newly.category,
      itemStatusLabel: newly.label,
    },
    select: {
      sku: true,
      itemStatusCategory: true,
      itemStatusLabel: true,
    },
  });

  await writeAuditLog({
    companyId: auth.companyId,
    actorUserId: auth.context.user?.id,
    module: "store-allocation",
    action: "discontinue_continued",
    entityType: "ProductItem",
    entityId: item.id,
    summary: `Continued discontinued SKU ${item.sku} → Newly Added`,
    beforeData: {
      itemStatusCategory: item.itemStatusCategory,
      itemStatusLabel: item.itemStatusLabel,
    },
    afterData: {
      itemStatusCategory: updated.itemStatusCategory,
      itemStatusLabel: updated.itemStatusLabel,
    },
  });

  return NextResponse.json({
    sku: updated.sku,
    itemStatusCategory: updated.itemStatusCategory,
    itemStatusLabel: updated.itemStatusLabel,
    alreadyContinued: false,
  });
}
