import "server-only";

import {
  assertPaymentMethodsAllowed,
  resolveMobileCollectAmount,
} from "@/lib/mobile/collect-amount";
import { resolveCardLast4, uploadCardSlipImage } from "@/lib/mobile/card-slip";
import type { RiderTaskForMutation } from "@/lib/mobile/find-rider-task-for-mutation";
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
import type { riderPaymentSchema } from "@/lib/mobile/validation";
import { approvalSplitCashCollectAmount } from "@/lib/approval-payment-split";
import { loadLatestOrderSplitPaymentLines } from "@/lib/order-split-payment";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";

type PaymentInput = z.infer<typeof riderPaymentSchema>;

export type RecordRiderPaymentResult =
  | {
      ok: true;
      deduplicated?: boolean;
      payment: {
        id: string;
        expectedAmount: string;
        collectedAmount: string;
        customerGaveAmount: string | null;
        changeAmount: string | null;
        paymentMethod: string;
        collectionStatus: string;
        collectedAt: string | null;
        lines: Array<{
          id: string;
          paymentMethod: string;
          amount: string;
          bankReference: string | null;
          cardReference: string | null;
          referenceNote: string | null;
        }>;
      };
    }
  | { ok: false; error: string; status: number };

export async function recordRiderPayment(input: {
  riderId: string;
  task: RiderTaskForMutation;
  data: PaymentInput;
}): Promise<RecordRiderPaymentResult> {
  const { riderId, task, data } = input;

  if (data.idempotencyKey) {
    const existing = await prisma.deliveryPayment.findFirst({
      where: { idempotencyKey: data.idempotencyKey },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (existing) {
      return {
        ok: true,
        deduplicated: true,
        payment: {
          id: existing.id,
          expectedAmount: existing.expectedAmount.toString(),
          collectedAmount: existing.collectedAmount.toString(),
          customerGaveAmount: existing.customerGaveAmount?.toString() ?? null,
          changeAmount: existing.changeAmount?.toString() ?? null,
          paymentMethod: existing.paymentMethod,
          collectionStatus: existing.collectionStatus,
          collectedAt: existing.collectedAt?.toISOString() ?? null,
          lines: existing.lines.map((line) => ({
            id: line.id,
            paymentMethod: line.paymentMethod,
            amount: line.amount.toString(),
            bankReference: line.bankReference,
            cardReference: line.cardReference,
            referenceNote: line.referenceNote,
          })),
        },
      };
    }
  }

  const fallbackMethod = data.paymentMethod ?? inferExpectedPaymentMethod(task.order);
  const topLevelLast4 = resolveCardLast4({
    cardLast4: data.cardLast4,
    cardReference: data.cardReference,
  });
  const lines = normalizePaymentLines({
    paymentMethod: fallbackMethod,
    collectedAmount: data.collectedAmount,
    bankReference: data.bankReference,
    cardReference: topLevelLast4 ?? data.cardReference,
    referenceNote: data.referenceNote,
    lines: data.lines?.map((line) => ({
      ...line,
      cardReference:
        resolveCardLast4({
          cardLast4: line.cardLast4,
          cardReference: line.cardReference,
        }) ?? line.cardReference,
    })),
  });

  if (lines.length === 0) {
    return { ok: false, error: "Invalid payment payload", status: 400 };
  }

  const cashToCollect = approvalSplitCashCollectAmount(
    await loadLatestOrderSplitPaymentLines(task.orderId)
  );
  const collect = resolveMobileCollectAmount({
    totalPrice: task.order.totalPrice,
    collectCashAmount: cashToCollect,
    discountCodes: task.order.discountCodes,
    paymentGatewayPrimary: task.order.paymentGatewayPrimary,
    paymentGatewayNames: task.order.paymentGatewayNames,
    financialStatus: task.order.financialStatus,
  });
  const methodError = assertPaymentMethodsAllowed(lines, collect.allowedPaymentMethods);
  if (methodError) {
    return { ok: false, error: methodError, status: 400 };
  }

  const expectedAmount = collect.amount;
  const collectedTotal = sumPaymentLineAmounts(lines);
  if (Math.abs(expectedAmount - collectedTotal) >= 0.01) {
    return {
      ok: false,
      error:
        expectedAmount <= 0.009
          ? "Already-paid orders must be recorded as Online with amount 0"
          : "Collected amount must match the amount due",
      status: 400,
    };
  }

  const header = derivePaymentHeaderFromLines(lines);
  const usesCard = lines.some((line) => line.paymentMethod === "card");
  const cardLast4 = usesCard
    ? resolveCardLast4({
        cardLast4: data.cardLast4 ?? header.cardReference,
        cardReference: header.cardReference,
      })
    : null;
  if (usesCard && !cardLast4) {
    return { ok: false, error: "Enter the last 4 digits of the card", status: 400 };
  }

  let cardSlipImageUrl = data.cardSlipImageUrl?.trim() || null;
  if (usesCard && !cardSlipImageUrl && data.cardSlipImageBase64) {
    const uploaded = await uploadCardSlipImage({
      companyId: task.order.companyId,
      orderId: task.orderId,
      imageBase64: data.cardSlipImageBase64,
    });
    if ("error" in uploaded) {
      return { ok: false, error: uploaded.error, status: 400 };
    }
    cardSlipImageUrl = uploaded.url;
  }
  if (usesCard && !cardSlipImageUrl) {
    return { ok: false, error: "Photo of the card payment slip is required", status: 400 };
  }

  const cashDue = Number(
    cashDueFromPayment({
      paymentMethod: header.paymentMethod,
      collectedAmount: header.collectedAmount,
      lines,
    }).toString()
  );
  const tenderCheck = assertCustomerGaveCoversCashDue({
    customerGaveAmount: data.customerGaveAmount,
    cashDue,
  });
  if (!tenderCheck.ok) {
    return { ok: false, error: tenderCheck.error, status: 400 };
  }

  const customerGaveAmount = cashDue > 0.001 ? tenderCheck.customerGave.toFixed(2) : null;
  const changeAmount =
    cashDue > 0.001 ? computeChangeAmount(tenderCheck.customerGave, cashDue).toFixed(2) : null;

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
        riderId,
        expectedAmount: expectedAmount.toFixed(2),
        collectedAmount: header.collectedAmount.toFixed(2),
        customerGaveAmount,
        changeAmount,
        paymentMethod: header.paymentMethod,
        collectionStatus,
        referenceNote: header.referenceNote,
        bankReference: header.bankReference,
        cardReference: cardLast4 ?? header.cardReference,
        cardLast4,
        cardSlipImageUrl,
        collectedAt: now,
        idempotencyKey: data.idempotencyKey,
      },
      update: {
        riderId,
        expectedAmount: expectedAmount.toFixed(2),
        collectedAmount: header.collectedAmount.toFixed(2),
        customerGaveAmount,
        changeAmount,
        paymentMethod: header.paymentMethod,
        collectionStatus,
        referenceNote: header.referenceNote,
        bankReference: header.bankReference,
        cardReference: cardLast4 ?? header.cardReference,
        cardLast4,
        cardSlipImageUrl,
        collectedAt: now,
        idempotencyKey: data.idempotencyKey ?? undefined,
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

  return {
    ok: true,
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
  };
}
