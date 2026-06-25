import { prisma } from "@/lib/prisma";
import { getApprovedOrderPaymentReviewerId } from "@/lib/approval-workflow";

export type PostDeliveryInvoiceResult =
  | { kind: "awaiting_finance" }
  | { kind: "invoice_complete"; financeUserId: string };

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
    select: { id: true },
  });
  if (!order) {
    return { kind: "awaiting_finance" };
  }

  const earlyFinanceUserId = await getApprovedOrderPaymentReviewerId(order.id);
  if (earlyFinanceUserId) {
    return { kind: "invoice_complete", financeUserId: earlyFinanceUserId };
  }

  return { kind: "awaiting_finance" };
}

/** @deprecated Delivery payment approvals removed — finance uses invoice complete. */
export async function triggerDeliveryPaymentApprovalIfNeeded(_input: {
  companyId: string;
  orderId: string;
  requestedById: string | null;
}) {
  return null;
}
