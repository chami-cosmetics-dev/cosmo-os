import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { sendOrderSms } from "@/lib/order-sms";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { riderDeliveryToken: token },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      fulfillmentStage: true,
      deliveryCompleteAt: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  if (order.fulfillmentStage === "delivery_complete") {
    return NextResponse.json({
      orderName: order.name ?? order.orderNumber ?? order.shopifyOrderId,
      message: "Delivery already confirmed",
    });
  }

  return NextResponse.json({
    orderName: order.name ?? order.orderNumber ?? order.shopifyOrderId,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const confirmed = body.confirmed === true;
  const failureReason = typeof body.failureReason === "string" ? body.failureReason.trim() : null;

  if (!confirmed && !failureReason) {
    return NextResponse.json({ error: "Cancellation reason is required" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { riderDeliveryToken: token },
    include: { company: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  if (order.fulfillmentStage === "delivery_complete") {
    return NextResponse.json({ success: true, message: "Already confirmed" });
  }

  const now = new Date();

  if (confirmed) {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.riderDeliveryTask.updateMany({
        where: { orderId: order.id },
        data: {
          status: "completed",
          completedAt: now,
          failedAt: null,
          failureReason: null,
          latestSyncAt: now,
        },
      });
      return tx.order.update({
        where: { id: order.id },
        data: {
          fulfillmentStage: "delivery_complete",
          deliveryCompleteAt: now,
          deliveryOutcome: "delivered",
          deliveryFailedReason: null,
          lastRiderUpdateAt: now,
          riderDeliveryToken: null,
        },
        include: { companyLocation: true },
      });
    });
    sendOrderSms(updated.companyId, updated.id, "delivery_complete", {
      orderNumber: updated.orderNumber ?? updated.name ?? updated.shopifyOrderId,
      customerPhone: updated.customerPhone ?? undefined,
      locationName: updated.companyLocation?.name ?? undefined,
    }).catch((err) => console.error("[Rider delivery] SMS failed:", err));
  } else {
    // Rider could not deliver — record reason and return order to store
    await prisma.$transaction(async (tx) => {
      await tx.riderDeliveryTask.updateMany({
        where: { orderId: order.id },
        data: {
          status: "failed",
          failedAt: now,
          failureReason: failureReason,
          completedAt: null,
          latestSyncAt: now,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: {
          fulfillmentStage: "returned_to_store",
          fulfillmentStatus: "unfulfilled",
          packageReadyAt: null,
          packageReadyById: null,
          packageOnHoldAt: null,
          packageHoldReasonId: null,
          dispatchedAt: null,
          dispatchedById: null,
          dispatchedByRiderId: null,
          dispatchedByCourierServiceId: null,
          deliveryOutcome: "failed",
          deliveryFailedReason: failureReason,
          lastRiderUpdateAt: now,
          riderDeliveryToken: null,
        },
      });
    });
  }

  return NextResponse.json({ success: true });
}
