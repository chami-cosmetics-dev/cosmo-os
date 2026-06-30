import {
  DELIVERY_PAYMENT_APPROVAL,
  ORDER_PAYMENT_APPROVAL,
} from "@/lib/approval-workflow";
import { writeAuditLog } from "@/lib/audit-log";
import {
  clearOrderErpPeSyncFailure,
  ERP_PE_SYNC_MOP_ORDER_AUTO,
  markOrderErpPeSyncFailed,
} from "@/lib/failed-erp-pe-sync";
import { createDeliveryPaymentEntry, getErpConfig, resolveOrderPaymentMop } from "@/lib/erpnext-sync";
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
  /** When omitted, PE uses the order's Vault payment method mapped to ERP. */
  modeOfPayment?: string;
  bulk?: boolean;
}): Promise<MarkOrderInvoiceCompleteResult> {
  const now = new Date();
  const mopOverride = input.modeOfPayment?.trim() || undefined;

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
  const erpCfg = order.companyLocation?.erpnextInstance
    ? getErpConfig(order.companyLocation.erpnextInstance)
    : null;
  const resolvedMop =
    mopOverride ??
    (erpCfg
      ? resolveOrderPaymentMop(erpCfg, order.paymentGatewayPrimary, order.paymentGatewayNames)
      : null) ??
    undefined;

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
        {
          mopNameOverride: mopOverride,
          requireMop: true,
        },
      );
      await clearOrderErpPeSyncFailure(order.id);
    } catch (err) {
      erpPeError = err instanceof Error ? err.message : String(err);
      console.error("[ERPNext] invoice-complete PE failed:", erpPeError);
      await markOrderErpPeSyncFailed(
        order.id,
        erpPeError,
        resolvedMop ?? mopOverride ?? ERP_PE_SYNC_MOP_ORDER_AUTO,
        now,
      );
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
      paymentMop: mopOverride ?? resolvedMop ?? null,
      paymentMopSource: mopOverride ? "override" : "order",
    },
  });

  return { success: true, ref, ...(erpPeError ? { erpPeError } : {}) };
}
