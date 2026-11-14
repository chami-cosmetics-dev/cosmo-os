import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const orderId = "cmwey46ht001xjs08ze44tvbs";
const now = new Date();

const before = await prisma.order.findUnique({
  where: { id: orderId },
  select: {
    id: true,
    name: true,
    fulfillmentStage: true,
    financialStatus: true,
    paymentGatewayPrimary: true,
    sampleFreeIssueCompleteAt: true,
    lastPrintedAt: true,
    packageReadyAt: true,
    dispatchedAt: true,
  },
});
console.log("BEFORE", JSON.stringify(before, null, 2));

const approvals = await prisma.approvalRequest.findMany({
  where: { orderId, type: "order_payment_approval" },
  select: { id: true, status: true },
});

await prisma.$transaction(async (tx) => {
  for (const approval of approvals) {
    await tx.approvalPaymentLine.deleteMany({ where: { approvalRequestId: approval.id } });
    await tx.approvalRequest.update({
      where: { id: approval.id },
      data: {
        status: "cancelled",
        reviewNote: "Reset to order_received so merchant can redo Cash + Card split",
        requestNote: null,
        reviewedAt: null,
        reviewedById: null,
        kokoReference: null,
        multipleKokoPayments: false,
        updatedAt: now,
      },
    });
  }

  await tx.order.update({
    where: { id: orderId },
    data: {
      fulfillmentStage: "order_received",
      fulfillmentStageEnteredAt: now,
      financialStatus: "pending",
      sampleFreeIssueCompleteAt: null,
      sampleFreeIssueCompleteById: null,
      sampleFreeIssueSendLaterDate: null,
      printCount: 0,
      lastPrintedAt: null,
      lastPrintedById: null,
      packageReadyAt: null,
      packageReadyById: null,
      packageOnHoldAt: null,
      packageHoldReasonId: null,
      dispatchedAt: null,
      dispatchedById: null,
      dispatchedByRiderId: null,
      dispatchedByCourierServiceId: null,
      dispatchedToCustomer: false,
      riderDeliveryToken: null,
      deliveryCompleteAt: null,
      deliveryCompleteById: null,
      invoiceCompleteAt: null,
      invoiceCompleteById: null,
      deliveryOutcome: "pending",
      deliveryFailedReason: null,
      lastRiderUpdateAt: null,
      fulfillmentStatus: "unfulfilled",
      updatedAt: now,
    },
  });
});

const after = await prisma.order.findUnique({
  where: { id: orderId },
  select: {
    id: true,
    name: true,
    fulfillmentStage: true,
    financialStatus: true,
    paymentGatewayPrimary: true,
    sampleFreeIssueCompleteAt: true,
    packageReadyAt: true,
    dispatchedAt: true,
  },
});
const afterApprovals = await prisma.approvalRequest.findMany({
  where: { orderId, type: "order_payment_approval" },
  select: {
    id: true,
    status: true,
    reviewNote: true,
    paymentLines: { select: { paymentMethod: true, amount: true } },
  },
});
console.log("AFTER", JSON.stringify(after, null, 2));
console.log("APPROVALS", JSON.stringify(afterApprovals, null, 2));
await prisma.$disconnect();
