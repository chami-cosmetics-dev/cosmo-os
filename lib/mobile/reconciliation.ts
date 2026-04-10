import "server-only";

import { Prisma } from "@prisma/client";
import { startOfDay } from "@/lib/mobile/dates";
import { prisma } from "@/lib/prisma";

export async function getRiderCashSummary(riderId: string, date = new Date()) {
  const payments = await prisma.deliveryPayment.findMany({
    where: {
      riderId,
      cashHandoverId: null,
      paymentMethod: "cod",
      collectionStatus: { in: ["collected", "partially_collected"] },
      order: {
        riderDeliveryTask: {
          is: {
            status: "completed",
          },
        },
      },
    },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          name: true,
          shopifyOrderId: true,
          companyLocationId: true,
          companyLocation: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { collectedAt: "desc" },
  });

  const groups = new Map<
    string,
    { companyLocationId: string; companyLocationName: string; cashAmount: Prisma.Decimal; orderCount: number }
  >();

  for (const payment of payments) {
    const key = payment.order.companyLocationId;
    const existing =
      groups.get(key) ??
      {
        companyLocationId: key,
        companyLocationName: payment.order.companyLocation.name,
        cashAmount: new Prisma.Decimal(0),
        orderCount: 0,
      };

    existing.cashAmount = existing.cashAmount.add(payment.collectedAmount);
    existing.orderCount += 1;
    groups.set(key, existing);
  }

  const totalExpectedCash = payments.reduce(
    (sum, payment) => sum.add(payment.expectedAmount),
    new Prisma.Decimal(0)
  );
  const totalCollectedCash = payments.reduce(
    (sum, payment) => sum.add(payment.collectedAmount),
    new Prisma.Decimal(0)
  );

  return {
    date: startOfDay(date),
    totalExpectedCash,
    totalCollectedCash,
    groups: Array.from(groups.values()).sort((a, b) =>
      a.companyLocationName.localeCompare(b.companyLocationName)
    ),
    payments,
  };
}
