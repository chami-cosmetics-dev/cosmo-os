import {
  DELIVERY_PAYMENT_APPROVAL,
  ORDER_PAYMENT_APPROVAL,
} from "@/lib/approval-workflow";
import { writeAuditLog } from "@/lib/audit-log";
import {
  clearOrderErpPeSyncFailure,
  markOrderErpPeSyncFailed,
} from "@/lib/failed-erp-pe-sync";
import { createDeliveryPaymentEntry } from "@/lib/erpnext-sync";
import { orderStageUpdate } from "@/lib/order-stage-timing";
import { prisma } from "@/lib/prisma";

export type MarkOrderInvoiceCompleteResult =
  | {
      success: true;
      ref: string;
      erpPeError?: string;
    }
  | { success: false; ref: string; error: string };

export async function markOrderInvoiceComplete(input: {
  companyId: string;
  orderId: string;
  userId: string;
  modeOfPayment: string;
  bulk?: boolean;
}): Promise<MarkOrderInvoiceCompleteResult> {
  const now = new Date();
  const mopName = input.modeOfPayment.trim();

  const order = await prisma.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    include: { companyLocation: { include: { erpnextInstance: true } } },
  });

  const ref = order?.name ?? order?.orderNumber ?? input.orderId;
  if (!order) {
    return { success: false, ref, error: "Order not found" };
  }
  if (order.fulfillmentStage !== "delivery_complete") {
    return {
      success: false,
      ref,
      error: "Can only mark invoice complete when delivery is complete",
    };
  }
  if (!mopName) {
    return { success: false, ref, error: "ERP payment mode is required" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        ...orderStageUpdate("invoice_complete", now),
        fulfillmentStatus: "fulfilled",
        financialStatus: "paid",
        invoiceCompleteAt: now,
        invoiceCompleteById: input.userId,
      },
    });

    await tx.approvalRequest.updateMany({
      where: {
        orderId: order.id,
        status: "pending",
        type: { in: [ORDER_PAYMENT_APPROVAL, DELIVERY_PAYMENT_APPROVAL] },
      },
      data: {
        status: "cancelled",
        reviewNote: "Invoice marked complete by finance.",
        updatedAt: now,
      },
    });
  });

  let erpPeError: string | undefined;
  if (order.companyLocation) {
    try {
      await createDeliveryPaymentEntry(
        {
          name: order.name,
          shopifyOrderId: order.shopifyOrderId,
          sourceName: order.sourceName,
          paymentGatewayPrimary: order.paymentGatewayPrimary,
          paymentGatewayNames: order.paymentGatewayNames,
        },
        order.companyLocation,
        now,
        { mopNameOverride: mopName },
      );
      await clearOrderErpPeSyncFailure(order.id);
    } catch (err) {
      erpPeError = err instanceof Error ? err.message : String(err);
      console.error("[ERPNext] invoice-complete PE failed:", erpPeError);
      await markOrderErpPeSyncFailed(order.id, erpPeError, mopName, now);
    }
  }

  const orderNum = order.orderNumber ?? order.name ?? order.id;
  await writeAuditLog({
    companyId: input.companyId,
    actorUserId: input.userId,
    module: "orders",
    action: "fulfillment_updated",
    entityType: "Order",
    entityId: order.id,
    summary: erpPeError
      ? `Marked invoice complete for ${orderNum} (ERP payment entry failed)`
      : `Marked invoice complete for ${orderNum}`,
    beforeData: { fulfillmentStage: order.fulfillmentStage },
    afterData: { fulfillmentStage: "invoice_complete" },
    metadata: {
      action: "mark_invoice_complete",
      bulk: input.bulk ?? false,
      erpPeError: erpPeError ?? null,
      paymentMop: mopName,
    },
  });

  return { success: true, ref, ...(erpPeError ? { erpPeError } : {}) };
}
