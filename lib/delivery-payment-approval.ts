import { prisma } from "@/lib/prisma";
import { createOrGetDeliveryPaymentApproval, getApprovedOrderPaymentReviewerId } from "@/lib/approval-workflow";

export type PostDeliveryInvoiceResult =
  | { kind: "awaiting_manual_invoice_complete" }
  | { kind: "close_invoice_complete"; financeUserId: string };

// Gateways where payment is collected before or at time of sale — never at the door.
function isPrePaidGateway(gateway: string): boolean {
  return (
    gateway.includes("koko") ||
    gateway.includes("bank") ||
    gateway.includes("webxpay") ||
    gateway === "cc" ||
    gateway === "cc checkout"
  );
}

/**
 * After mark delivered:
 * - Finance-approved prepaid (already invoice-complete + PE at approval): close fulfillment
 *   stage to invoice_complete (PE usually already paid / no-op).
 * - Everyone else: stay on delivery_complete for manual /fulfillment/invoice-complete.
 */
export async function resolvePostDeliveryInvoiceComplete(input: {
  companyId: string;
  orderId: string;
  requestedById: string | null;
}): Promise<PostDeliveryInvoiceResult> {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    select: {
      id: true,
      financialStatus: true,
      paymentGatewayPrimary: true,
      invoiceCompleteAt: true,
    },
  });
  if (!order) {
    return { kind: "awaiting_manual_invoice_complete" };
  }

  // Already marked invoice complete at finance approval (timestamp set, then went to print).
  if (order.invoiceCompleteAt) {
    const reviewerId =
      (await getApprovedOrderPaymentReviewerId(order.id)) ?? input.requestedById ?? "";
    return { kind: "close_invoice_complete", financeUserId: reviewerId };
  }

  const earlyFinanceUserId = await getApprovedOrderPaymentReviewerId(order.id);
  if (earlyFinanceUserId) {
    return { kind: "close_invoice_complete", financeUserId: earlyFinanceUserId };
  }

  // Prepaid already paid (e.g. approval path set paid + PE) but timestamp missing — still close.
  const gateway = order.paymentGatewayPrimary?.toLowerCase().trim() ?? "";
  if (isPrePaidGateway(gateway) && order.financialStatus?.toLowerCase() === "paid") {
    return { kind: "close_invoice_complete", financeUserId: input.requestedById ?? "" };
  }

  return { kind: "awaiting_manual_invoice_complete" };
}

/** Trigger a delivery payment approval so finance can confirm payment was collected at the door. */
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
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      financialStatus: true,
      totalPrice: true,
      dispatchedByCourierServiceId: true,
      dispatchedToCustomer: true,
      companyLocationId: true,
    },
  });
  if (!order) return null;

  if (order.dispatchedByCourierServiceId) return null;
  if (order.dispatchedToCustomer) return null;

  const gateway = order.paymentGatewayPrimary?.toLowerCase().trim() ?? "";
  if (isPrePaidGateway(gateway)) return null;

  const invoiceLabel = order.name ?? order.orderNumber ?? order.shopifyOrderId;
  const paymentType = order.paymentGatewayPrimary ?? order.paymentGatewayNames[0] ?? "payment";

  return createOrGetDeliveryPaymentApproval({
    companyId: input.companyId,
    orderId: order.id,
    requestedById: input.requestedById,
    invoiceLabel,
    paymentType,
    amount: order.totalPrice.toString(),
    companyLocationId: order.companyLocationId,
  });
}
