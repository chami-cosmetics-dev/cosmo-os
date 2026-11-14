import { NextRequest, NextResponse } from "next/server";

import { requireRiderMobileSession, mobileError } from "@/lib/mobile/api";
import { findRiderTaskForMutation } from "@/lib/mobile/find-rider-task-for-mutation";
import { recordRiderPayment } from "@/lib/mobile/record-rider-payment";
import { mobileRouteIdSchema, riderPaymentSchema } from "@/lib/mobile/validation";

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
  const parsed = riderPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return mobileError("Invalid payment payload", 400);
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

  if (recorded.deduplicated) {
    return NextResponse.json({
      success: true,
      paymentId: recorded.payment.id,
      deduplicated: true,
      lines: recorded.payment.lines.map((line) => ({
        id: line.id,
        paymentMethod: line.paymentMethod,
        amount: line.amount,
      })),
    });
  }

  return NextResponse.json({
    success: true,
    payment: recorded.payment,
  });
}
