import { NextRequest, NextResponse, after } from "next/server";

import { requireRiderMobileSession, mobileError } from "@/lib/mobile/api";
import {
  completeRiderDeliveryTask,
  runPostDeliveryAfterComplete,
} from "@/lib/complete-rider-delivery";
import { findRiderTaskForMutation } from "@/lib/mobile/find-rider-task-for-mutation";
import { recordRiderPayment } from "@/lib/mobile/record-rider-payment";
import { mobileRouteIdSchema, riderDeliveryCloseSchema } from "@/lib/mobile/validation";
import { sendOrderSms } from "@/lib/order-sms";
import { resolveCustomerPhone } from "@/lib/order-sms-resolvers";

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
  const parsed = riderDeliveryCloseSchema.safeParse(body);
  if (!parsed.success) {
    return mobileError("Invalid close payload", 400);
  }

  const task = await findRiderTaskForMutation(idResult.data, auth.session.userId);
  if (!task) {
    return mobileError("Delivery not found", 404);
  }

  const recorded = await recordRiderPayment({
    riderId: auth.session.userId,
    task,
    data: parsed.data,
  });
  if (!recorded.ok) {
    return mobileError(recorded.error, recorded.status);
  }

  const oldItemCollectionStatus =
    parsed.data.oldItemCollectionStatus ?? task.oldItemCollectionStatus;
  const oldItemCollectionRemark = parsed.data.oldItemCollectionRemark?.trim() || null;
  if (task.requiresOldItemCollection) {
    if (oldItemCollectionStatus === "pending") {
      return mobileError("Confirm whether the old order was collected", 400);
    }
    if (oldItemCollectionStatus === "not_collected" && !oldItemCollectionRemark) {
      return mobileError("Enter a remark when the old order is not collected", 400);
    }
  }

  const now = parsed.data.completedAt ? new Date(parsed.data.completedAt) : new Date();
  const acceptedAt = parsed.data.acceptedAt
    ? new Date(parsed.data.acceptedAt)
    : task.acceptedAt ?? now;
  const arrivedAt = parsed.data.arrivedAt
    ? new Date(parsed.data.arrivedAt)
    : task.arrivedAt ?? now;

  const result = await completeRiderDeliveryTask({
    taskId: task.id,
    riderId: auth.session.userId,
    now,
    acceptedAt,
    arrivedAt,
    oldItemCollectionStatus,
    oldItemCollectionRemark,
    completedLatitude: parsed.data.completedLatitude,
    completedLongitude: parsed.data.completedLongitude,
    completedAccuracyMeters: parsed.data.completedAccuracyMeters,
    completedLocationAt: parsed.data.completedLocationAt
      ? new Date(parsed.data.completedLocationAt)
      : parsed.data.completedLatitude != null
        ? now
        : null,
    skipPostDelivery: true,
  });

  if (!result.success) {
    return mobileError(result.error, result.status);
  }

  if (!result.alreadyCompleted) {
    after(() =>
      runPostDeliveryAfterComplete({
        companyId: result.companyId,
        orderId: result.orderId,
        requestedById: auth.session.userId,
      })
    );

    after(() =>
      sendOrderSms(result.order.companyId, result.order.id, "delivery_complete", {
        orderNumber: result.order.orderNumber ?? result.order.name ?? result.order.shopifyOrderId,
        customerPhone: resolveCustomerPhone(result.order),
        locationName: result.order.companyLocation?.name ?? undefined,
      }).catch((err) => console.error("[Mobile delivery] delivery_complete SMS failed:", err))
    );
  } else if (task.order.fulfillmentStage === "delivery_complete") {
    after(() =>
      runPostDeliveryAfterComplete({
        companyId: task.order.companyId,
        orderId: task.orderId,
        requestedById: auth.session.userId,
      })
    );
  }

  return NextResponse.json({
    success: true,
    alreadyCompleted: result.alreadyCompleted === true,
    payment: recorded.payment,
  });
}
