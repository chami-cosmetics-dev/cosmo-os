import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { verifyFinanceHodRevertPassword } from "@/lib/hod-payment-revert";
import { prisma } from "@/lib/prisma";
import { requeuePaymentApprovalAfterRevert } from "@/lib/requeue-payment-approval-after-revert";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  password: z.string().min(1).max(200),
  reason: z.string().trim().max(2000).optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("finance.hod.revert_paid_to_unpaid");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  const actorUserId = auth.context?.user?.id;
  if (!companyId || !actorUserId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  if (!verifyFinanceHodRevertPassword(parsed.data.password)) {
    return NextResponse.json({ error: "Invalid HOD password" }, { status: 403 });
  }

  const order = await prisma.order.findFirst({
    where: { id: idResult.data, companyId },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      financialStatus: true,
      fulfillmentStage: true,
      fulfillmentStatus: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const currentStatus = order.financialStatus?.trim().toLowerCase() ?? "";
  if (currentStatus !== "paid") {
    return NextResponse.json({ error: "Only paid orders can be reverted to unpaid" }, { status: 400 });
  }

  const now = new Date();
  const revertInvoice =
    order.fulfillmentStage === "invoice_complete" || order.fulfillmentStatus === "fulfilled";

  await prisma.order.update({
    where: { id: order.id },
    data: {
      financialStatus: "pending",
      ...(revertInvoice
        ? {
            fulfillmentStage: "delivery_complete",
            fulfillmentStatus: "unfulfilled",
            invoiceCompleteAt: null,
            invoiceCompleteById: null,
          }
        : {}),
    },
  });

  await writeAuditLog({
    companyId,
    actorUserId,
    module: "orders",
    action: "payment_reverted_to_unpaid",
    entityType: "Order",
    entityId: order.id,
    summary: `HOD reverted order ${order.name ?? order.orderNumber ?? order.id} from paid to unpaid`,
    beforeData: {
      financialStatus: order.financialStatus,
      fulfillmentStage: order.fulfillmentStage,
    },
    afterData: {
      financialStatus: "pending",
      fulfillmentStage: revertInvoice ? "delivery_complete" : order.fulfillmentStage,
    },
    metadata: {
      reason: parsed.data.reason ?? null,
    },
  });

  let approvalRequeued = false;
  try {
    const approval = await requeuePaymentApprovalAfterRevert({
      companyId,
      orderId: order.id,
      requestedById: actorUserId,
      revertInvoice,
    });
    approvalRequeued = approval != null;
  } catch (err) {
    console.error("[HOD revert] failed to re-queue finance approval:", err);
  }

  return NextResponse.json({
    ok: true,
    financialStatus: "pending",
    fulfillmentStage: revertInvoice ? "delivery_complete" : order.fulfillmentStage,
    revertedAt: now.toISOString(),
    approvalRequeued,
  });
}
