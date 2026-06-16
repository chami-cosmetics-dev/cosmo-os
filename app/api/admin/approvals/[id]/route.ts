import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { ORDER_PAYMENT_APPROVAL, notifyApprovalRequester } from "@/lib/approval-workflow";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  markOrderErpSyncFailed,
  runPostApprovalErpSync,
} from "@/lib/failed-erp-sync-auto-retry";

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
    requestedById: string;
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
  if (orderMissing && approval.type === ORDER_PAYMENT_APPROVAL) {
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
  // Return rearrange approvals also require an orderReturn link
  if (approval.type !== ORDER_PAYMENT_APPROVAL && !approval.orderReturnId) {
    return NextResponse.json({ error: "Approval request is missing linked order return" }, { status: 400 });
  }

  const now = new Date();
  const nextStatus = parsed.data.action === "approve" ? "approved" : "rejected";
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
        // Order payment approval: just mark financial status paid.
        // Fulfillment stage stays at sample_free_issue — merchant advances to print manually.
        await tx.order.update({
          where: { id: approval.orderId! },
          data: { financialStatus: "paid" },
        });
      } else {
        // Return rearrange approval: force to ready_to_dispatch + resolve the return
        await tx.order.update({
          where: { id: approval.orderId! },
          data: {
            financialStatus: "paid",
            paymentGatewayNames: ["bank_transfer"],
            paymentGatewayPrimary: "bank_transfer",
            fulfillmentStage: "ready_to_dispatch",
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
    invoiceLabel: invoiceLabel({
      name: approval.orderName,
      orderNumber: approval.orderNumber,
      shopifyOrderId: approval.shopifyOrderId,
    }),
  });

  let erpSyncFailed = false;
  let erpSyncError: string | undefined;

  // Await ERP sync so serverless does not terminate before the Sales Invoice is created.
  if (nextStatus === "approved" && approval.type === ORDER_PAYMENT_APPROVAL && approval.orderId) {
    try {
      await runPostApprovalErpSync(approval.orderId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[ERPNext] post-approval sync failed:", errMsg);
      await markOrderErpSyncFailed(approval.orderId, errMsg);
      erpSyncFailed = true;
      erpSyncError = errMsg;
    }
  }

  return NextResponse.json({
    ok: true,
    status: nextStatus,
    ...(erpSyncFailed ? { erpSyncFailed: true, erpSyncError } : { erpSyncFailed: false }),
  });
}
