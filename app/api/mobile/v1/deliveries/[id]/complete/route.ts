import { NextRequest, NextResponse } from "next/server";

import { requireRiderMobileSession, mobileError } from "@/lib/mobile/api";
import { findRiderTaskById } from "@/lib/mobile/orders";
import { riderDeliveryCompleteSchema, mobileRouteIdSchema } from "@/lib/mobile/validation";
import { prisma } from "@/lib/prisma";
import { sendOrderSms } from "@/lib/order-sms";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRiderMobileSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const idResult = mobileRouteIdSchema.safeParse(id);
  if (!idResult.success) {
    return mobileError("Invalid delivery ID", 400);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = riderDeliveryCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return mobileError("Invalid completion payload", 400);
  }

  const task = await findRiderTaskById(idResult.data, auth.session.userId);
  if (!task) {
    return mobileError("Delivery not found", 404);
  }

  if (task.status === "completed" || task.order.fulfillmentStage === "delivery_complete") {
    return NextResponse.json({ success: true, alreadyCompleted: true });
  }

  const now = parsed.data.completedAt ? new Date(parsed.data.completedAt) : new Date();
  const acceptedAt = parsed.data.acceptedAt ? new Date(parsed.data.acceptedAt) : task.acceptedAt ?? now;
  const arrivedAt = parsed.data.arrivedAt ? new Date(parsed.data.arrivedAt) : task.arrivedAt ?? now;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.riderDeliveryTask.update({
      where: { id: task.id },
      data: {
        status: "completed",
        acceptedAt,
        arrivedAt,
        completedAt: now,
        failedAt: null,
        failureReason: null,
        latestSyncAt: now,
      },
    });

    return tx.order.update({
      where: { id: task.orderId },
      data: {
        fulfillmentStage: "delivery_complete",
        deliveryCompleteAt: now,
        deliveryCompleteById: auth.session.userId,
        deliveryOutcome: "delivered",
        deliveryFailedReason: null,
        lastRiderUpdateAt: now,
        riderDeliveryToken: null,
      },
      include: { companyLocation: true },
    });
  });

  void sendOrderSms(updated.companyId, updated.id, "delivery_complete", {
    orderNumber: updated.orderNumber ?? updated.name ?? updated.shopifyOrderId,
    customerPhone: updated.customerPhone ?? undefined,
    locationName: updated.companyLocation?.name ?? undefined,
  }).catch((err) => console.error("[Mobile delivery] delivery_complete SMS failed:", err));

  return NextResponse.json({ success: true });
}
