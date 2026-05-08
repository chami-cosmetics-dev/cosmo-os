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
