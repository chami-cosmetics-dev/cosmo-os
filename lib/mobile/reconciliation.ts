import "server-only";

import { Prisma } from "@prisma/client";
import { endOfDay, startOfDay } from "@/lib/mobile/dates";
import {
  cashAmountFromDeliveryPayment,
  deliveryPaymentHasCash,
} from "@/lib/mobile/payment-lines";
import { prisma } from "@/lib/prisma";

export async function getRiderCashSummary(riderId: string, date = new Date()) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const payments = await prisma.deliveryPayment.findMany({
    where: {
      riderId,
      cashHandoverId: null,
      collectionStatus: { in: ["collected", "partially_collected"] },
      collectedAt: {
        gte: dayStart,
        lte: dayEnd,
      },
      OR: [
        { paymentMethod: "cod", lines: { none: {} } },
        { lines: { some: { paymentMethod: "cod" } } },
      ],
      order: {
        riderDeliveryTask: {
          is: {
            status: "completed",
          },
        },
      },
    },
    include: {
      lines: {
        where: { paymentMethod: "cod" },
        select: { paymentMethod: true, amount: true },
      },
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

  const cashPayments = payments.filter((payment) => deliveryPaymentHasCash(payment));

  const groups = new Map<
    string,
    { companyLocationId: string; companyLocationName: string; cashAmount: Prisma.Decimal; orderCount: number }
  >();

  for (const payment of cashPayments) {
    const cashAmount = cashAmountFromDeliveryPayment(payment);
    if (cashAmount.lte(0)) continue;

    const key = payment.order.companyLocationId;
    const existing =
      groups.get(key) ??
      {
        companyLocationId: key,
        companyLocationName: payment.order.companyLocation.name,
        cashAmount: new Prisma.Decimal(0),
        orderCount: 0,
      };

    existing.cashAmount = existing.cashAmount.add(cashAmount);
    existing.orderCount += 1;
    groups.set(key, existing);
  }

  const totalCollectedCash = cashPayments.reduce(
    (sum, payment) => sum.add(cashAmountFromDeliveryPayment(payment)),
    new Prisma.Decimal(0)
  );
  // Expected cash for handover = COD portions collected (same as collected for completed COD lines).
  const totalExpectedCash = totalCollectedCash;

  return {
    date: dayStart,
    totalExpectedCash,
    totalCollectedCash,
    groups: Array.from(groups.values()).sort((a, b) =>
      a.companyLocationName.localeCompare(b.companyLocationName)
    ),
    payments: cashPayments,
  };
}
