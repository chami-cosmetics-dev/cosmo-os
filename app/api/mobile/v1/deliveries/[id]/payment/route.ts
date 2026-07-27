import { NextRequest, NextResponse } from "next/server";

import { requireRiderMobileSession, mobileError } from "@/lib/mobile/api";
import { inferCollectionStatus, inferExpectedPaymentMethod } from "@/lib/mobile/payment";
import {
  derivePaymentHeaderFromLines,
  normalizePaymentLines,
  sumPaymentLineAmounts,
} from "@/lib/mobile/payment-lines";
import {
  assertCustomerGaveCoversCashDue,
  cashDueFromPayment,
  computeChangeAmount,
} from "@/lib/mobile/payment-tender";
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
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (existing) {
      return NextResponse.json({
        success: true,
        paymentId: existing.id,
        deduplicated: true,
        lines: existing.lines.map((line) => ({
          id: line.id,
          paymentMethod: line.paymentMethod,
          amount: line.amount.toString(),
        })),
      });
    }
  }

  const fallbackMethod =
    parsed.data.paymentMethod ?? inferExpectedPaymentMethod(task.order);
  const lines = normalizePaymentLines({
    paymentMethod: fallbackMethod,
    collectedAmount: parsed.data.collectedAmount,
    bankReference: parsed.data.bankReference,
    cardReference: parsed.data.cardReference,
    referenceNote: parsed.data.referenceNote,
    lines: parsed.data.lines,
  });

  if (lines.length === 0) {
    return mobileError("Invalid payment payload", 400);
  }

  const expectedAmount = Number(task.order.totalPrice);
  const collectedTotal = sumPaymentLineAmounts(lines);
  if (Math.abs(expectedAmount - collectedTotal) >= 0.01) {
    return mobileError("Collected amount must match the order amount", 400);
  }

  const header = derivePaymentHeaderFromLines(lines);
  const cashDue = Number(
    cashDueFromPayment({
      paymentMethod: header.paymentMethod,
      collectedAmount: header.collectedAmount,
      lines,
    }).toString()
  );
  const tenderCheck = assertCustomerGaveCoversCashDue({
    customerGaveAmount: parsed.data.customerGaveAmount,
    cashDue,
  });
  if (!tenderCheck.ok) {
    return mobileError(tenderCheck.error, 400);
  }
  const customerGaveAmount =
    cashDue > 0.001 ? tenderCheck.customerGave.toFixed(2) : null;
  const changeAmount =
    cashDue > 0.001
      ? computeChangeAmount(tenderCheck.customerGave, cashDue).toFixed(2)
      : null;

  const collectionStatus = inferCollectionStatus({
    paymentMethod: header.paymentMethod,
    expectedAmount,
    collectedAmount: header.collectedAmount,
  });
  const now = new Date();

  const payment = await prisma.$transaction(async (tx) => {
    const upserted = await tx.deliveryPayment.upsert({
      where: { orderId: task.orderId },
      create: {
        orderId: task.orderId,
        riderId: auth.session.userId,
        expectedAmount: expectedAmount.toFixed(2),
        collectedAmount: header.collectedAmount.toFixed(2),
        customerGaveAmount,
        changeAmount,
        paymentMethod: header.paymentMethod,
        collectionStatus,
        referenceNote: header.referenceNote,
        bankReference: header.bankReference,
        cardReference: header.cardReference,
        collectedAt: now,
        idempotencyKey: parsed.data.idempotencyKey,
      },
      update: {
        riderId: auth.session.userId,
        expectedAmount: expectedAmount.toFixed(2),
        collectedAmount: header.collectedAmount.toFixed(2),
        customerGaveAmount,
        changeAmount,
        paymentMethod: header.paymentMethod,
        collectionStatus,
        referenceNote: header.referenceNote,
        bankReference: header.bankReference,
        cardReference: header.cardReference,
        collectedAt: now,
        idempotencyKey: parsed.data.idempotencyKey ?? undefined,
      },
    });

    await tx.deliveryPaymentLine.deleteMany({ where: { deliveryPaymentId: upserted.id } });
    await tx.deliveryPaymentLine.createMany({
      data: lines.map((line, index) => ({
        deliveryPaymentId: upserted.id,
        paymentMethod: line.paymentMethod,
        amount: line.amount.toFixed(2),
        bankReference: line.bankReference,
        cardReference: line.cardReference,
        referenceNote: line.referenceNote,
        sortOrder: index,
      })),
    });

    await tx.order.update({
      where: { id: task.orderId },
      data: { lastRiderUpdateAt: now },
    });

    return tx.deliveryPayment.findUniqueOrThrow({
      where: { id: upserted.id },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
  });

  return NextResponse.json({
    success: true,
    payment: {
      id: payment.id,
      expectedAmount: payment.expectedAmount.toString(),
      collectedAmount: payment.collectedAmount.toString(),
      customerGaveAmount: payment.customerGaveAmount?.toString() ?? null,
      changeAmount: payment.changeAmount?.toString() ?? null,
      paymentMethod: payment.paymentMethod,
      collectionStatus: payment.collectionStatus,
      collectedAt: payment.collectedAt?.toISOString() ?? null,
      lines: payment.lines.map((line) => ({
        id: line.id,
        paymentMethod: line.paymentMethod,
        amount: line.amount.toString(),
        bankReference: line.bankReference,
        cardReference: line.cardReference,
        referenceNote: line.referenceNote,
      })),
    },
  });
}
