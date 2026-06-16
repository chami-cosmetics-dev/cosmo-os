import { prisma } from "@/lib/prisma";
import {
  createOrGetDeliveryPaymentApproval,
  orderRequiresDeliveryPaymentApproval,
} from "@/lib/approval-workflow";
import { inferExpectedPaymentMethod } from "@/lib/mobile/payment";

function invoiceLabel(order: {
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId: string;
}) {
  return order.name ?? order.orderNumber ?? order.shopifyOrderId;
}

/** After delivery is marked complete, queue finance approval instead of auto-marking paid. */
export async function triggerDeliveryPaymentApprovalIfNeeded(input: {
  companyId: string;
  orderId: string;
  requestedById: string | null;
}) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      totalPrice: true,
      financialStatus: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
    },
  });
  if (!order || !orderRequiresDeliveryPaymentApproval(order)) {
    return null;
  }

  const deliveryPayment = await prisma.deliveryPayment.findUnique({
    where: { orderId: order.id },
    select: {
      paymentMethod: true,
      collectedAmount: true,
      bankReference: true,
      cardReference: true,
      referenceNote: true,
    },
  });

  const paymentType = deliveryPayment?.paymentMethod
    ? deliveryPayment.paymentMethod.replace(/_/g, " ")
    : inferExpectedPaymentMethod(order).replace(/_/g, " ");

  const collectionNote = deliveryPayment
    ? [
        deliveryPayment.bankReference ? `Bank ref: ${deliveryPayment.bankReference}` : null,
        deliveryPayment.cardReference ? `Card ref: ${deliveryPayment.cardReference}` : null,
        deliveryPayment.referenceNote ? `Note: ${deliveryPayment.referenceNote}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "Delivery completed — awaiting finance payment confirmation.";

  return createOrGetDeliveryPaymentApproval({
    companyId: input.companyId,
    orderId: order.id,
    requestedById: input.requestedById,
    invoiceLabel: invoiceLabel(order),
    paymentType,
    amount: (deliveryPayment?.collectedAmount ?? order.totalPrice).toString(),
    collectionNote,
  });
}
