import { NextRequest, NextResponse } from "next/server";

import { requireRiderMobileSession } from "@/lib/mobile/api";
import { toMobileDeliveryDto } from "@/lib/mobile/dto";
import { resolveMobileSpecialDelivery } from "@/lib/mobile/special-delivery";
import { mobileDeliveryStatusFilterSchema } from "@/lib/mobile/validation";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireRiderMobileSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const statusResult = mobileDeliveryStatusFilterSchema.safeParse(
    request.nextUrl.searchParams.get("status") ?? undefined
  );

  const tasks = await prisma.riderDeliveryTask.findMany({
    where: {
      riderId: auth.session.userId,
      ...(statusResult.success && statusResult.data ? { status: statusResult.data } : {}),
    },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          name: true,
          shopifyOrderId: true,
          totalPrice: true,
          currency: true,
          customerPhone: true,
          customerEmail: true,
          shippingAddress: true,
          billingAddress: true,
          paymentGatewayPrimary: true,
          paymentGatewayNames: true,
          financialStatus: true,
          deliveryOutcome: true,
          deliveryFailedReason: true,
          dispatchedAt: true,
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
            },
          },
        },
      },
    },
    orderBy: [{ status: "asc" }, { assignedAt: "desc" }],
  });

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
      })
    ),
  });
}
