import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createInvoiceRevertVoidApproval,
  createOrGetReturnCancelApproval,
  createOrGetReturnRearrangeApproval,
  serializeReturnCancelApprovalNote,
} from "@/lib/approval-workflow";
import { writeAuditLog } from "@/lib/audit-log";
import { isCitypakCourier, isRiderReturn } from "@/lib/courier";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";
import { orderStageUpdate } from "@/lib/order-stage-timing";

const returnActionSchema = z.object({
  actionStatus: z.enum(["pending", "solved"]).optional(),
  actionRemark: z.string().trim().max(5000).nullable().optional(),
  cancelRemark: z.string().trim().max(5000).optional(),
  actionType: z
    .enum(["save", "rearrange", "confirm_rearrange_paid", "request_finance_approval", "request_cancel", "mark_returned_to_store", "resend_void_approval"])
    .optional(),
});

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function isPendingBankTransferOrder(order: {
  financialStatus: string | null;
  paymentGatewayPrimary: string | null;
  paymentGatewayNames: string[];
}) {
  const gateways = [order.paymentGatewayPrimary, ...order.paymentGatewayNames].map(normalizeText);
  return gateways.some((value) => value.includes("bank")) && normalizeText(order.financialStatus) === "pending";
}

function requiresCourierBankTransferBeforeRearrange(orderReturn: {
  shippingServiceType: string;
  shippingServiceName: string;
}) {
  if (isRiderReturn(orderReturn.shippingServiceType)) return false;
  return isCitypakCourier(orderReturn.shippingServiceName);
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
            OR: [{ merchantUserId: viewerUserId }, { merchantUserId: null }],
          }),
    },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          name: true,
          shopifyOrderId: true,
          erpnextInvoiceId: true,
          fulfillmentStage: true,
          financialStatus: true,
          paymentGatewayPrimary: true,
          paymentGatewayNames: true,
          revertedFromInvoiceCompleteAt: true,
        },
      },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Returned order not found" }, { status: 404 });
  }

  const remark = parsed.data.actionRemark?.trim() || existing.returnRemark || null;
  const actionDate = new Date();
  const isRearrange = parsed.data.actionType === "rearrange";
  const isConfirmRearrangePaid = parsed.data.actionType === "confirm_rearrange_paid";
  const isFinanceApprovalRequest = parsed.data.actionType === "request_finance_approval";
  const isCancelRequest = parsed.data.actionType === "request_cancel";
  const isMarkReturnedToStore = parsed.data.actionType === "mark_returned_to_store";
  const isResendVoidApproval = parsed.data.actionType === "resend_void_approval";

  if (isCancelRequest) {
    const cancelRemark = parsed.data.cancelRemark?.trim();
    if (!cancelRemark) {
      return NextResponse.json({ error: "Cancel remark is required" }, { status: 400 });
    }
  }

  if (isMarkReturnedToStore) {
    if (existing.remarkTemplate !== "invoice_revert") {
      return NextResponse.json({ error: "Only finance-reverted orders can use this action" }, { status: 400 });
    }
    if (!existing.order.revertedFromInvoiceCompleteAt) {
      return NextResponse.json({ error: "Order is not in partial void state" }, { status: 400 });
    }
    if (existing.order.fulfillmentStage === "returned_to_store" || existing.order.fulfillmentStage === "returned") {
      return NextResponse.json({ error: "Order has already been returned to store" }, { status: 400 });
    }

    const orderLabel = existing.order.name ?? existing.order.orderNumber ?? existing.order.shopifyOrderId ?? existing.orderId;
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: existing.orderId },
        data: orderStageUpdate("returned_to_store", actionDate),
      });
      await tx.orderReturn.update({
        where: { id: existing.id },
        data: { actionDate, actionById: viewerUserId },
      });
    });

    await createInvoiceRevertVoidApproval({
      companyId,
      orderId: existing.orderId,
      invoiceLabel: orderLabel,
      revertedAt: existing.order.revertedFromInvoiceCompleteAt,
    });

    await writeAuditLog({
      companyId,
      actorUserId: viewerUserId,
      module: "orders",
      action: "fulfillment_updated",
      entityType: "Order",
      entityId: existing.orderId,
      summary: `Finance-reverted order ${orderLabel} marked returned to store — void approval sent`,
      beforeData: { fulfillmentStage: existing.order.fulfillmentStage },
      afterData: { fulfillmentStage: "returned_to_store" },
      metadata: { action: "finance_revert_returned_to_store", orderReturnId: existing.id },
    });

    return NextResponse.json({
      ok: true,
      returnedOrder: { id: existing.id, actionDate: actionDate.toISOString(), actionById: viewerUserId },
      order: { id: existing.orderId, fulfillmentStage: "returned_to_store" },
    });
  }

  if (isResendVoidApproval) {
    if (existing.remarkTemplate !== "invoice_revert") {
      return NextResponse.json({ error: "Only finance-reverted orders can use this action" }, { status: 400 });
    }
    if (!existing.order.revertedFromInvoiceCompleteAt) {
      return NextResponse.json({ error: "Order is not in partial void state" }, { status: 400 });
    }
    if (existing.order.fulfillmentStage !== "returned_to_store") {
      return NextResponse.json({ error: "Order must be marked returned to store first" }, { status: 400 });
    }

    const orderLabel = existing.order.name ?? existing.order.orderNumber ?? existing.order.shopifyOrderId ?? existing.orderId;
    await createInvoiceRevertVoidApproval({
      companyId,
      orderId: existing.orderId,
      invoiceLabel: orderLabel,
      revertedAt: existing.order.revertedFromInvoiceCompleteAt,
    });

    await writeAuditLog({
      companyId,
      actorUserId: viewerUserId,
      module: "orders",
      action: "fulfillment_updated",
      entityType: "Order",
      entityId: existing.orderId,
      summary: `Void approval re-sent for finance-reverted order ${orderLabel}`,
      metadata: { action: "finance_revert_void_approval_resent", orderReturnId: existing.id },
    });

    return NextResponse.json({ ok: true });
  }

  const requiresBankTransferBeforeRearrange =
    isRearrange && requiresCourierBankTransferBeforeRearrange(existing);
  const isApprovalRequestFlow =
    isFinanceApprovalRequest &&
    (requiresCourierBankTransferBeforeRearrange(existing) || isPendingBankTransferOrder(existing.order));

  const nextStatus = isCancelRequest
    ? "pending"
    : isRearrange
      ? requiresBankTransferBeforeRearrange
        ? "pending"
        : "solved"
      : isFinanceApprovalRequest
        ? "pending"
        : isConfirmRearrangePaid
          ? "solved"
          : (parsed.data.actionStatus ?? existing.actionStatus);

  let approvalRequestId: string | null = null;
  const updated = await prisma.$transaction(async (tx) => {
    const returnedOrder = await tx.orderReturn.update({
      where: { id: existing.id },
      data: {
        actionStatus: nextStatus,
        actionType: isCancelRequest
          ? "cancel"
          : isRearrange || isConfirmRearrangePaid || isFinanceApprovalRequest
            ? "rearrange"
            : existing.actionType,
        returnRemark: remark,
        actionRemark: remark,
        cancelRemark: isCancelRequest ? parsed.data.cancelRemark!.trim() : existing.cancelRemark,
        cancelRequestedAt: isCancelRequest ? actionDate : existing.cancelRequestedAt,
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
          ...orderStageUpdate("returned_to_store", actionDate),
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
          ...orderStageUpdate("ready_to_dispatch", actionDate),
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

  if (isCancelRequest) {
    const invoiceLabel =
      existing.order.orderNumber ?? existing.order.name ?? existing.order.shopifyOrderId ?? existing.orderId;
    const approval = await createOrGetReturnCancelApproval({
      companyId,
      orderId: existing.orderId,
      orderReturnId: existing.id,
      requestedById: viewerUserId,
      invoiceLabel,
      requestNote: serializeReturnCancelApprovalNote({
        invoiceLabel,
        shopifyOrderId: existing.order.shopifyOrderId,
        erpnextInvoiceId: existing.order.erpnextInvoiceId,
        returnRemark: remark,
        cancelRemark: parsed.data.cancelRemark!.trim(),
        returnDate: existing.returnDate.toISOString(),
        cancelRequestedAt: actionDate.toISOString(),
      }),
    });
    approvalRequestId = approval.id;

    await writeAuditLog({
      companyId,
      actorUserId: viewerUserId,
      module: "orders",
      action: "returned_order_cancel_requested",
      entityType: "OrderReturn",
      entityId: updated.id,
      summary: `Cancel requested for returned order ${invoiceLabel}`,
      afterData: {
        cancelRemark: parsed.data.cancelRemark!.trim(),
        returnRemark: remark,
        approvalRequestId,
      },
    });
  }

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

  if (!isCancelRequest) {
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
        returnRemark: existing.returnRemark,
      },
      afterData: {
        actionStatus: updated.actionStatus,
        actionRemark: updated.actionRemark,
        returnRemark: updated.returnRemark,
        actionDate: updated.actionDate,
      },
      metadata: { actionType: parsed.data.actionType ?? "save", approvalRequestId },
    });
  }

  if (isRearrange || isConfirmRearrangePaid || isFinanceApprovalRequest) {
    await writeAuditLog({
      companyId,
      actorUserId: viewerUserId,
      module: "orders",
      action: "returned_order_rearranged",
      entityType: "Order",
      entityId: existing.orderId,
      summary: requiresBankTransferBeforeRearrange
        ? `Marked returned courier order ${existing.order.orderNumber ?? existing.order.name ?? existing.orderId} as pending bank transfer before rearrange`
        : isFinanceApprovalRequest
          ? `Requested finance approval for returned order ${existing.order.orderNumber ?? existing.order.name ?? existing.orderId}`
          : `Marked returned order ${existing.order.orderNumber ?? existing.order.name ?? existing.orderId} as rearrange`,
      beforeData: { fulfillmentStage: existing.order.fulfillmentStage },
      afterData: {
        fulfillmentStage: requiresBankTransferBeforeRearrange || isApprovalRequestFlow ? "returned_to_store" : "ready_to_dispatch",
        paymentGatewayPrimary: requiresBankTransferBeforeRearrange || isApprovalRequestFlow ? "bank_transfer" : existing.order.paymentGatewayPrimary,
        financialStatus: isConfirmRearrangePaid ? "paid" : existing.order.financialStatus,
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
      returnRemark: updated.returnRemark,
      cancelRemark: updated.cancelRemark,
      cancelRequestedAt: updated.cancelRequestedAt?.toISOString() ?? null,
      actionDate: updated.actionDate?.toISOString() ?? null,
      actionType: updated.actionType,
    },
    approvalRequestId,
    order:
      isRearrange || isConfirmRearrangePaid || isFinanceApprovalRequest
        ? {
            id: existing.orderId,
            fulfillmentStage:
              requiresBankTransferBeforeRearrange || isApprovalRequestFlow ? "returned_to_store" : "ready_to_dispatch",
            financialStatus: isConfirmRearrangePaid ? "paid" : existing.order.financialStatus,
            paymentGatewayPrimary:
              requiresBankTransferBeforeRearrange || isApprovalRequestFlow
                ? "bank_transfer"
                : existing.order.paymentGatewayPrimary,
            requiresBankTransferBeforeRearrange: requiresBankTransferBeforeRearrange || isApprovalRequestFlow,
          }
        : undefined,
  });
}
