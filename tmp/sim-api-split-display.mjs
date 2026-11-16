import { PrismaClient } from "@prisma/client";
import { resolveSplitPaymentDisplay } from "../lib/approval-payment-split.ts";

const prisma = new PrismaClient();
const ORDER_PAYMENT_APPROVAL = "order_payment_approval";

const o = await prisma.order.findFirst({
  where: { name: "900-001997" },
  select: { id: true, companyId: true, paymentGatewayPrimary: true },
});

const details = await prisma.order.findFirst({
  where: { id: o.id },
  select: {
    approvalRequests: {
      where: { type: { in: [ORDER_PAYMENT_APPROVAL] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        requestNote: true,
        paymentLines: { select: { paymentMethod: true, amount: true } },
      },
    },
  },
});

const paymentRows = details.approvalRequests;
const ap =
  paymentRows.find(
    (r) =>
      (r.status === "pending" || r.status === "approved") &&
      r.paymentLines.length >= 2,
  ) ??
  paymentRows.find(
    (r) =>
      (r.status === "pending" || r.status === "approved") &&
      Boolean(r.requestNote?.trim()),
  ) ??
  paymentRows[0];

const paymentApproval = ap
  ? {
      status: ap.status,
      requestNote: ap.requestNote,
      paymentLines: ap.paymentLines.map((l) => ({
        paymentMethod: l.paymentMethod,
        amount: l.amount.toString(),
      })),
    }
  : null;

const splitApprovals = await prisma.approvalRequest.findMany({
  where: {
    companyId: o.companyId,
    orderId: o.id,
    type: ORDER_PAYMENT_APPROVAL,
    status: { in: ["pending", "approved"] },
  },
  orderBy: { createdAt: "desc" },
  select: {
    orderId: true,
    status: true,
    requestNote: true,
    paymentLines: { select: { paymentMethod: true, amount: true } },
  },
});

console.log(
  JSON.stringify(
    {
      gateway: o.paymentGatewayPrimary,
      paymentApproval,
      display: resolveSplitPaymentDisplay(paymentApproval ?? {}),
      listLabel: splitApprovals[0]
        ? resolveSplitPaymentDisplay(splitApprovals[0])?.pairLabel
        : null,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
