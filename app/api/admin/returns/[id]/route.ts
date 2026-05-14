import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const returnActionSchema = z.object({
  actionStatus: z.enum(["pending", "solved"]),
  actionRemark: z.string().trim().max(5000).nullable(),
  actionType: z.enum(["save", "rearrange"]).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("returns.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const parsedId = cuidSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid return ID" }, { status: 400 });
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = returnActionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const companyId = auth.context!.user!.companyId;
  const viewerUserId = auth.context!.user!.id;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const canManageAll = hasPermission(auth.context!, "orders.manage");
  const existing = await prisma.orderReturn.findFirst({
    where: {
      id: parsedId.data,
      companyId,
      ...(canManageAll
        ? {}
        : {
            OR: [
              { merchantUserId: viewerUserId },
              { merchantUserId: null },
            ],
          }),
    },
    include: {
      order: { select: { id: true, orderNumber: true, name: true, fulfillmentStage: true } },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Returned order not found" }, { status: 404 });
  }

  const remark = parsed.data.actionRemark?.trim() || null;
  const actionDate = new Date();
  const isRearrange = parsed.data.actionType === "rearrange";
  const nextStatus = isRearrange ? "solved" : parsed.data.actionStatus;
  const updated = await prisma.$transaction(async (tx) => {
    const returnedOrder = await tx.orderReturn.update({
      where: { id: existing.id },
      data: {
        actionStatus: nextStatus,
        actionType: isRearrange ? "rearrange" : null,
        actionRemark: remark,
        actionDate,
        actionById: viewerUserId,
      },
    });

    if (isRearrange) {
      await tx.order.update({
        where: { id: existing.orderId },
        data: {
          fulfillmentStage: "ready_to_dispatch",
          fulfillmentStatus: "unfulfilled",
          packageReadyAt: actionDate,
          packageReadyById: viewerUserId,
          packageOnHoldAt: null,
          packageHoldReasonId: null,
          deliveryOutcome: "pending",
          deliveryFailedReason: null,
        },
      });
      await tx.riderDeliveryTask.updateMany({
        where: { orderId: existing.orderId },
        data: {
          deliveryKind: "rearranged",
          exchangeId: null,
          oldOrderLabel: null,
          replacementOrderLabel: null,
          requiresOldItemCollection: false,
          oldItemCollectionStatus: "pending",
          oldItemCollectionRemark: null,
          exchangePaymentDifference: null,
        },
      });
    }

    return returnedOrder;
  });

  await writeAuditLog({
    companyId,
    actorUserId: viewerUserId,
    module: "orders",
    action: updated.actionStatus === "solved" ? "returned_order_solved" : "returned_order_updated",
    entityType: "OrderReturn",
    entityId: updated.id,
    summary: `Updated returned order ${existing.order.orderNumber ?? existing.order.name ?? existing.orderId}`,
    beforeData: {
      actionStatus: existing.actionStatus,
      actionRemark: existing.actionRemark,
    },
    afterData: {
      actionStatus: updated.actionStatus,
      actionRemark: updated.actionRemark,
      actionDate: updated.actionDate,
    },
    metadata: { actionType: parsed.data.actionType ?? "save" },
  });

  if (isRearrange) {
    await writeAuditLog({
      companyId,
      actorUserId: viewerUserId,
      module: "orders",
      action: "returned_order_rearranged",
      entityType: "Order",
      entityId: existing.orderId,
      summary: `Marked returned order ${existing.order.orderNumber ?? existing.order.name ?? existing.orderId} as rearrange`,
      beforeData: { fulfillmentStage: existing.order.fulfillmentStage },
      afterData: { fulfillmentStage: "ready_to_dispatch" },
      metadata: { orderReturnId: updated.id },
    });
  }

  return NextResponse.json({
    ok: true,
    returnedOrder: {
      id: updated.id,
      actionStatus: updated.actionStatus,
      actionRemark: updated.actionRemark,
      actionDate: updated.actionDate?.toISOString() ?? null,
    },
    order: isRearrange
      ? {
          id: existing.orderId,
          fulfillmentStage: "ready_to_dispatch",
        }
      : undefined,
  });
}
