import { prisma } from "@/lib/prisma";
import {
  createOrGetDeliveryPaymentApproval,
  getApprovedOrderPaymentReviewerId,
  isOrderPaymentRequiresApproval,
  ORDER_PAYMENT_APPROVAL,
} from "@/lib/approval-workflow";

export type PostDeliveryInvoiceResult =
  | { kind: "awaiting_manual_invoice_complete" }
  | { kind: "close_invoice_complete"; financeUserId: string };

/** Gateways where payment is collected before / at sale — never as door cash. */
export function isPrePaidGateway(gateway: string): boolean {
  const g = gateway.toLowerCase().trim();
  return (
    g.includes("koko") ||
    g.includes("bank") ||
    g.includes("webxpay") ||
    g === "cc" ||
    g === "cc checkout"
  );
}

/**
 * True when this order must not get a Delivery Collection approval.
 * Prefer primary gateway (same rule as order-payment approval); fall back to names
 * only when primary is empty so KOKO in names still skips the door-collection queue.
 */
export function shouldSkipDeliveryPaymentApproval(order: {
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[];
}): boolean {
  const normalized = {
    paymentGatewayPrimary: order.paymentGatewayPrimary ?? null,
    paymentGatewayNames: order.paymentGatewayNames ?? [],
  };
  if (isOrderPaymentRequiresApproval(normalized)) return true;

  if (normalized.paymentGatewayPrimary) {
    return isPrePaidGateway(normalized.paymentGatewayPrimary);
  }
  return normalized.paymentGatewayNames.some((g) => isPrePaidGateway(g));
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
      paymentGatewayNames: true,
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
  if (
    shouldSkipDeliveryPaymentApproval(order) &&
    order.financialStatus?.toLowerCase() === "paid"
  ) {
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
      approvalRequests: {
        where: {
          type: ORDER_PAYMENT_APPROVAL,
          status: { in: ["pending", "approved"] },
        },
        select: { id: true, status: true },
        take: 1,
      },
    },
  });
  if (!order) return null;

  if (order.dispatchedByCourierServiceId) return null;
  if (order.dispatchedToCustomer) return null;

  // KOKO / bank / other prepaid: use Order Payment approval, never Delivery Collection.
  if (shouldSkipDeliveryPaymentApproval(order)) return null;

  // Already has (or waiting on) order-payment finance confirmation — do not double-queue.
  if (order.approvalRequests.length > 0) return null;

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
