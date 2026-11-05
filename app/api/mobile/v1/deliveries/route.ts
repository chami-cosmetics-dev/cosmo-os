import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { requireRiderMobileSession } from "@/lib/mobile/api";
import { mobileActiveOrderWhere } from "@/lib/mobile/clear-cancelled-rider-task";
import { toMobileDeliveryDto } from "@/lib/mobile/dto";
import { resolveMobileSpecialDelivery } from "@/lib/mobile/special-delivery";
import { mobileDeliveriesQuerySchema } from "@/lib/mobile/validation";
import { parseAppCalendarDayEnd, parseAppCalendarDayStart } from "@/lib/format-datetime";
import { isRiderIncentiveUnlocked } from "@/lib/rider-incentive";
import { incentiveForOrder, loadRiderIncentiveContext } from "@/lib/rider-incentive-resolve";
import { prisma } from "@/lib/prisma";
import { loadSplitCashCollectByOrderIds } from "@/lib/order-split-payment";

const ACTIVE_STATUSES = ["assigned", "accepted", "arrived"] as const;

const orderInclude = {
  id: true,
  orderNumber: true,
  name: true,
  shopifyOrderId: true,
  totalPrice: true,
  totalShipping: true,
  shippingLines: true,
  rawPayload: true,
  sourceName: true,
  discountCodes: true,
  currency: true,
  customerPhone: true,
  customerEmail: true,
  shippingAddress: true,
  billingAddress: true,
  paymentGatewayPrimary: true,
  paymentGatewayNames: true,
  financialStatus: true,
  fulfillmentStage: true,
  invoiceCompleteAt: true,
  deliveryOutcome: true,
  deliveryFailedReason: true,
  dispatchedAt: true,
  returns: {
    orderBy: { actionDate: "desc" as const },
    take: 1,
    select: {
      actionType: true,
    },
  },
  exchangesAsReplacement: {
    orderBy: { createdAt: "desc" as const },
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
  companyLocation: { select: { id: true, name: true } },
  deliveryPayment: {
    select: {
      expectedAmount: true,
      collectedAmount: true,
      paymentMethod: true,
      collectionStatus: true,
      referenceNote: true,
      bankReference: true,
      cardReference: true,
      collectedAt: true,
      lines: {
        orderBy: { sortOrder: "asc" as const },
        select: {
          paymentMethod: true,
          amount: true,
          bankReference: true,
          cardReference: true,
          referenceNote: true,
        },
      },
    },
  },
} satisfies Prisma.OrderSelect;

export async function GET(request: NextRequest) {
  const auth = await requireRiderMobileSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const parsed = mobileDeliveriesQuerySchema.safeParse({
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    offset: request.nextUrl.searchParams.get("offset") ?? undefined,
    on: request.nextUrl.searchParams.get("on") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { status, offset, on } = parsed.data;
  const isTerminal = status === "completed" || status === "failed";
  const limit = parsed.data.limit ?? (isTerminal ? 40 : status === "active" ? 100 : undefined);

  const statusWhere: Prisma.RiderDeliveryTaskWhereInput =
    status === "active"
      ? { status: { in: [...ACTIVE_STATUSES] } }
      : status
        ? { status }
        : {};

  const dayStart = on ? parseAppCalendarDayStart(on) : null;
  const dayEnd = on ? parseAppCalendarDayEnd(on) : null;
  const completedOnWhere: Prisma.RiderDeliveryTaskWhereInput =
    dayStart && dayEnd
      ? {
          completedAt: {
            gte: dayStart,
            lte: dayEnd,
          },
        }
      : {};

  const orderBy: Prisma.RiderDeliveryTaskOrderByWithRelationInput[] = isTerminal
    ? [{ completedAt: "desc" }, { assignedAt: "desc" }]
    : [{ status: "asc" }, { assignedAt: "desc" }];

  const where: Prisma.RiderDeliveryTaskWhereInput = {
    riderId: auth.session.userId,
    order: mobileActiveOrderWhere(),
    ...statusWhere,
    ...completedOnWhere,
  };

  const [tasks, incentiveContext, totalMatching] = await Promise.all([
    prisma.riderDeliveryTask.findMany({
      where,
      include: {
        order: {
          select: orderInclude,
        },
      },
      orderBy,
      ...(limit != null ? { take: limit, skip: offset } : {}),
    }),
    loadRiderIncentiveContext(),
    limit != null
      ? prisma.riderDeliveryTask.count({ where })
      : Promise.resolve(null),
  ]);

  const cashByOrder = await loadSplitCashCollectByOrderIds(tasks.map((task) => task.order.id));

  const hasMore =
    totalMatching != null && limit != null ? offset + tasks.length < totalMatching : false;

  return NextResponse.json({
    deliveries: tasks.map((task) =>
      toMobileDeliveryDto({
        order: task.order,
        task,
        payment: task.order.deliveryPayment,
        companyLocation: task.order.companyLocation,
        specialDelivery: resolveMobileSpecialDelivery({
          order: task.order,
          task,
        }),
        incentiveAmount: isRiderIncentiveUnlocked(task.order)
          ? incentiveForOrder(
              task.order,
              incentiveContext.chargeByLabelKey,
              incentiveContext.zoneMembersByZone,
              task.manualIncentiveLabelKey,
              task.manualIncentiveAmount
            ).toFixed(2)
          : "0.00",
        incentivePendingInvoiceClose: !isRiderIncentiveUnlocked(task.order),
        collectCashAmount: cashByOrder.get(task.order.id) ?? null,
      })
    ),
    hasMore,
    limit: limit ?? null,
    offset,
    total: totalMatching,
  });
}
