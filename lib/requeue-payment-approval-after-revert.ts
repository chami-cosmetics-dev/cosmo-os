import { prisma } from "@/lib/prisma";
import {
  createOrGetOrderPaymentApproval,
  isOrderPaymentRequiresApproval,
} from "@/lib/approval-workflow";
import { triggerDeliveryPaymentApprovalIfNeeded } from "@/lib/delivery-payment-approval";
import { releaseKokoReferencesForOrder } from "@/lib/koko-approval-references";

function invoiceLabel(order: {
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId: string;
}) {
  return order.name ?? order.orderNumber ?? order.shopifyOrderId;
}

/** Queue a new finance approval after HOD reverts paid → unpaid. */
export async function requeuePaymentApprovalAfterRevert(input: {
  companyId: string;
  orderId: string;
  requestedById: string;
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
      fulfillmentStage: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
    },
  });
  if (!order) return null;

  const useDeliveryApproval =
    order.fulfillmentStage === "delivery_complete" ||
    order.fulfillmentStage === "dispatched" ||
    order.fulfillmentStage === "invoice_complete";

  if (useDeliveryApproval) {
    return triggerDeliveryPaymentApprovalIfNeeded({
      companyId: input.companyId,
      orderId: order.id,
      requestedById: input.requestedById,
    });
  }

  // Only KOKO/bank/Vault card-on-delivery need pre-dispatch finance approval.
  // COD etc. are handled at delivery via DELIVERY_PAYMENT_APPROVAL.
  if (isOrderPaymentRequiresApproval(order)) {
    // Free prior KOKO refs so finance can re-enter the same payment numbers.
    await releaseKokoReferencesForOrder(order.id);
    return createOrGetOrderPaymentApproval({
      companyId: input.companyId,
      orderId: order.id,
      requestedById: input.requestedById,
      invoiceLabel: invoiceLabel(order),
      paymentType: order.paymentGatewayPrimary ?? order.paymentGatewayNames[0] ?? "payment",
      amount: order.totalPrice.toString(),
      forceCreate: true,
    });
  }

  return null;
}
