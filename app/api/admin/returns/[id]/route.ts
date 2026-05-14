import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createOrGetReturnRearrangeApproval } from "@/lib/approval-workflow";
import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const returnActionSchema = z.object({
  actionStatus: z.enum(["pending", "solved"]),
  actionRemark: z.string().trim().max(5000).nullable(),
  actionType: z.enum(["save", "rearrange", "confirm_rearrange_paid", "request_finance_approval"]).optional(),
});

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function isCodOrder(order: {
  financialStatus: string | null;
  paymentGatewayPrimary: string | null;
  paymentGatewayNames: string[];
}) {
  const candidates = [
    order.paymentGatewayPrimary,
    ...order.paymentGatewayNames,
    order.financialStatus,
  ].map(normalizeText);

  if (candidates.some((value) => value.includes("bank"))) return false;
  if (candidates.some((value) => value.includes("card") || value.includes("paid"))) return false;
  return candidates.some((value) => value.includes("cod")) || normalizeText(order.financialStatus) === "pending";
}

function isPendingBankTransferOrder(order: {
  financialStatus: string | null;
  paymentGatewayPrimary: string | null;
  paymentGatewayNames: string[];
}) {
  const gateways = [order.paymentGatewayPrimary, ...order.paymentGatewayNames].map(normalizeText);
  return gateways.some((value) => value.includes("bank")) && normalizeText(order.financialStatus) === "pending";
}

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
      order: {
        select: {
          id: true,
          orderNumber: true,
          name: true,
          fulfillmentStage: true,
          financialStatus: true,
          paymentGatewayPrimary: true,
          paymentGatewayNames: true,
        },
      },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Returned order not found" }, { status: 404 });
  }

  const remark = parsed.data.actionRemark?.trim() || null;
  const actionDate = new Date();
  const isRearrange = parsed.data.actionType === "rearrange";
  const isConfirmRearrangePaid = parsed.data.actionType === "confirm_rearrange_paid";
  const isFinanceApprovalRequest = parsed.data.actionType === "request_finance_approval";
  const requiresBankTransferBeforeRearrange = isRearrange && isCodOrder(existing.order);
  const isApprovalRequestFlow =
    isFinanceApprovalRequest &&
    (isCodOrder(existing.order) || isPendingBankTransferOrder(existing.order));
  const nextStatus = isRearrange
    ? requiresBankTransferBeforeRearrange
      ? "pending"
      : "solved"
    : isFinanceApprovalRequest
      ? "pending"
    : isConfirmRearrangePaid
      ? "solved"
      : parsed.data.actionStatus;
  let approvalRequestId: string | null = null;
  const updated = await prisma.$transaction(async (tx) => {
    const returnedOrder = await tx.orderReturn.update({
      where: { id: existing.id },
      data: {
        actionStatus: nextStatus,
        actionType: isRearrange || isConfirmRearrangePaid || isFinanceApprovalRequest ? "rearrange" : null,
        actionRemark: requiresBankTransferBeforeRearrange || isApprovalRequestFlow
          ? [
              remark,
              "Bank transfer required before rearranging this returned COD order.",
            ].filter(Boolean).join("\n")
          : remark,
        actionDate,
        actionById: viewerUserId,
      },
    });

    if (requiresBankTransferBeforeRearrange || isApprovalRequestFlow) {
      await tx.order.update({
        where: { id: existing.orderId },
        data: {
          financialStatus: "pending",
          paymentGatewayNames: ["bank_transfer"],
          paymentGatewayPrimary: "bank_transfer",
          fulfillmentStage: "returned_to_store",
          fulfillmentStatus: "unfulfilled",
          packageReadyAt: null,
          packageReadyById: null,
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
    } else if (isRearrange || isConfirmRearrangePaid) {
      await tx.order.update({
        where: { id: existing.orderId },
        data: {
          ...(isConfirmRearrangePaid
            ? {
                financialStatus: "paid",
                paymentGatewayNames: ["bank_transfer"],
                paymentGatewayPrimary: "bank_transfer",
              }
            : {}),
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

  if (isApprovalRequestFlow) {
    const approval = await createOrGetReturnRearrangeApproval({
      companyId,
      orderId: existing.orderId,
      orderReturnId: existing.id,
      requestedById: viewerUserId,
      requestNote: remark,
      invoiceLabel: existing.order.orderNumber ?? existing.order.name ?? existing.orderId,
    });
    approvalRequestId = approval.id;
  }

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
      metadata: { actionType: parsed.data.actionType ?? "save", approvalRequestId },
  });

  if (isRearrange || isConfirmRearrangePaid || isFinanceApprovalRequest) {
    await writeAuditLog({
      companyId,
      actorUserId: viewerUserId,
      module: "orders",
      action: "returned_order_rearranged",
      entityType: "Order",
      entityId: existing.orderId,
      summary: requiresBankTransferBeforeRearrange
        ? `Marked returned COD order ${existing.order.orderNumber ?? existing.order.name ?? existing.orderId} as pending bank transfer before rearrange`
        : isFinanceApprovalRequest
          ? `Requested finance approval for returned COD order ${existing.order.orderNumber ?? existing.order.name ?? existing.orderId}`
        : `Marked returned order ${existing.order.orderNumber ?? existing.order.name ?? existing.orderId} as rearrange`,
      beforeData: { fulfillmentStage: existing.order.fulfillmentStage },
      afterData: {
        fulfillmentStage: requiresBankTransferBeforeRearrange ? "returned_to_store" : "ready_to_dispatch",
        paymentGatewayPrimary: "bank_transfer",
        financialStatus: isConfirmRearrangePaid ? "paid" : "pending",
      },
      metadata: {
        orderReturnId: updated.id,
        requiresBankTransferBeforeRearrange: requiresBankTransferBeforeRearrange || isApprovalRequestFlow,
        actionType: parsed.data.actionType,
        approvalRequestId,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    returnedOrder: {
      id: updated.id,
      actionStatus: updated.actionStatus,
      actionRemark: updated.actionRemark,
      actionDate: updated.actionDate?.toISOString() ?? null,
      actionType: updated.actionType,
    },
    approvalRequestId,
    order: isRearrange || isConfirmRearrangePaid || isFinanceApprovalRequest
      ? {
          id: existing.orderId,
          fulfillmentStage: requiresBankTransferBeforeRearrange || isApprovalRequestFlow ? "returned_to_store" : "ready_to_dispatch",
          financialStatus: isConfirmRearrangePaid ? "paid" : "pending",
          paymentGatewayPrimary: "bank_transfer",
          requiresBankTransferBeforeRearrange: requiresBankTransferBeforeRearrange || isApprovalRequestFlow,
        }
      : undefined,
  });
}
