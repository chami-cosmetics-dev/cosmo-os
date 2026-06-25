import type { FulfillmentStage } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit-log";
import { resolvePostDeliveryInvoiceComplete } from "@/lib/delivery-payment-approval";
import { orderStageUpdate } from "@/lib/order-stage-timing";
import {
  resolveCustomerPhone,
  resolveOrderInvoiceNumber,
  resolveOrderNumber,
  sendOrderSms,
} from "@/lib/order-sms";
import { prisma } from "@/lib/prisma";

export type MarkOrderDeliveredResult =
  | {
      success: true;
      ref: string;
      needsPaymentApproval: boolean;
      afterStage: FulfillmentStage;
    }
  | { success: false; ref: string; error: string };

export async function markOrderDelivered(input: {
  companyId: string;
  orderId: string;
  userId: string;
  bulk?: boolean;
}): Promise<MarkOrderDeliveredResult> {
  const now = new Date();

  const order = await prisma.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      fulfillmentStage: true,
    },
  });

  const ref = order?.name ?? order?.orderNumber ?? input.orderId;
  if (!order) {
    return { success: false, ref, error: "Order not found" };
  }
  if (order.fulfillmentStage !== "dispatched") {
    return {
      success: false,
      ref,
      error: "Can only mark delivered when order is dispatched",
    };
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      ...orderStageUpdate("delivery_complete", now),
      deliveryCompleteAt: now,
      deliveryCompleteById: input.userId,
      deliveryOutcome: "delivered",
      deliveryFailedReason: null,
      lastRiderUpdateAt: now,
      riderDeliveryToken: null,
    },
    include: { companyLocation: true },
  });

  await prisma.riderDeliveryTask.updateMany({
    where: { orderId: order.id },
    data: {
      status: "completed",
      completedAt: now,
      failedAt: null,
      failureReason: null,
      latestSyncAt: now,
    },
  });

  const postDelivery = await resolvePostDeliveryInvoiceComplete({
    companyId: input.companyId,
    orderId: order.id,
    requestedById: input.userId,
  });

  let afterStage: FulfillmentStage = "delivery_complete";
  const needsPaymentApproval = postDelivery.kind === "awaiting_finance";

  if (postDelivery.kind === "invoice_complete") {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        ...orderStageUpdate("invoice_complete", now),
        fulfillmentStatus: "fulfilled",
        invoiceCompleteAt: now,
        invoiceCompleteById: postDelivery.financeUserId,
      },
    });
    afterStage = "invoice_complete";
  }

  sendOrderSms(input.companyId, order.id, "delivery_complete", {
    orderNumber: resolveOrderNumber(updated),
    invoiceNumber: resolveOrderInvoiceNumber(updated),
    customerPhone: resolveCustomerPhone(updated),
    locationName: updated.companyLocation.name,
  }).catch((err) => console.error("[Order SMS] delivery_complete failed:", err));

  const orderNum = updated.orderNumber ?? updated.name ?? updated.id;
  await writeAuditLog({
    companyId: input.companyId,
    actorUserId: input.userId,
    module: "orders",
    action: "fulfillment_updated",
    entityType: "Order",
    entityId: order.id,
    summary:
      afterStage === "invoice_complete"
        ? `Marked order ${orderNum} as delivered — invoice complete (finance payment approval)`
        : needsPaymentApproval
          ? `Marked order ${orderNum} as delivered — awaiting finance invoice complete`
          : `Marked order ${orderNum} as delivered`,
    beforeData: { fulfillmentStage: order.fulfillmentStage },
    afterData: { fulfillmentStage: afterStage },
    metadata: {
      action: "mark_delivered",
      needsPaymentApproval,
      bulk: input.bulk ?? false,
    },
  });

  return { success: true, ref, needsPaymentApproval, afterStage };
}
