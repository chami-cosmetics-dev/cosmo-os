import "server-only";

import { Prisma } from "@prisma/client";

import { formatAppIsoDate } from "@/lib/format-datetime";
import { incentiveMatchForOrder, loadRiderIncentiveContext } from "@/lib/rider-incentive-resolve";
import {
  isIncentiveEligibleOrder,
  isRiderIncentiveUnlocked,
} from "@/lib/rider-incentive";
import {
  groupIncentiveStatement,
  type IncentiveStatementInput,
} from "@/lib/rider-incentive-statement";
import { prisma } from "@/lib/prisma";

export async function loadRiderIncentiveStatement(input: {
  companyId: string;
  riderId: string;
  from: Date;
  to: Date;
}) {
  const [tasks, incentiveContext] = await Promise.all([
    prisma.riderDeliveryTask.findMany({
      where: {
        riderId: input.riderId,
        status: "completed",
        completedAt: { gte: input.from, lte: input.to },
        order: { companyId: input.companyId },
      },
      select: {
        completedAt: true,
        manualIncentiveLabelKey: true,
        manualIncentiveAmount: true,
        rider: { select: { name: true, knownName: true } },
        order: {
          select: {
            orderNumber: true,
            name: true,
            erpnextInvoiceId: true,
            financialStatus: true,
            fulfillmentStage: true,
            invoiceCompleteAt: true,
            totalShipping: true,
            shippingLines: true,
            shippingAddress: true,
            rawPayload: true,
            sourceName: true,
            discountCodes: true,
            companyLocation: { select: { name: true, erpnextCompany: true } },
          },
        },
      },
    }),
    loadRiderIncentiveContext(),
  ]);

  const riderName =
    tasks[0]?.rider.knownName || tasks[0]?.rider.name || "Rider";

  const rows: IncentiveStatementInput[] = tasks.map((task) => {
    const match = incentiveMatchForOrder(
      task.order,
      incentiveContext.chargeByLabelKey,
      incentiveContext.zoneMembersByZone,
      task.manualIncentiveLabelKey,
      task.manualIncentiveAmount,
    );
    const unlocked = isRiderIncentiveUnlocked(task.order);
    const eligible = isIncentiveEligibleOrder(task.order.financialStatus);
    const unmatched =
      unlocked &&
      eligible &&
      !match.matched &&
      !match.excludedFromIncentive &&
      !task.manualIncentiveLabelKey;
    const payable =
      eligible && unlocked && !match.excludedFromIncentive ? match.amount : new Prisma.Decimal(0);
    return {
      date: formatAppIsoDate(task.completedAt),
      orderNumber: task.order.orderNumber?.trim() || task.order.name?.trim() || "",
      invoiceNumber: task.order.erpnextInvoiceId?.trim() || "",
      company:
        task.order.companyLocation.erpnextCompany?.trim() ||
        task.order.companyLocation.name.trim() ||
        "Unknown",
      deliveryStatus: "Complete",
      invoiceStatus: unlocked ? "Complete" : "Open",
      shippingCost: task.order.totalShipping?.toString() ?? "0",
      riderPayment: payable,
      unmatched,
    };
  });

  const grouped = groupIncentiveStatement(rows);
  return { riderName, ...grouped };
}
