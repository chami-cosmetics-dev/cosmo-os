import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";
import {
  markOrderErpSyncFailed,
  retryOrderErpSync,
  type OrderForErpRetry,
} from "@/lib/failed-erp-sync-auto-retry";
import { isOrderBeforeImportCutoff } from "@/lib/order-import-cutoff";
import { shouldSkipShopifyOrderErpSync } from "@/lib/erp-shopify-sync-eligibility";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("failed_webhooks.retry");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  const order: OrderForErpRetry | null = await prisma.order.findUnique({
    where: { id: idResult.data },
    include: {
      companyLocation: { include: { erpnextInstance: true } },
      lineItems: { include: { productItem: true } },
    },
  });

  if (!order || order.companyId !== user?.companyId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (
    isOrderBeforeImportCutoff(order.createdAt) ||
    shouldSkipShopifyOrderErpSync(order.createdAt, order.companyLocation)
  ) {
    return NextResponse.json(
      {
        error: "This order is excluded from Shopify → ERP sync and cannot create a Sales Invoice in ERP.",
        code: "ERP_SHOPIFY_SYNC_EXCLUDED",
      },
      { status: 400 },
    );
  }

  const isZombiePending = order.erpnextInvoiceId === "pending" && !order.erpnextSyncError;
  const isLegacyPendingApprovalPlaceholder =
    order.erpnextInvoiceId === "pending_approval";
  if (!order.erpnextSyncError && !isZombiePending && !isLegacyPendingApprovalPlaceholder) {
    return NextResponse.json({ error: "No failed ERP sync on this order" }, { status: 400 });
  }

  try {
    await retryOrderErpSync(order);
    return NextResponse.json({ ok: true, message: "ERP sync succeeded" });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[ERPNext] manual retry failed for order", order.id, errMsg);
    await markOrderErpSyncFailed(order.id, errMsg, {
      scheduleAutoRetry: true,
      incrementAutoRetryCount: true,
    });
    return NextResponse.json({ error: "Retry failed", details: errMsg }, { status: 500 });
  }
}
