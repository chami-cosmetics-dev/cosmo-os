import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  DELIVERY_PAYMENT_APPROVAL,
  INVOICE_REVERT_VOID_APPROVAL,
  ORDER_PAYMENT_APPROVAL,
  RETURN_CANCEL_APPROVAL,
  RETURN_REARRANGE_PAYMENT_APPROVAL,
  hasPriorApprovedPaymentApproval,
  notifyApprovalRequester,
} from "@/lib/approval-workflow";
import { writeAuditLog } from "@/lib/audit-log";
import { createDeliveryPaymentEntry } from "@/lib/erpnext-sync";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  markOrderErpSyncFailed,
  runPostApprovalErpSync,
} from "@/lib/failed-erp-sync-auto-retry";
import { orderStageUpdate } from "@/lib/order-stage-timing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const reviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reviewNote: z.string().trim().max(2000).optional().nullable(),
});

function invoiceLabel(order: { name: string | null; orderNumber: string | null; shopifyOrderId: string | null }) {
  return order.name ?? order.orderNumber ?? order.shopifyOrderId ?? "order";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("finance.approvals.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  const reviewerId = auth.context?.user?.id;
  if (!companyId || !reviewerId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    type: string;
    status: string;
    orderId: string | null;
    orderReturnId: string | null;
    requestedById: string | null;
    orderLinked: boolean;
    orderName: string | null;
    orderNumber: string | null;
    shopifyOrderId: string | null;
  }>>(
    Prisma.sql`
      SELECT
        ar."id",
        ar."type",
        ar."status",
        ar."orderId",
        ar."orderReturnId",
        ar."requestedById",
        (o."id" IS NOT NULL) AS "orderLinked",
        o."name" AS "orderName",
        o."orderNumber",
        o."shopifyOrderId"
      FROM "ApprovalRequest" ar
      LEFT JOIN "Order" o ON o."id" = ar."orderId"
      WHERE ar."id" = ${id}
        AND ar."companyId" = ${companyId}
      LIMIT 1
    `
  );
  const approval = rows[0];
  if (!approval) {
    return NextResponse.json({ error: "Approval request not found" }, { status: 404 });
  }
  if (approval.status !== "pending") {
    return NextResponse.json({ error: "Approval request is already reviewed" }, { status: 400 });
  }
  const orderMissing = !approval.orderId || !approval.orderLinked;
  if (orderMissing && parsed.data.action === "approve") {
    return NextResponse.json(
      { error: "This approval has no linked order (order was removed). Reject it to clear from the list." },
      { status: 400 }
    );
  }
  if (orderMissing && (approval.type === ORDER_PAYMENT_APPROVAL || approval.type === DELIVERY_PAYMENT_APPROVAL)) {
    const now = new Date();
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "ApprovalRequest"
        SET
          "status" = 'rejected',
          "reviewedById" = ${reviewerId},
          "reviewNote" = ${parsed.data.reviewNote ?? "Rejected — linked order no longer exists"},
          "reviewedAt" = ${now},
          "updatedAt" = ${now}
        WHERE "id" = ${id}
          AND "companyId" = ${companyId}
      `
    );
    return NextResponse.json({ ok: true, status: "rejected" });
  }
  // Return rearrange/cancel approvals require an orderReturn link
  if (
    (approval.type === RETURN_REARRANGE_PAYMENT_APPROVAL || approval.type === RETURN_CANCEL_APPROVAL) &&
    !approval.orderReturnId
  ) {
    return NextResponse.json({ error: "Approval request is missing linked order return" }, { status: 400 });
  }

  const now = new Date();
  const nextStatus = parsed.data.action === "approve" ? "approved" : "rejected";
  const isPaymentReapproval =
    nextStatus === "approved" &&
    approval.orderId != null &&
    (approval.type === ORDER_PAYMENT_APPROVAL || approval.type === DELIVERY_PAYMENT_APPROVAL) &&
    (await hasPriorApprovedPaymentApproval(
      approval.orderId,
      approval.type as typeof ORDER_PAYMENT_APPROVAL | typeof DELIVERY_PAYMENT_APPROVAL,
      approval.id,
    ));

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`
        UPDATE "ApprovalRequest"
        SET
          "status" = ${nextStatus},
          "reviewedById" = ${reviewerId},
          "reviewNote" = ${parsed.data.reviewNote ?? null},
          "reviewedAt" = ${now},
          "updatedAt" = ${now}
        WHERE "id" = ${approval.id}
          AND "companyId" = ${companyId}
      `
    );

    if (nextStatus === "approved") {
      if (approval.type === ORDER_PAYMENT_APPROVAL) {
        // Bank / KOKO / WebXPay: invoice is financially complete at approval; advance to print queue for physical fulfillment.
        await tx.order.update({
          where: { id: approval.orderId! },
          data: {
            financialStatus: "paid",
            ...orderStageUpdate("print", now),
            sampleFreeIssueCompleteAt: now,
            sampleFreeIssueCompleteById: reviewerId,
            invoiceCompleteAt: now,
            invoiceCompleteById: reviewerId,
          },
        });
      } else if (approval.type === DELIVERY_PAYMENT_APPROVAL) {
        await tx.order.update({
          where: { id: approval.orderId! },
          data: isPaymentReapproval
            ? { financialStatus: "paid" }
            : {
                financialStatus: "paid",
                ...orderStageUpdate("invoice_complete", now),
                fulfillmentStatus: "fulfilled",
                invoiceCompleteAt: now,
                invoiceCompleteById: reviewerId,
              },
        });
      } else if (approval.type === INVOICE_REVERT_VOID_APPROVAL) {
        await tx.order.update({
          where: { id: approval.orderId! },
          data: {
            financialStatus: "voided",
            ...orderStageUpdate("returned", now),
          },
        });
        await tx.orderReturn.updateMany({
          where: { orderId: approval.orderId!, remarkTemplate: "invoice_revert", actionStatus: "pending" },
          data: {
            actionStatus: "solved",
            actionType: "void",
            actionDate: now,
            actionById: reviewerId,
          },
        });
      } else if (approval.type === RETURN_CANCEL_APPROVAL) {
        await tx.orderReturn.update({
          where: { id: approval.orderReturnId! },
          data: {
            actionStatus: "solved",
            actionType: "cancel",
            actionDate: now,
            actionById: reviewerId,
          },
        });
      } else if (approval.type === RETURN_REARRANGE_PAYMENT_APPROVAL) {
        // Return rearrange approval: force to ready_to_dispatch + resolve the return
        await tx.order.update({
          where: { id: approval.orderId! },
          data: {
            financialStatus: "paid",
            paymentGatewayNames: ["bank_transfer"],
            paymentGatewayPrimary: "bank_transfer",
            ...orderStageUpdate("ready_to_dispatch", now),
            fulfillmentStatus: "unfulfilled",
            packageReadyAt: now,
            packageReadyById: reviewerId,
            packageOnHoldAt: null,
            packageHoldReasonId: null,
            deliveryOutcome: "pending",
            deliveryFailedReason: null,
          },
        });
        await tx.orderReturn.update({
          where: { id: approval.orderReturnId! },
          data: {
            actionStatus: "solved",
            actionType: "rearrange",
            actionDate: now,
            actionById: reviewerId,
            actionRemark: parsed.data.reviewNote
              ? `Finance approved bank transfer.\n${parsed.data.reviewNote}`
              : "Finance approved bank transfer.",
          },
        });
        await tx.riderDeliveryTask.updateMany({
          where: { orderId: approval.orderId! },
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
    }

    // Mark read for this approval AND any other approval_requested notifications
    // linked to the same order (handles orphaned notifications from duplicate approvals)
    await tx.$executeRaw(
      Prisma.sql`
        UPDATE "Notification"
        SET "readAt" = COALESCE("readAt", ${now})
        WHERE "companyId" = ${companyId}
          AND "entityType" = 'ApprovalRequest'
          AND "type" = 'approval_requested'
          AND "readAt" IS NULL
          AND "entityId" IN (
            SELECT "id" FROM "ApprovalRequest"
            WHERE "orderId" = ${approval.orderId}
              AND "companyId" = ${companyId}
          )
      `
    );
  });

  await notifyApprovalRequester({
    companyId,
    approvalId: approval.id,
    status: nextStatus,
    requestedById: approval.requestedById,
    approvalType: approval.type,
    invoiceLabel: invoiceLabel({
      name: approval.orderName,
      orderNumber: approval.orderNumber,
      shopifyOrderId: approval.shopifyOrderId,
    }),
  });

  if (nextStatus === "approved" && approval.type === RETURN_CANCEL_APPROVAL && approval.orderReturnId) {
    await writeAuditLog({
      companyId,
      actorUserId: reviewerId,
      module: "orders",
      action: "returned_order_cancel_approved",
      entityType: "OrderReturn",
      entityId: approval.orderReturnId,
      summary: `Finance acknowledged cancel for ${invoiceLabel({
        name: approval.orderName,
        orderNumber: approval.orderNumber,
        shopifyOrderId: approval.shopifyOrderId,
      })} (process in ERPNext)`,
      metadata: { approvalId: approval.id, orderId: approval.orderId },
    });
  }

  let erpSyncFailed = false;
  let erpSyncError: string | undefined;

  // First-time approval only — re-approval after HOD revert updates Vault paid status; ERP SI stays unchanged.
  if (
    nextStatus === "approved" &&
    !isPaymentReapproval &&
    approval.type === ORDER_PAYMENT_APPROVAL &&
    approval.orderId
  ) {
    try {
      await runPostApprovalErpSync(approval.orderId, now);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[ERPNext] post-approval sync failed:", errMsg);
      await markOrderErpSyncFailed(approval.orderId, errMsg);
      erpSyncFailed = true;
      erpSyncError = errMsg;
    }
  }

  if (
    nextStatus === "approved" &&
    !isPaymentReapproval &&
    approval.type === DELIVERY_PAYMENT_APPROVAL &&
    approval.orderId
  ) {
    const order = await prisma.order.findUnique({
      where: { id: approval.orderId },
      include: { companyLocation: { include: { erpnextInstance: true } } },
    });
    if (order?.companyLocation) {
      try {
        await createDeliveryPaymentEntry(order, order.companyLocation, now);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[ERPNext] delivery payment approval PE failed:", errMsg);
        erpSyncFailed = true;
        erpSyncError = errMsg;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    status: nextStatus,
    ...(erpSyncFailed ? { erpSyncFailed: true, erpSyncError } : { erpSyncFailed: false }),
  });
}
