import { NextRequest, NextResponse } from "next/server";

import { requireRiderMobileSession, mobileError } from "@/lib/mobile/api";
import { findRiderTaskById } from "@/lib/mobile/orders";
import { riderDeliveryFailSchema, mobileRouteIdSchema } from "@/lib/mobile/validation";
import { prisma } from "@/lib/prisma";

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
  const parsed = riderDeliveryFailSchema.safeParse(body);
  if (!parsed.success) {
    return mobileError("Invalid failed-delivery payload", 400);
  }

  const task = await findRiderTaskById(idResult.data, auth.session.userId);
  if (!task) {
    return mobileError("Delivery not found", 404);
  }

  if (task.status === "failed" && task.order.deliveryOutcome === "failed") {
    return NextResponse.json({ success: true, alreadyFailed: true });
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.riderDeliveryTask.update({
      where: { id: task.id },
      data: {
        status: "failed",
        failedAt: now,
        failureReason: parsed.data.reason,
        latestSyncAt: now,
      },
    }),
    prisma.order.update({
      where: { id: task.orderId },
      data: {
        deliveryOutcome: "failed",
        deliveryFailedReason: parsed.data.reason,
        lastRiderUpdateAt: now,
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}
