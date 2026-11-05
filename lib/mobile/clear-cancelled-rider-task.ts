import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

/** When OS cancels/voids an order, drop the rider task so it leaves the app route. */
export async function clearRiderDeliveryTasksForOrder(
  orderId: string,
  tx: Tx | typeof prisma = prisma,
) {
  await tx.riderDeliveryTask.deleteMany({ where: { orderId } });
}

/** Mobile route list: hide cancelled / voided orders even if a stale task remains. */
export function mobileActiveOrderWhere(): Prisma.OrderWhereInput {
  return {
    cancelledAt: null,
    NOT: {
      financialStatus: { equals: "voided", mode: "insensitive" },
    },
  };
}
