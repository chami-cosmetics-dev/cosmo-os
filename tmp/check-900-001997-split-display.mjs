import { PrismaClient } from "@prisma/client";
import {
  resolveSplitPaymentDisplay,
} from "../lib/approval-payment-split.ts";

const prisma = new PrismaClient();

const o = await prisma.order.findFirst({
  where: { name: "900-001997" },
  select: {
    id: true,
    name: true,
    paymentGatewayPrimary: true,
    paymentGatewayNames: true,
  },
});

if (!o) {
  console.log("not found");
  await prisma.$disconnect();
  process.exit(0);
}

const aps = await prisma.approvalRequest.findMany({
  where: { orderId: o.id, type: "ORDER_PAYMENT_APPROVAL" },
  include: {
    paymentLines: true,
    reviewedBy: { select: { name: true, email: true } },
  },
  orderBy: { createdAt: "desc" },
});

const preferred =
  aps.find(
    (row) =>
      (row.status === "pending" || row.status === "approved") &&
      row.paymentLines.length >= 2,
  ) ??
  aps.find(
    (row) =>
      (row.status === "pending" || row.status === "approved") &&
      Boolean(row.requestNote?.trim()),
  ) ??
  aps[0];

const display = preferred
  ? resolveSplitPaymentDisplay({
      status: preferred.status,
      requestNote: preferred.requestNote,
      paymentLines: preferred.paymentLines,
    })
  : null;

console.log(
  JSON.stringify(
    {
      order: o,
      preferredApproval: preferred
        ? {
            id: preferred.id,
            status: preferred.status,
            requestNote: preferred.requestNote,
            lines: preferred.paymentLines,
            reviewedBy: preferred.reviewedBy,
          }
        : null,
      display,
      allApprovals: aps.map((a) => ({
        id: a.id,
        status: a.status,
        requestNote: a.requestNote,
        lineCount: a.paymentLines.length,
        lines: a.paymentLines,
      })),
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
