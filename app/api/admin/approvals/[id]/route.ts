import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { notifyApprovalRequester } from "@/lib/approval-workflow";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

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
    status: string;
    orderId: string | null;
    orderReturnId: string | null;
    requestedById: string;
    orderName: string | null;
    orderNumber: string | null;
    shopifyOrderId: string | null;
  }>>(
    Prisma.sql`
      SELECT
        ar."id",
        ar."status",
        ar."orderId",
        ar."orderReturnId",
        ar."requestedById",
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
  if (!approval.orderId || !approval.orderReturnId) {
    return NextResponse.json({ error: "Approval request is missing linked order data" }, { status: 400 });
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

    await tx.$executeRaw(
      Prisma.sql`
        UPDATE "Notification"
        SET "readAt" = COALESCE("readAt", ${now})
        WHERE "companyId" = ${companyId}
          AND "entityType" = 'ApprovalRequest'
          AND "entityId" = ${approval.id}
          AND "type" = 'approval_requested'
          AND "readAt" IS NULL
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

  return NextResponse.json({ ok: true, status: nextStatus });
}
