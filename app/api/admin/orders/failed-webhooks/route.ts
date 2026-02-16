import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { limitSchema, pageSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  const companyId = user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const pageResult = pageSchema.safeParse(request.nextUrl.searchParams.get("page"));
  const limitResult = limitSchema.safeParse(request.nextUrl.searchParams.get("limit"));
  const page = pageResult.success ? pageResult.data : 1;
  const limit = limitResult.success ? limitResult.data : 10;
  const skip = (page - 1) * limit;

  const [total, failed] = await Promise.all([
    prisma.failedOrderWebhook.count({
      where: { companyId, resolvedAt: null },
    }),
    prisma.failedOrderWebhook.findMany({
      where: { companyId, resolvedAt: null },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        companyLocation: {
          select: { id: true, name: true, shopifyLocationId: true, shopifyShopName: true },
        },
      },
    }),
  ]);

  const items = failed.map((f) => ({
    id: f.id,
    shopifyOrderId: f.shopifyOrderId,
    shopifyTopic: f.shopifyTopic,
    errorMessage: f.errorMessage,
    errorStack: f.errorStack,
    createdAt: f.createdAt.toISOString(),
    companyLocation: f.companyLocation,
  }));

  return NextResponse.json({
    items,
    total,
    page,
    limit,
  });
}
