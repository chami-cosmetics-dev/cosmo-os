import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireRiderMobileSession } from "@/lib/mobile/api";
import { endOfDay, startOfDay } from "@/lib/mobile/dates";
import { formatBusinessOrderNumber } from "@/lib/order-display-label";
import { prisma } from "@/lib/prisma";
import { isIncentiveEligibleOrder } from "@/lib/rider-incentive";
import { incentiveForOrder, loadRiderDeliveryChargeMap } from "@/lib/rider-incentive-resolve";
import { resolvePayPeriodWindow, type PayPeriodKind } from "@/lib/rider-pay-period";

const querySchema = z.object({
  period: z.enum(["current", "previous"]).default("current"),
});

function decimalToFixed(value: Prisma.Decimal) {
  return value.toFixed(2);
}

const orderIncentiveSelect = {
  totalShipping: true,
  shippingLines: true,
  rawPayload: true,
  sourceName: true,
  discountCodes: true,
  financialStatus: true,
} as const;

export async function GET(request: NextRequest) {
  const auth = await requireRiderMobileSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsed = querySchema.safeParse({
    period: request.nextUrl.searchParams.get("period") ?? "current",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  const periodKind = parsed.data.period as PayPeriodKind;
  const riderId = auth.session.userId;

  const [config, chargeByLabelKey] = await Promise.all([
    prisma.riderPayPeriodConfig.findUnique({
      where: { singletonKey: "default" },
      select: { paydayDayOfMonth: true },
    }),
    loadRiderDeliveryChargeMap(),
  ]);
  const paydayDayOfMonth = config?.paydayDayOfMonth ?? null;

  const todayFrom = startOfDay(new Date());
  const todayTo = endOfDay(new Date());

  const todayTasks = await prisma.riderDeliveryTask.findMany({
    where: {
      riderId,
      status: "completed",
      completedAt: { gte: todayFrom, lte: todayTo },
    },
    select: {
      order: { select: orderIncentiveSelect },
    },
  });

  let todayCompletedCount = 0;
  let todayIncentive = new Prisma.Decimal(0);
  for (const task of todayTasks) {
    if (!isIncentiveEligibleOrder(task.order.financialStatus)) continue;
    todayCompletedCount += 1;
    todayIncentive = todayIncentive.add(incentiveForOrder(task.order, chargeByLabelKey));
  }

  const periodWindow = resolvePayPeriodWindow(paydayDayOfMonth, periodKind);
  if (!periodWindow) {
    return NextResponse.json({
      paydayConfigured: false,
      paydayDayOfMonth: null,
      period: null,
      completedCount: null,
      failedCount: null,
      incentiveTotal: null,
      todayCompletedCount,
      todayIncentiveTotal: decimalToFixed(todayIncentive),
      lines: [],
    });
  }

  const [completedTasks, failedCount] = await Promise.all([
    prisma.riderDeliveryTask.findMany({
      where: {
        riderId,
        status: "completed",
        completedAt: { gte: periodWindow.from, lte: periodWindow.to },
      },
      select: {
        id: true,
        completedAt: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            name: true,
            shopifyOrderId: true,
            ...orderIncentiveSelect,
          },
        },
      },
      orderBy: { completedAt: "desc" },
    }),
    prisma.riderDeliveryTask.count({
      where: {
        riderId,
        status: "failed",
        failedAt: { gte: periodWindow.from, lte: periodWindow.to },
      },
    }),
  ]);

  let completedCount = 0;
  let incentiveTotal = new Prisma.Decimal(0);
  const lines: Array<{
    taskId: string;
    orderId: string;
    orderLabel: string;
    completedAt: string | null;
    incentiveAmount: string;
  }> = [];

  for (const task of completedTasks) {
    if (!isIncentiveEligibleOrder(task.order.financialStatus)) continue;
    const amount = incentiveForOrder(task.order, chargeByLabelKey);
    completedCount += 1;
    incentiveTotal = incentiveTotal.add(amount);
    lines.push({
      taskId: task.id,
      orderId: task.order.id,
      orderLabel: formatBusinessOrderNumber(task.order),
      completedAt: task.completedAt?.toISOString() ?? null,
      incentiveAmount: decimalToFixed(amount),
    });
  }

  return NextResponse.json({
    paydayConfigured: true,
    paydayDayOfMonth,
    period: {
      kind: periodWindow.kind,
      from: periodWindow.from.toISOString(),
      to: periodWindow.to.toISOString(),
    },
    completedCount,
    failedCount,
    incentiveTotal: decimalToFixed(incentiveTotal),
    todayCompletedCount,
    todayIncentiveTotal: decimalToFixed(todayIncentive),
    lines,
  });
}
