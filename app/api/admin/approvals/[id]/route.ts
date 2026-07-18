import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  DELIVERY_PAYMENT_APPROVAL,
  INVOICE_REVERT_VOID_APPROVAL,
  ORDER_CANCEL_APPROVAL,
  ORDER_PAYMENT_APPROVAL,
  PAYMENT_METHOD_CHANGE_APPROVAL,
  RETURN_CANCEL_APPROVAL,
  RETURN_REARRANGE_PAYMENT_APPROVAL,
  hasPriorApprovedPaymentApproval,
  isActiveErpSiRetryLease,
  isPlaceholderErpInvoiceId,
  isRealErpSalesInvoiceId,
  notifyApprovalRequester,
  resolveViewerFinanceLocationIds,
} from "@/lib/approval-workflow";
import { writeAuditLog } from "@/lib/audit-log";
import {
  cancelErpnextSalesInvoice,
  createDeliveryPaymentEntry,
  syncBankTransferPaymentToERPNext,
} from "@/lib/erpnext-sync";
import {
  cancelShopifyOrder,
  isRealShopifyOrderId,
  shouldBlockShopifyCancelInOs,
} from "@/lib/shopify-admin";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  markOrderErpSyncFailed,
  runPostApprovalErpSync,
} from "@/lib/failed-erp-sync-auto-retry";
import {
  ERP_PE_SYNC_MOP_ORDER_AUTO,
  markOrderErpPeSyncFailed,
} from "@/lib/failed-erp-pe-sync";
import { orderStageUpdate } from "@/lib/order-stage-timing";
import {
  cuidSchema,
  orderPaymentRejectionReasonSchema,
} from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const reviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reviewNote: z.string().trim().max(2000).optional().nullable(),
});

