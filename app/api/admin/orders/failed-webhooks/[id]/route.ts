import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const failed = await prisma.failedOrderWebhook.findUnique({
    where: { id: idResult.data },
    include: {
      companyLocation: {
        select: { id: true, name: true, shopifyLocationId: true, shopifyShopName: true, shopifyAdminStoreHandle: true },
      },
    },
  });

  if (!failed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  if (user?.companyId !== failed.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: failed.id,
    shopifyOrderId: failed.shopifyOrderId,
    shopifyTopic: failed.shopifyTopic,
    errorMessage: failed.errorMessage,
    errorStack: failed.errorStack,
    rawPayload: failed.rawPayload,
    createdAt: failed.createdAt.toISOString(),
    resolvedAt: failed.resolvedAt?.toISOString() ?? null,
    companyLocation: failed.companyLocation,
    shopifyAdminOrderUrl: (() => {
      const handle = failed.companyLocation.shopifyAdminStoreHandle ?? failed.companyLocation.shopifyShopName;
      return handle
        ? `https://admin.shopify.com/store/${handle}/orders/${failed.shopifyOrderId}`
        : null;
    })(),
  });
}
