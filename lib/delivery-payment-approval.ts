import type { FulfillmentStage } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  createOrGetDeliveryPaymentApproval,
  getApprovedOrderPaymentReviewerId,
  isOrderPaymentRequiresApproval,
  ORDER_PAYMENT_APPROVAL,
} from "@/lib/approval-workflow";
import { markOrderInvoiceComplete } from "@/lib/mark-order-invoice-complete";
import { orderHasCardOnDeliveryGateway } from "@/lib/payment-method-label";

export type PostDeliveryInvoiceResult =
  | { kind: "awaiting_manual_invoice_complete" }
  | { kind: "close_invoice_complete"; financeUserId: string };

/** Normalize gateway strings for matching (case, underscores, hyphens). */
export function normalizePaymentGatewayKey(gateway: string): string {
  return gateway
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/** CC Checkout / card gateway class — maps to WebXPay ERP MOP. */
export function isCcCheckoutGateway(gateway: string): boolean {
  const g = normalizePaymentGatewayKey(gateway);
  return g === "cc" || g === "cc checkout";
}

export function isWebxpayGateway(gateway: string): boolean {
  return normalizePaymentGatewayKey(gateway).includes("webxpay");
}

export function orderHasCcCheckoutGateway(order: {
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[];
}): boolean {
  if (order.paymentGatewayPrimary && isCcCheckoutGateway(order.paymentGatewayPrimary)) {
    return true;
  }
  return (order.paymentGatewayNames ?? []).some((g) => isCcCheckoutGateway(g));
}

/**
 * Paid-at-intake gateways: set OS `invoiceCompleteAt` when PE succeeds at SI sync
 * so they never need a second manual invoice-complete (KOKO/bank use finance approval instead).
 */
export function isEarlyFinancialInvoiceCompleteGateway(gateway: string): boolean {
  return isCcCheckoutGateway(gateway) || isWebxpayGateway(gateway);
}

export function orderHasEarlyFinancialInvoiceCompleteGateway(order: {
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[];
}): boolean {
  if (
    order.paymentGatewayPrimary &&
    isEarlyFinancialInvoiceCompleteGateway(order.paymentGatewayPrimary)
  ) {
    return true;
  }
  return (order.paymentGatewayNames ?? []).some((g) =>
    isEarlyFinancialInvoiceCompleteGateway(g),
  );
}

/** Gateways where payment is collected before / at sale — never as door cash. */
export function isPrePaidGateway(gateway: string): boolean {
  const g = normalizePaymentGatewayKey(gateway);
  return (
    g.includes("koko") ||
    g.includes("mintpay") ||
    g.includes("bank") ||
    g.includes("webxpay") ||
    isCcCheckoutGateway(gateway)
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
  if (orderHasCardOnDeliveryGateway(normalized)) return false;
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
      revertedFromInvoiceCompleteAt: true,
    },
  });
  if (!order) {
    return { kind: "awaiting_manual_invoice_complete" };
  }

  const financial = order.financialStatus?.toLowerCase() ?? "";
  if (
    order.revertedFromInvoiceCompleteAt ||
    financial === "refunded" ||
    financial === "voided"
  ) {
    return { kind: "awaiting_manual_invoice_complete" };
  }

  // Already marked invoice complete at finance approval (timestamp set, then went to print).
  if (order.invoiceCompleteAt) {
    const reviewerId =
      (await getApprovedOrderPaymentReviewerId(order.id)) ?? input.requestedById ?? "";
    return { kind: "close_invoice_complete", financeUserId: reviewerId };
  }

  const earlyFinanceUserId = await getApprovedOrderPaymentReviewerId(order.id);
  // Card-on-delivery intake finance is approved but stays unpaid — still need door collection.
  if (earlyFinanceUserId && order.financialStatus?.toLowerCase() === "paid") {
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

export type PostDeliveryApplyResult = {
  afterStage: FulfillmentStage;
  needsPaymentApproval: boolean;
};

/**
 * After delivery: close prepaid (KOKO / bank / CC / …) to invoice_complete,
 * or queue Delivery Collection for door-cash orders.
 */
export async function applyPostDeliveryInvoiceAndPayment(input: {
  companyId: string;
  orderId: string;
  requestedById: string | null;
}): Promise<PostDeliveryApplyResult> {
  const postDelivery = await resolvePostDeliveryInvoiceComplete(input);
  if (postDelivery.kind === "close_invoice_complete") {
    const actorId = postDelivery.financeUserId.trim() || input.requestedById?.trim() || "";
    const outcome = await markOrderInvoiceComplete({
      companyId: input.companyId,
      orderId: input.orderId,
      userId: actorId,
    });
    if (!outcome.success) {
      console.error(
        `[Delivery] close invoice complete failed for ${input.orderId}: ${outcome.error}`,
      );
      return { afterStage: "delivery_complete", needsPaymentApproval: false };
    }
    return { afterStage: "invoice_complete", needsPaymentApproval: false };
  }

  const deliveryApproval = await triggerDeliveryPaymentApprovalIfNeeded(input);
  return {
    afterStage: "delivery_complete",
    needsPaymentApproval: Boolean(deliveryApproval),
  };
}

/**
 * Rider complete historically left prepaid orders on delivery_complete even when
 * invoiceCompleteAt was already set at finance approval. Close that lag.
 * Does not touch finance-reverted (partial void) orders.
 */
export async function reconcileDeliveredInvoiceCompleteStage(companyId: string): Promise<number> {
  const now = new Date();
  const result = await prisma.order.updateMany({
    where: {
      companyId,
      fulfillmentStage: "delivery_complete",
      invoiceCompleteAt: { not: null },
      revertedFromInvoiceCompleteAt: null,
      cancelledAt: null,
      NOT: [
        { financialStatus: { equals: "refunded", mode: "insensitive" } },
        { financialStatus: { equals: "voided", mode: "insensitive" } },
      ],
    },
    data: {
      fulfillmentStage: "invoice_complete",
      fulfillmentStageEnteredAt: now,
      fulfillmentStatus: "fulfilled",
    },
  });
  return result.count;
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

  // Prepaid order-payment finance covers the same confirmation. Card on Delivery still needs door collection.
  if (order.approvalRequests.length > 0 && !orderHasCardOnDeliveryGateway(order)) return null;

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
