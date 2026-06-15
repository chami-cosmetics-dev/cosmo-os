import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { limitSchema, pageSchema } from "@/lib/validation";
import {
  buildFailedErpSyncWhere,
  runDueFailedErpSyncRetries,
  scheduleUnscheduledFailedErpSyncs,
} from "@/lib/failed-erp-sync-auto-retry";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("failed_webhooks.read");
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
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  try {
    await scheduleUnscheduledFailedErpSyncs(companyId, 50);
    await runDueFailedErpSyncRetries({ companyId, limit: 5 });
  } catch (error) {
    console.error("[Failed ERP sync auto-retry] Sweep failed during list request", {
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const pageResult = pageSchema.safeParse(request.nextUrl.searchParams.get("page"));
  const limitResult = limitSchema.safeParse(request.nextUrl.searchParams.get("limit"));
  const page = pageResult.success ? pageResult.data : 1;
  const limit = limitResult.success ? limitResult.data : 20;
  const skip = (page - 1) * limit;

  const where = buildFailedErpSyncWhere(companyId);

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { erpnextSyncFailedAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        orderNumber: true,
        shopifyOrderId: true,
        customerEmail: true,
        customerPhone: true,
        erpnextSyncError: true,
        erpnextSyncFailedAt: true,
        erpnextSyncAutoRetryCount: true,
        erpnextSyncNextAutoRetryAt: true,
        erpnextSyncLastAutoRetryAt: true,
        erpnextInvoiceId: true,
        createdAt: true,
        companyLocation: { select: { id: true, name: true } },
      },
    }),
  ]);

  const items = orders.map((o) => ({
    id: o.id,
    name: o.name,
    orderNumber: o.orderNumber,
    shopifyOrderId: o.shopifyOrderId,
    customerEmail: o.customerEmail,
    customerPhone: o.customerPhone,
    erpnextSyncError: o.erpnextSyncError,
    erpnextSyncFailedAt: o.erpnextSyncFailedAt?.toISOString() ?? null,
    erpnextSyncAutoRetryCount: o.erpnextSyncAutoRetryCount,
    erpnextSyncNextAutoRetryAt: o.erpnextSyncNextAutoRetryAt?.toISOString() ?? null,
    erpnextSyncLastAutoRetryAt: o.erpnextSyncLastAutoRetryAt?.toISOString() ?? null,
    erpnextInvoiceId: o.erpnextInvoiceId,
    createdAt: o.createdAt.toISOString(),
    companyLocation: o.companyLocation,
  }));

  return NextResponse.json({ items, total, page, limit });
}
