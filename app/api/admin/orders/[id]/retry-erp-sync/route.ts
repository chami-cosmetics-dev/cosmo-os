import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";
import {
  markOrderErpSyncFailed,
  retryOrderErpSync,
} from "@/lib/failed-erp-sync-auto-retry";
import { ORDER_PAYMENT_APPROVAL } from "@/lib/approval-workflow";

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

  const order = await prisma.order.findUnique({
    where: { id: idResult.data },
    include: {
      companyLocation: { include: { erpnextInstance: true } },
      lineItems: { include: { productItem: true } },
    },
  });

  if (!order || order.companyId !== user?.companyId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const isPendingApproval = order.erpnextInvoiceId === "pending_approval";
  if (!order.erpnextSyncError && !isPendingApproval) {
    return NextResponse.json({ error: "No failed ERP sync on this order" }, { status: 400 });
  }

  if (isPendingApproval) {
    const pendingApproval = await prisma.approvalRequest.findFirst({
      where: { orderId: order.id, type: ORDER_PAYMENT_APPROVAL, status: "pending" },
      select: { id: true },
    });
    if (pendingApproval) {
      return NextResponse.json(
        { error: "This order is awaiting finance approval. The ERP invoice will be created automatically once approved.", code: "PENDING_APPROVAL" },
        { status: 400 },
      );
    }
  }

  try {
    await retryOrderErpSync(order);
    return NextResponse.json({ ok: true, message: "ERP sync succeeded" });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await markOrderErpSyncFailed(order.id, errMsg, {
      autoRetryCount: order.erpnextSyncAutoRetryCount,
      scheduleAutoRetry: true,
    });
    return NextResponse.json({ error: "Retry failed", details: errMsg }, { status: 500 });
  }
}
