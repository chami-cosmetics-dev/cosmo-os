import "server-only";

import { ORDER_PAYMENT_APPROVAL } from "@/lib/approval-workflow";
import {
  approvalSplitCashCollectAmount,
  approvalSplitPairId,
} from "@/lib/approval-payment-split";
import { prisma } from "@/lib/prisma";

export type OrderSplitPaymentLine = {
  paymentMethod: string;
  amount: number;
};

function toLines(
  rows: Array<{ paymentMethod: string; amount: { toString(): string } | string | number }>,
): OrderSplitPaymentLine[] {
  const lines = rows.map((row) => ({
    paymentMethod: row.paymentMethod,
    amount: Number(row.amount.toString()),
  }));
  if (approvalSplitPairId(lines.map((line) => line.paymentMethod)) == null) return [];
  return lines;
}

export async function loadLatestOrderSplitPaymentLines(
  orderId: string,
): Promise<OrderSplitPaymentLine[]> {
  const approval = await prisma.approvalRequest.findFirst({
    where: {
      orderId,
      type: ORDER_PAYMENT_APPROVAL,
      status: { in: ["pending", "approved"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      paymentLines: {
        select: { paymentMethod: true, amount: true },
      },
    },
  });
  return toLines(approval?.paymentLines ?? []);
}

export async function loadSplitPaymentLinesByOrderIds(
  orderIds: string[],
): Promise<Map<string, OrderSplitPaymentLine[]>> {
  const result = new Map<string, OrderSplitPaymentLine[]>();
  if (orderIds.length === 0) return result;

  const approvals = await prisma.approvalRequest.findMany({
    where: {
      orderId: { in: orderIds },
      type: ORDER_PAYMENT_APPROVAL,
      status: { in: ["pending", "approved"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      orderId: true,
      paymentLines: {
        select: { paymentMethod: true, amount: true },
      },
    },
  });

  for (const approval of approvals) {
    if (!approval.orderId || result.has(approval.orderId)) continue;
    const lines = toLines(approval.paymentLines);
    if (lines.length > 0) result.set(approval.orderId, lines);
  }
  return result;
}

export async function loadSplitCashCollectByOrderIds(
  orderIds: string[],
): Promise<Map<string, number>> {
  const splitByOrder = await loadSplitPaymentLinesByOrderIds(orderIds);
  const result = new Map<string, number>();
  for (const [orderId, lines] of splitByOrder) {
    const cash = approvalSplitCashCollectAmount(lines);
    if (cash != null) result.set(orderId, cash);
  }
  return result;
}
