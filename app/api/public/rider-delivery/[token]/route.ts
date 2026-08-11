import { NextRequest, NextResponse } from "next/server";

import {
  completeRiderDeliveryByToken,
} from "@/lib/complete-rider-delivery";
import { triggerDeliveryPaymentApprovalIfNeeded } from "@/lib/delivery-payment-approval";
import { prisma } from "@/lib/prisma";
import { sendOrderSms } from "@/lib/order-sms";
import { resolveCustomerPhone } from "@/lib/order-sms-resolvers";

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
  const failureReason =
    typeof body.failureReason === "string" ? body.failureReason.trim() : null;

  if (!confirmed && !failureReason) {
    return NextResponse.json({ error: "Cancellation reason is required" }, { status: 400 });
  }

  if (confirmed) {
    const result = await completeRiderDeliveryByToken({ token });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    if (result.alreadyCompleted) {
      return NextResponse.json({ success: true, message: "Already confirmed" });
    }

    void triggerDeliveryPaymentApprovalIfNeeded({
      companyId: result.order.companyId,
      orderId: result.order.id,
      requestedById: result.riderId,
    }).catch((err) => console.error("[Rider delivery] payment approval failed:", err));

    void sendOrderSms(result.order.companyId, result.order.id, "delivery_complete", {
      orderNumber: result.order.orderNumber ?? result.order.name ?? result.order.shopifyOrderId,
      customerPhone: resolveCustomerPhone(result.order),
      locationName: result.order.companyLocation?.name ?? undefined,
    }).catch((err) => console.error("[Rider delivery] SMS failed:", err));

    return NextResponse.json({ success: true });
  }

  const order = await prisma.order.findFirst({
    where: { riderDeliveryToken: token },
    select: { id: true, fulfillmentStage: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  if (order.fulfillmentStage === "delivery_complete") {
    return NextResponse.json({ success: true, message: "Already confirmed" });
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.riderDeliveryTask.updateMany({
      where: { orderId: order.id },
      data: {
        status: "failed",
        failedAt: now,
        failureReason,
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

  return NextResponse.json({ success: true });
}
