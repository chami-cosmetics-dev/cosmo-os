import "server-only";

import { prisma } from "@/lib/prisma";

/** Lean task load for payment / complete / close — skips line items & exchanges. */
export async function findRiderTaskForMutation(taskId: string, riderId: string) {
  return prisma.riderDeliveryTask.findFirst({
    where: {
      id: taskId,
      riderId,
      order: {
        cancelledAt: null,
        NOT: {
          financialStatus: { equals: "voided", mode: "insensitive" },
        },
      },
    },
    select: {
      id: true,
      orderId: true,
      riderId: true,
      status: true,
      acceptedAt: true,
      arrivedAt: true,
      requiresOldItemCollection: true,
      oldItemCollectionStatus: true,
      order: {
        select: {
          id: true,
          companyId: true,
          totalPrice: true,
          discountCodes: true,
          paymentGatewayPrimary: true,
          paymentGatewayNames: true,
          financialStatus: true,
          fulfillmentStage: true,
          orderNumber: true,
          name: true,
          shopifyOrderId: true,
          customerPhone: true,
          shippingAddress: true,
          billingAddress: true,
          companyLocation: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export type RiderTaskForMutation = NonNullable<
  Awaited<ReturnType<typeof findRiderTaskForMutation>>
>;
