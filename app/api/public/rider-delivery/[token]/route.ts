import { NextRequest, NextResponse } from "next/server";

import { applyRiderLinkPaymentChange } from "@/lib/apply-collection-payment-method";
import {
  completeRiderDeliveryByToken,
  isRiderDeliveryAlreadyCompletedStage,
} from "@/lib/complete-rider-delivery";
import {
  classifyCollectionPaymentKind,
  isRiderLinkPaymentTarget,
  riderLinkPaymentTargetLabel,
  riderLinkPaymentTargets,
} from "@/lib/collection-payment-method";
import { prisma } from "@/lib/prisma";
import { sendOrderSms } from "@/lib/order-sms";
import { resolveCustomerPhone } from "@/lib/order-sms-resolvers";
import { riderDeliveryTokenAllowsPaymentChange } from "@/lib/rider-delivery-token";

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
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  if (isRiderDeliveryAlreadyCompletedStage(order.fulfillmentStage)) {
    return NextResponse.json({
      orderName: order.name ?? order.orderNumber ?? order.shopifyOrderId,
      message: "Delivery already confirmed",
    });
  }

  const paymentChangeEnabled = riderDeliveryTokenAllowsPaymentChange(token);
  const currentKind = paymentChangeEnabled
    ? classifyCollectionPaymentKind({
        paymentGatewayPrimary: order.paymentGatewayPrimary,
        paymentGatewayNames: order.paymentGatewayNames,
      })
    : null;
  const paymentChange =
    paymentChangeEnabled && currentKind
      ? {
          enabled: true,
          current: {
            key: currentKind,
            label: riderLinkPaymentTargetLabel(currentKind),
          },
          options: riderLinkPaymentTargets(currentKind).map((key) => ({
            key,
            label: riderLinkPaymentTargetLabel(key),
          })),
        }
      : null;

  return NextResponse.json({
    orderName: order.name ?? order.orderNumber ?? order.shopifyOrderId,
    paymentChange,
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

  const paymentMethodRaw =
    typeof body.paymentMethod === "string" ? body.paymentMethod.trim() : "";
  const paymentMethod =
    paymentMethodRaw &&
    riderDeliveryTokenAllowsPaymentChange(token) &&
    isRiderLinkPaymentTarget(paymentMethodRaw)
      ? paymentMethodRaw
      : undefined;

  if (confirmed) {
    if (paymentMethod) {
      const orderForChange = await prisma.order.findFirst({
        where: { riderDeliveryToken: token },
        select: {
          id: true,
          companyId: true,
          fulfillmentStage: true,
          riderDeliveryTask: { select: { riderId: true } },
        },
      });
      if (!orderForChange) {
        return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
      }
      if (!isRiderDeliveryAlreadyCompletedStage(orderForChange.fulfillmentStage)) {
        const change = await applyRiderLinkPaymentChange({
          orderId: orderForChange.id,
          companyId: orderForChange.companyId,
          target: paymentMethod,
          requestedById: orderForChange.riderDeliveryTask?.riderId ?? null,
        });
        if (!change.ok) {
          return NextResponse.json({ error: change.error }, { status: change.status });
        }
      }
    }
    const result = await completeRiderDeliveryByToken({ token });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    if (result.alreadyCompleted) {
      return NextResponse.json({ success: true, message: "Already confirmed" });
    }

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

  if (isRiderDeliveryAlreadyCompletedStage(order.fulfillmentStage)) {
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
