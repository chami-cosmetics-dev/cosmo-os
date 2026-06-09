import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { limitSchema, pageSchema } from "@/lib/validation";
import { ORDER_PAYMENT_APPROVAL } from "@/lib/approval-workflow";

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

  const pageResult = pageSchema.safeParse(request.nextUrl.searchParams.get("page"));
  const limitResult = limitSchema.safeParse(request.nextUrl.searchParams.get("limit"));
  const page = pageResult.success ? pageResult.data : 1;
  const limit = limitResult.success ? limitResult.data : 20;
  const skip = (page - 1) * limit;

  const where = {
    companyId,
    OR: [
      { erpnextSyncError: { not: null as string | null }, erpnextInvoiceId: null },
      // Show pending_approval orders where the approval is no longer pending (approved/rejected)
      // — covers both: sync failed with error, and sync silently skipped (no error stored)
      {
        erpnextInvoiceId: "pending_approval",
        approvalRequests: { none: { type: ORDER_PAYMENT_APPROVAL, status: "pending" } },
      },
    ],
  };

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
    erpnextInvoiceId: o.erpnextInvoiceId,
    createdAt: o.createdAt.toISOString(),
    companyLocation: o.companyLocation,
  }));

  return NextResponse.json({ items, total, page, limit });
}