class ConcurrentApprovalDecisionError extends Error {
  constructor() {
    super("Approval request was already reviewed");
    this.name = "ConcurrentApprovalDecisionError";
  }
}

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

  const { id: rawId } = await params;
  const idParsed = cuidSchema.safeParse(rawId);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid approval ID" }, { status: 400 });
  }
  const id = idParsed.data;

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    type: string;
    status: string;
    orderId: string | null;
    orderReturnId: string | null;
    requestedById: string | null;
    requestNote: string | null;
    orderLinked: boolean;
    orderName: string | null;
    orderNumber: string | null;
    shopifyOrderId: string | null;
    companyLocationId: string | null;
  }>>(
    Prisma.sql`
      SELECT
        ar."id",
        ar."type",
        ar."status",
        ar."orderId",
        ar."orderReturnId",
        ar."requestedById",
        ar."requestNote",
        (o."id" IS NOT NULL) AS "orderLinked",
        o."name" AS "orderName",
        o."orderNumber",
        o."shopifyOrderId",
        COALESCE(o."companyLocationId", ort_order."companyLocationId") AS "companyLocationId"
      FROM "ApprovalRequest" ar
      LEFT JOIN "Order" o ON o."id" = ar."orderId"
      LEFT JOIN "OrderReturn" ort ON ort."id" = ar."orderReturnId"
      LEFT JOIN "Order" ort_order ON ort_order."id" = ort."orderId"
      WHERE ar."id" = ${id}
        AND ar."companyId" = ${companyId}
      LIMIT 1
    `
  );
  const approval = rows[0];
  if (!approval) {
    return NextResponse.json({ error: "Approval request not found" }, { status: 404 });
  }

  const financeLocationIds = await resolveViewerFinanceLocationIds(
    reviewerId,
    companyId,
    (auth.context?.roleNames as string[]) ?? []
  );
  if (
    financeLocationIds !== null &&
    (!approval.companyLocationId || !financeLocationIds.includes(approval.companyLocationId))
  ) {
    return NextResponse.json(
      { error: "This approval is outside your finance notification scope" },
      { status: 403 }
    );
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
    return NextResponse.json(
      {
        error: "This approval has no linked order. Operator recovery is required before it can be rejected.",
        code: "ORDER_MISSING",
        retryable: false,
        approvalStatus: "pending",
      },
      { status: 409 }
    );
  }
  if (orderMissing && approval.type === DELIVERY_PAYMENT_APPROVAL) {
    const now = new Date();
    const updated = await prisma.$executeRaw(
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
          AND "status" = 'pending'
      `
    );
    if (Number(updated) === 0) {
      return NextResponse.json({ error: "Approval request was already reviewed" }, { status: 409 });
    }
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

  let reviewNote: string | null = parsed.data.reviewNote ?? null;
  if (parsed.data.action === "reject" && approval.type === ORDER_PAYMENT_APPROVAL) {
    const reasonParsed = orderPaymentRejectionReasonSchema.safeParse(parsed.data.reviewNote ?? "");
    if (!reasonParsed.success) {
      return NextResponse.json(
        {
          error: "A rejection reason between 5 and 500 characters is required.",
          code: "REJECTION_REASON_REQUIRED",
        },
        { status: 400 }
      );
    }
    reviewNote = reasonParsed.data;
  }

  // ORDER_PAYMENT_APPROVAL reject: cancel ERP SI first, then void + reject under pending guard.
  if (parsed.data.action === "reject" && approval.type === ORDER_PAYMENT_APPROVAL && approval.orderId) {
    const orderForReject = await prisma.order.findUnique({
      where: { id: approval.orderId },
      select: {
        id: true,
        name: true,
        shopifyOrderId: true,
        erpnextInvoiceId: true,
        companyLocationId: true,
        companyLocation: { include: { erpnextInstance: true } },
      },
    });
    if (!orderForReject?.companyLocation) {
      return NextResponse.json(
        {
          error: "Order or company location not found for ERP cancellation.",
          code: "ERP_SI_CANCEL_FAILED",
          retryable: true,
          approvalStatus: "pending",
        },
        { status: 502 }
      );
    }

    const poNo = (orderForReject.name ?? orderForReject.shopifyOrderId ?? orderForReject.id).slice(0, 140);
    const realSiId = isRealErpSalesInvoiceId(orderForReject.erpnextInvoiceId)
      ? orderForReject.erpnextInvoiceId!.trim()
      : undefined;

    let cancelOutcome: "cancelled" | "already_cancelled" | "not_found";
    try {
      const cancelResult = await cancelErpnextSalesInvoice(poNo, orderForReject.companyLocation, {
        directInvoiceName: realSiId,
        strict: true,
      });
      cancelOutcome = cancelResult.outcome;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[ERPNext] order payment rejection SI cancel failed:", errMsg);
      await writeAuditLog({
        companyId,
        actorUserId: reviewerId,
        module: "orders",
        action: "order_payment_rejection_erp_cancel_failed",
        entityType: "Order",
        entityId: approval.orderId,
        summary: `ERP Sales Invoice cancel failed during order payment rejection for ${invoiceLabel({
          name: approval.orderName,
          orderNumber: approval.orderNumber,
          shopifyOrderId: approval.shopifyOrderId,
        })}`,
        metadata: {
          approvalId: approval.id,
          orderId: approval.orderId,
          companyLocationId: orderForReject.companyLocationId,
          erpInvoiceId: realSiId ?? null,
          error: errMsg.slice(0, 500),
        },
      });
      return NextResponse.json(
        {
          error: "ERP Sales Invoice could not be cancelled. The approval remains pending; retry rejection.",
          code: "ERP_SI_CANCEL_FAILED",
          retryable: true,
          approvalStatus: "pending",
        },
        { status: 502 }
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.$executeRaw(
          Prisma.sql`
            UPDATE "ApprovalRequest"
            SET
              "status" = 'rejected',
              "reviewedById" = ${reviewerId},
              "reviewNote" = ${reviewNote},
              "reviewedAt" = ${now},
              "updatedAt" = ${now}
            WHERE "id" = ${approval.id}
              AND "companyId" = ${companyId}
              AND "status" = 'pending'
          `
        );
        if (Number(updated) === 0) {
          throw new ConcurrentApprovalDecisionError();
        }

        await tx.order.update({
          where: { id: approval.orderId! },
          data: {
            financialStatus: "voided",
            cancelReason: reviewNote,
            cancelledAt: now,
            cancelledById: reviewerId,
          },
        });

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
    } catch (err) {
      if (err instanceof ConcurrentApprovalDecisionError) {
        return NextResponse.json({ error: "Approval request was already reviewed" }, { status: 409 });
      }
      throw err;
    }

    await writeAuditLog({
      companyId,
      actorUserId: reviewerId,
      module: "orders",
      action: "order_payment_rejected",
      entityType: "Order",
      entityId: approval.orderId,
      summary: `Finance rejected order payment for ${invoiceLabel({
        name: approval.orderName,
        orderNumber: approval.orderNumber,
        shopifyOrderId: approval.shopifyOrderId,
      })}`,
      metadata: {
        approvalId: approval.id,
        orderId: approval.orderId,
        companyLocationId: orderForReject.companyLocationId,
        erpInvoiceId: realSiId ?? null,
        erpInvoiceCancellation: cancelOutcome,
        reviewNote,
      },
    });

    await notifyApprovalRequester({
      companyId,
      approvalId: approval.id,
      status: "rejected",
      requestedById: approval.requestedById,
      approvalType: approval.type,
      invoiceLabel: invoiceLabel({
        name: approval.orderName,
        orderNumber: approval.orderNumber,
        shopifyOrderId: approval.shopifyOrderId,
      }),
    });

    return NextResponse.json({
      ok: true,
      status: "rejected",
      erpInvoiceCancellation: cancelOutcome,
    });
  }

  // BEFORE approving ORDER_PAYMENT: require a real SI and no active retry lease.
  if (parsed.data.action === "approve" && approval.type === ORDER_PAYMENT_APPROVAL && approval.orderId) {
    const orderErp = await prisma.order.findUnique({
      where: { id: approval.orderId },
      select: { erpnextInvoiceId: true, erpnextSyncRetryLeaseExpiresAt: true },
    });
    if (
      !orderErp ||
      isPlaceholderErpInvoiceId(orderErp.erpnextInvoiceId) ||
      isActiveErpSiRetryLease(orderErp.erpnextSyncRetryLeaseExpiresAt, now)
    ) {
      return NextResponse.json(
        {
          error: "ERP Sales Invoice is not ready. Retry ERP sync before approving this order.",
          code: "ERP_SI_NOT_READY",
          retryable: true,
          approvalStatus: "pending",
        },
        { status: 409 }
      );
    }
  }

  const isBankTransferApproval =
    approval.type === PAYMENT_METHOD_CHANGE_APPROVAL &&
    (approval.requestNote?.toLowerCase().startsWith("bank transfer") ?? false);
  const isPaymentReapproval =
    nextStatus === "approved" &&
    approval.orderId != null &&
    (approval.type === ORDER_PAYMENT_APPROVAL || approval.type === DELIVERY_PAYMENT_APPROVAL) &&
    (await hasPriorApprovedPaymentApproval(
      approval.orderId,
      approval.type as typeof ORDER_PAYMENT_APPROVAL | typeof DELIVERY_PAYMENT_APPROVAL,
      approval.id,
    ));

  try {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.$executeRaw(
      Prisma.sql`
        UPDATE "ApprovalRequest"
        SET
          "status" = ${nextStatus},
          "reviewedById" = ${reviewerId},
          "reviewNote" = ${reviewNote},
          "reviewedAt" = ${now},
          "updatedAt" = ${now}
        WHERE "id" = ${approval.id}
          AND "companyId" = ${companyId}
          AND "status" = 'pending'
      `
    );
    if (Number(updated) === 0) {
      throw new ConcurrentApprovalDecisionError();
    }

    if (nextStatus === "rejected" && approval.type === RETURN_CANCEL_APPROVAL && approval.orderReturnId) {
      // Cancel was rejected — reset the return to pending so staff can continue processing it normally.
      await tx.orderReturn.update({
        where: { id: approval.orderReturnId },
        data: {
          actionType: null,
          actionStatus: "pending",
          actionDate: now,
          actionById: reviewerId,
        },
      });
    }

    if (nextStatus === "approved") {
      if (approval.type === ORDER_PAYMENT_APPROVAL) {
        const orderForStage = await tx.order.findUnique({
          where: { id: approval.orderId! },
          select: { fulfillmentStage: true },
        });
        const stage = orderForStage?.fulfillmentStage;
        // Already fully invoice-complete: keep stage (do not re-queue via print).
        // At delivery_complete: close invoice complete (late finance approval after deliver).
        // Earlier stages: mark invoice complete financially, go to print, continue fulfillment.
        if (stage === "invoice_complete") {
          await tx.order.update({
            where: { id: approval.orderId! },
            data: { financialStatus: "paid" },
          });
        } else if (stage === "delivery_complete") {
          await tx.order.update({
            where: { id: approval.orderId! },
            data: {
              financialStatus: "paid",
              ...orderStageUpdate("invoice_complete", now),
              fulfillmentStatus: "fulfilled",
              invoiceCompleteAt: now,
              invoiceCompleteById: reviewerId,
            },
          });
        } else {
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
        }
        // Prepaid confirmation covers door collection — drop any stale Delivery Collection row.
        await tx.$executeRaw(
          Prisma.sql`
            UPDATE "ApprovalRequest"
            SET "status" = 'cancelled', "updatedAt" = ${now},
                "reviewNote" = ${"Order payment approved — Delivery Collection not required."}
            WHERE "orderId" = ${approval.orderId}
              AND "companyId" = ${companyId}
              AND "type" = ${"delivery_payment_approval"}
              AND "status" = 'pending'
          `
        );
      } else if (approval.type === DELIVERY_PAYMENT_APPROVAL) {
        // Door-collection confirm: paid only — invoice complete stays manual on the queue.
        await tx.order.update({
          where: { id: approval.orderId! },
          data: { financialStatus: "paid" },
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
      } else if (approval.type === PAYMENT_METHOD_CHANGE_APPROVAL) {
        // COD → KOKO or COD → Bank Transfer approved by finance: switch gateway, mark paid.
        const gateway = isBankTransferApproval ? "bank_transfer" : "koko";
        const orderForStage = await tx.order.findUnique({
          where: { id: approval.orderId! },
          select: { fulfillmentStage: true },
        });
        const stage = orderForStage?.fulfillmentStage;
        // Already at fulfillment invoice_complete: keep stage.
        // At delivery_complete: close invoice complete (prepaid change after deliver).
        // Earlier: print + mark invoice complete financially, continue fulfillment (Flow 1).
        const stageData =
          stage === "invoice_complete"
            ? {}
            : stage === "delivery_complete"
              ? {
                  ...orderStageUpdate("invoice_complete", now),
                  fulfillmentStatus: "fulfilled" as const,
                  invoiceCompleteAt: now,
                  invoiceCompleteById: reviewerId,
                }
              : {
                  ...orderStageUpdate("print", now),
                  sampleFreeIssueCompleteAt: now,
                  sampleFreeIssueCompleteById: reviewerId,
                  invoiceCompleteAt: now,
                  invoiceCompleteById: reviewerId,
                };
        await tx.order.update({
          where: { id: approval.orderId! },
          data: {
            paymentGatewayNames: [gateway],
            paymentGatewayPrimary: gateway,
            financialStatus: "paid",
            ...stageData,
          },
        });
        // Cancel any pending delivery payment approval for this order — the payment method
        // change covers the same confirmation, so the DP approval is no longer needed.
        await tx.$executeRaw(
          Prisma.sql`
            UPDATE "ApprovalRequest"
            SET "status" = 'cancelled', "updatedAt" = ${now}
            WHERE "orderId" = ${approval.orderId}
              AND "companyId" = ${companyId}
              AND "type" = ${"delivery_payment_approval"}
              AND "status" = 'pending'
          `
        );
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
      } else if (approval.type === ORDER_CANCEL_APPROVAL && approval.orderId) {
        // Finance approved — mark order voided in DB. Shopify cancel fires automatically after the tx.
        await tx.order.update({
          where: { id: approval.orderId },
          data: {
            financialStatus: "voided",
            cancelledAt: now,
            cancelledById: reviewerId,
            cancelReason: approval.requestNote,
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
  } catch (err) {
    if (err instanceof ConcurrentApprovalDecisionError) {
      return NextResponse.json({ error: "Approval request was already reviewed" }, { status: 409 });
    }
    throw err;
  }

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

  if (approval.type === RETURN_CANCEL_APPROVAL && approval.orderReturnId) {
    await writeAuditLog({
      companyId,
      actorUserId: reviewerId,
      module: "orders",
      action: nextStatus === "approved" ? "returned_order_cancel_approved" : "returned_order_cancel_rejected",
      entityType: "OrderReturn",
      entityId: approval.orderReturnId,
      summary: nextStatus === "approved"
        ? `Finance acknowledged cancel for ${invoiceLabel({ name: approval.orderName, orderNumber: approval.orderNumber, shopifyOrderId: approval.shopifyOrderId })} (process in ERPNext)`
        : `Finance rejected cancel for ${invoiceLabel({ name: approval.orderName, orderNumber: approval.orderNumber, shopifyOrderId: approval.shopifyOrderId })} — return reset to pending`,
      metadata: { approvalId: approval.id, orderId: approval.orderId },
    });
  }

  if (approval.type === ORDER_CANCEL_APPROVAL && approval.orderId) {
    const label = invoiceLabel({ name: approval.orderName, orderNumber: approval.orderNumber, shopifyOrderId: approval.shopifyOrderId });
    await writeAuditLog({
      companyId,
      actorUserId: reviewerId,
      module: "orders",
      action: nextStatus === "approved" ? "order_cancel_approved" : "order_cancel_rejected",
      entityType: "Order",
      entityId: approval.orderId,
      summary: nextStatus === "approved"
        ? `Finance approved order cancel for ${label} — order marked voided`
        : `Finance rejected order cancel for ${label}`,
      metadata: { approvalId: approval.id, cancelReason: approval.requestNote },
    });
  }

  // Auto-cancel in Shopify when a paid order cancel is approved (Cosmo only).
  // Vault has no Admin API — staff cancel in Shopify; webhook syncs OS/ERP.
  // Non-fatal — ERP credit note and DB void are already committed at this point.
  if (
    nextStatus === "approved" &&
    approval.type === ORDER_CANCEL_APPROVAL &&
    approval.orderId &&
    approval.shopifyOrderId &&
    isRealShopifyOrderId(approval.shopifyOrderId) &&
    !shouldBlockShopifyCancelInOs(approval.shopifyOrderId)
  ) {
    try {
      const orderForCancel = await prisma.order.findUnique({
        where: { id: approval.orderId },
        select: { companyLocationId: true },
      });
      const location = orderForCancel?.companyLocationId
        ? await prisma.companyLocation.findUnique({
            where: { id: orderForCancel.companyLocationId },
            select: { shopifyAdminStoreHandle: true },
          })
        : null;
      if (location?.shopifyAdminStoreHandle) {
        await cancelShopifyOrder(approval.shopifyOrderId, location.shopifyAdminStoreHandle);
        console.log(`[Cancel] Shopify order ${approval.shopifyOrderId} cancelled via approval ${approval.id}`);
      } else {
        console.warn(`[Cancel] No shopifyAdminStoreHandle for order ${approval.orderId} — skipping Shopify cancel`);
      }
    } catch (err) {
      console.error(`[Cancel] Shopify cancel failed (non-fatal) for order ${approval.orderId}:`, err);
    }
  } else if (
    nextStatus === "approved" &&
    approval.type === ORDER_CANCEL_APPROVAL &&
    shouldBlockShopifyCancelInOs(approval.shopifyOrderId)
  ) {
    console.warn(
      `[Cancel] Skipping Shopify Admin cancel on Vault for order ${approval.orderId} — cancel in Shopify instead`,
    );
  }

  let erpSyncFailed = false;
  let erpSyncError: string | undefined;

  // First-time approval only — re-approval after HOD revert updates Vault paid status; ERP SI stays unchanged.
  // Bank transfer method change gets a PE (not SI), handled separately below.
  if (
    nextStatus === "approved" &&
    !isPaymentReapproval &&
    (approval.type === ORDER_PAYMENT_APPROVAL ||
      (approval.type === PAYMENT_METHOD_CHANGE_APPROVAL && !isBankTransferApproval)) &&
    approval.orderId
  ) {
    try {
      await runPostApprovalErpSync(approval.orderId, now);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[ERPNext] post-approval sync failed:", errMsg);
      const isPeFailure =
        /payment entry|payment mode|Sales Invoice|Mode of Payment|prepaid/i.test(errMsg);
      if (isPeFailure) {
        await markOrderErpPeSyncFailed(approval.orderId, errMsg, ERP_PE_SYNC_MOP_ORDER_AUTO);
      } else {
        await markOrderErpSyncFailed(approval.orderId, errMsg);
      }
      erpSyncFailed = true;
      erpSyncError = errMsg;
    }
  }

  if (nextStatus === "approved" && !isPaymentReapproval && isBankTransferApproval && approval.orderId) {
    const orderForErp = await prisma.order.findUnique({
      where: { id: approval.orderId },
      select: { name: true, shopifyOrderId: true, companyLocationId: true },
    });
    if (orderForErp?.companyLocationId) {
      const location = await prisma.companyLocation.findUnique({
        where: { id: orderForErp.companyLocationId },
        include: { erpnextInstance: true },
      });
      if (location) {
        try {
          const poNo = (orderForErp.name ?? orderForErp.shopifyOrderId ?? approval.orderId).slice(0, 140);
          const dateStr = now.toISOString().slice(0, 10);
          await syncBankTransferPaymentToERPNext(poNo, location, dateStr);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error("[ERPNext] bank transfer PE failed:", errMsg);
          await markOrderErpPeSyncFailed(approval.orderId, errMsg, "bank_transfer");
          erpSyncFailed = true;
          erpSyncError = errMsg;
        }
      }
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
        await createDeliveryPaymentEntry(order, order.companyLocation, now, { requireMop: true });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[ERPNext] delivery payment approval PE failed:", errMsg);
        await markOrderErpPeSyncFailed(
          order.id,
          errMsg,
          order.paymentGatewayPrimary ?? ERP_PE_SYNC_MOP_ORDER_AUTO,
        );
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
