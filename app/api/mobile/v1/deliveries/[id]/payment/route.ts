import { NextRequest, NextResponse } from "next/server";

import { requireRiderMobileSession, mobileError } from "@/lib/mobile/api";
import { inferCollectionStatus, inferExpectedPaymentMethod } from "@/lib/mobile/payment";
import { findRiderTaskById } from "@/lib/mobile/orders";
import { mobileRouteIdSchema, riderPaymentSchema } from "@/lib/mobile/validation";
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
  const parsed = riderPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return mobileError("Invalid payment payload", 400);
  }

  const task = await findRiderTaskById(idResult.data, auth.session.userId);
  if (!task) {
    return mobileError("Delivery not found", 404);
  }

  if (parsed.data.idempotencyKey) {
    const existing = await prisma.deliveryPayment.findFirst({
      where: { idempotencyKey: parsed.data.idempotencyKey },
    });
    if (existing) {
      return NextResponse.json({ success: true, paymentId: existing.id, deduplicated: true });
    }
  }

  const expectedAmount = Number(task.order.totalPrice);
  const effectiveMethod =
    parsed.data.paymentMethod ?? inferExpectedPaymentMethod(task.order);
  const collectionStatus = inferCollectionStatus({
    paymentMethod: effectiveMethod,
    expectedAmount,
    collectedAmount: parsed.data.collectedAmount,
  });
  const now = new Date();

  const payment = await prisma.deliveryPayment.upsert({
    where: { orderId: task.orderId },
    create: {
      orderId: task.orderId,
      riderId: auth.session.userId,
      expectedAmount: expectedAmount.toFixed(2),
      collectedAmount: parsed.data.collectedAmount.toFixed(2),
      paymentMethod: effectiveMethod,
      collectionStatus,
      referenceNote: parsed.data.referenceNote?.trim() || null,
      bankReference: parsed.data.bankReference?.trim() || null,
      cardReference: parsed.data.cardReference?.trim() || null,
      collectedAt: now,
      idempotencyKey: parsed.data.idempotencyKey,
    },
    update: {
      riderId: auth.session.userId,
      expectedAmount: expectedAmount.toFixed(2),
      collectedAmount: parsed.data.collectedAmount.toFixed(2),
      paymentMethod: effectiveMethod,
      collectionStatus,
      referenceNote: parsed.data.referenceNote?.trim() || null,
      bankReference: parsed.data.bankReference?.trim() || null,
      cardReference: parsed.data.cardReference?.trim() || null,
      collectedAt: now,
      idempotencyKey: parsed.data.idempotencyKey ?? undefined,
    },
  });

  await prisma.order.update({
    where: { id: task.orderId },
    data: { lastRiderUpdateAt: now },
  });

  return NextResponse.json({
    success: true,
    payment: {
      id: payment.id,
      expectedAmount: payment.expectedAmount.toString(),
      collectedAmount: payment.collectedAmount.toString(),
      paymentMethod: payment.paymentMethod,
      collectionStatus: payment.collectionStatus,
      collectedAt: payment.collectedAt?.toISOString() ?? null,
    },
  });
}
