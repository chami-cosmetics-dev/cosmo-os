import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  getProductItemStatusMeta,
  PRODUCT_ITEM_STATUS_CATEGORIES,
} from "@/lib/product-item-status";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const item = await prisma.productItem.findFirst({
    where: { id: idResult.data, companyId },
    include: {
      vendor: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, fullName: true } },
      companyLocation: { select: { id: true, name: true, shopifyLocationId: true } },
    },
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("products.manage");
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

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    itemStatusCategory?: unknown;
  } | null;
  const itemStatusCategory =
    typeof body?.itemStatusCategory === "string" ? body.itemStatusCategory : "";

  if (!(PRODUCT_ITEM_STATUS_CATEGORIES as readonly string[]).includes(itemStatusCategory)) {
    return NextResponse.json({ error: "Invalid item status category" }, { status: 400 });
  }

  const existingItem = await prisma.productItem.findFirst({
    where: { id: idResult.data, companyId },
    select: { id: true, shopifyVariantId: true, sku: true },
  });

  if (!existingItem) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const groupedWhere = existingItem.shopifyVariantId
    ? { companyId, shopifyVariantId: existingItem.shopifyVariantId }
    : existingItem.sku?.trim()
      ? { companyId, sku: existingItem.sku.trim() }
      : { companyId, id: existingItem.id };

  const statusMeta = getProductItemStatusMeta(itemStatusCategory);
  const item = await prisma.productItem.updateMany({
    where: groupedWhere,
    data: {
      itemStatusCategory: statusMeta.category,
      itemStatusLabel: statusMeta.category === "UNCATEGORIZED" ? null : statusMeta.label,
    },
  });

  return NextResponse.json({
    id: idResult.data,
    updatedCount: item.count,
    itemStatusCategory: statusMeta.category,
    itemStatusLabel: statusMeta.category === "UNCATEGORIZED" ? null : statusMeta.label,
  });
}
