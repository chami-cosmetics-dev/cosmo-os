import "server-only";

import { prisma } from "@/lib/prisma";

export async function findRiderTaskById(taskId: string, riderId: string) {
  return prisma.riderDeliveryTask.findFirst({
    where: {
      id: taskId,
      riderId,
    },
    include: {
      order: {
        include: {
          companyLocation: { select: { id: true, name: true } },
          deliveryPayment: true,
          returns: {
            orderBy: { actionDate: "desc" },
            take: 1,
            select: {
              actionType: true,
            },
          },
          exchangesAsReplacement: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              reason: true,
              originalReference: true,
              originalOrder: {
                select: {
                  id: true,
                  name: true,
                  orderNumber: true,
                  shopifyOrderId: true,
                  totalPrice: true,
                },
              },
            },
          },
          lineItems: {
            include: {
              productItem: {
                select: {
                  productTitle: true,
                  variantTitle: true,
                  sku: true,
                },
              },
            },
          },
        },
      },
    },
  });
}
