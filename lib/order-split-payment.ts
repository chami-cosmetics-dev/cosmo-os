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

export type OrderSplitApprovalForErp = {
  id: string;
  status: string;
  kokoReference: string | null;
  paymentLines: Array<{
    id: string;
    paymentMethod: string;
    amount: { toString(): string };
    erpPaymentEntryName: string | null;
  }>;
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

function pickLatestSplitApproval<T extends {
  status: string;
  paymentLines: Array<{ paymentMethod: string; amount: { toString(): string } | string | number }>;
}>(rows: T[]): T | null {
  return (
    rows.find(
      (row) =>
        (row.status === "pending" || row.status === "approved") &&
        approvalSplitPairId(row.paymentLines.map((line) => line.paymentMethod)) != null,
    ) ??
    rows[0] ??
    null
  );
}

export async function loadLatestOrderSplitPaymentLines(
  orderId: string,
): Promise<OrderSplitPaymentLine[]> {
  const approvals = await prisma.approvalRequest.findMany({
    where: {
      orderId,
      type: ORDER_PAYMENT_APPROVAL,
      status: { in: ["pending", "approved"] },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      status: true,
      paymentLines: {
        select: { paymentMethod: true, amount: true },
      },
    },
  });
  const approval = pickLatestSplitApproval(approvals);
  return toLines(approval?.paymentLines ?? []);
}

/** Latest pending/approved split plan with line ids for ERP PE create/retry. */
export async function loadLatestOrderSplitApprovalForErp(
  orderId: string,
): Promise<OrderSplitApprovalForErp | null> {
  const approvals = await prisma.approvalRequest.findMany({
    where: {
      orderId,
      type: ORDER_PAYMENT_APPROVAL,
      status: { in: ["pending", "approved"] },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      kokoReference: true,
      paymentLines: {
        select: {
          id: true,
          paymentMethod: true,
          amount: true,
          erpPaymentEntryName: true,
        },
      },
    },
  });
  const approval = pickLatestSplitApproval(approvals);
  if (!approval) return null;
  if (approvalSplitPairId(approval.paymentLines.map((line) => line.paymentMethod)) == null) {
    return null;
  }
  return approval;
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
