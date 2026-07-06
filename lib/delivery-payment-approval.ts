import { prisma } from "@/lib/prisma";
import { createOrGetDeliveryPaymentApproval, getApprovedOrderPaymentReviewerId } from "@/lib/approval-workflow";

export type PostDeliveryInvoiceResult =
  | { kind: "awaiting_finance" }
  | { kind: "invoice_complete"; financeUserId: string; createPe?: boolean };

/**
 * After store marks delivered: pre-approved KOKO/bank → invoice complete;
 * otherwise finance uses the invoice-complete queue (no delivery payment approvals).
 */
export async function resolvePostDeliveryInvoiceComplete(input: {
  companyId: string;
  orderId: string;
  requestedById: string | null;
}): Promise<PostDeliveryInvoiceResult> {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, companyId: input.companyId },
    select: { id: true, financialStatus: true, paymentGatewayPrimary: true },
  });
  if (!order) {
    return { kind: "awaiting_finance" };
  }

  const earlyFinanceUserId = await getApprovedOrderPaymentReviewerId(order.id);
  if (earlyFinanceUserId) {
    return { kind: "invoice_complete", financeUserId: earlyFinanceUserId };
  }

  // WebXPay is an online payment gateway — money is collected at checkout, not at the door.
  // Auto-complete to invoice_complete and trigger PE creation so ERP is reconciled.
  const gateway = order.paymentGatewayPrimary?.toLowerCase().trim() ?? "";
  if (gateway.includes("webxpay") && order.financialStatus?.toLowerCase() === "paid") {
    return { kind: "invoice_complete", financeUserId: input.requestedById ?? "", createPe: true };
  }

  return { kind: "awaiting_finance" };
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
      totalPrice: true,
      dispatchedByCourierServiceId: true,
      dispatchedToCustomer: true,
    },
  });
  if (!order) return null;

  // Courier service deliveries (e.g. Citypack) don't require finance to confirm payment collection.
  if (order.dispatchedByCourierServiceId) return null;

  // Customer pickups are collected in-store — no rider payment collection to confirm.
  if (order.dispatchedToCustomer) return null;

  const invoiceLabel = order.name ?? order.orderNumber ?? order.shopifyOrderId;
  const paymentType = order.paymentGatewayPrimary ?? order.paymentGatewayNames[0] ?? "payment";

  return createOrGetDeliveryPaymentApproval({
    companyId: input.companyId,
    orderId: order.id,
    requestedById: input.requestedById,
    invoiceLabel,
    paymentType,
    amount: order.totalPrice.toString(),
  });
}
