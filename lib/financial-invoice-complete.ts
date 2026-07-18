import { prisma } from "@/lib/prisma";

/**
 * Record payment/invoice completion without terminating physical fulfillment.
 * Used for CC Checkout at order received and other early-complete paths.
 * Does not change fulfillmentStage or fulfillmentStatus.
 */
export async function markOrderFinanciallyInvoiceComplete(input: {
  orderId: string;
  userId?: string | null;
  at?: Date;
}): Promise<void> {
  const now = input.at ?? new Date();
  await prisma.order.update({
    where: { id: input.orderId },
    data: {
      financialStatus: "paid",
      ...(input.userId ? { invoiceCompleteById: input.userId } : {}),
    },
  });
  await prisma.order.updateMany({
    where: { id: input.orderId, invoiceCompleteAt: null },
    data: { invoiceCompleteAt: now },
  });
}
