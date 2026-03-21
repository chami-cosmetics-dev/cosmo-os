import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

const DEFAULT_LIMIT = 2000;
const MAX_LIMIT = 5000;
const DASHBOARD_LIVE_TTL_MS = 20_000;

const dashboardLiveCache = new Map<
  string,
  { data: unknown; timestamp: number }
>();

export async function GET(request: NextRequest) {
  const auth = await requirePermission("orders.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitParam)
    ? Math.min(MAX_LIMIT, Math.max(100, Math.trunc(limitParam)))
    : DEFAULT_LIMIT;

  const cacheKey = `${companyId}:${limit}`;
  const cached = dashboardLiveCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < DASHBOARD_LIVE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: {
        "Cache-Control": "private, max-age=20, stale-while-revalidate=40",
      },
    });
  }

  const orders = await prisma.order.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      totalPrice: true,
      createdAt: true,
      sourceName: true,
      fulfillmentStage: true,
      companyLocation: { select: { name: true } },
      assignedMerchant: { select: { name: true, email: true } },
    },
  });

  const data = {
    orders: orders.map((order) => ({
      id: order.id,
      totalPrice: order.totalPrice.toString(),
      createdAt: order.createdAt.toISOString(),
      sourceName: order.sourceName,
      fulfillmentStage: order.fulfillmentStage,
      companyLocation: order.companyLocation
        ? { name: order.companyLocation.name }
        : null,
      assignedMerchant: order.assignedMerchant
        ? { name: order.assignedMerchant.name, email: order.assignedMerchant.email }
        : null,
    })),
    limit,
  };

  dashboardLiveCache.set(cacheKey, { data, timestamp: now });

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "private, max-age=20, stale-while-revalidate=40",
    },
  });
}
