/* eslint-disable no-console */
// One-time: reset a test order back to a fresh print state
// Usage: node scripts/reset-order-to-print.cjs <orderName>
// Example: node scripts/with-env.mjs cosmo-prod node scripts/reset-order-to-print.cjs 110-000018

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const orderName = process.argv[2];
  if (!orderName) {
    console.error("Usage: node scripts/reset-order-to-print.cjs <orderName>");
    process.exit(1);
  }

  const order = await prisma.order.findFirst({
    where: { name: orderName },
    select: {
      id: true,
      name: true,
      fulfillmentStage: true,
      financialStatus: true,
      revertedFromInvoiceCompleteAt: true,
      approvalRequests: { select: { id: true, type: true, status: true } },
      returns: { select: { id: true, actionStatus: true, remarkTemplate: true } },
    },
  });

  if (!order) {
    console.error(`Order "${orderName}" not found`);
    process.exit(1);
  }

  console.log("Before:", JSON.stringify(order, null, 2));

  await prisma.$transaction(async (tx) => {
    // Cancel any pending approvals
    const cancelled = await tx.approvalRequest.updateMany({
      where: { orderId: order.id, status: "pending" },
      data: { status: "cancelled", reviewNote: "Reset to fresh print stage", updatedAt: new Date() },
    });
    console.log(`Cancelled ${cancelled.count} pending approval(s)`);

    // Delete all OrderReturn records for this order
    const deleted = await tx.orderReturn.deleteMany({ where: { orderId: order.id } });
    console.log(`Deleted ${deleted.count} OrderReturn record(s)`);

    // Reset financial status, clear revert fields, and clear print history
    await tx.order.update({
      where: { id: order.id },
      data: {
        financialStatus: "pending",
        revertedFromInvoiceCompleteAt: null,
        revertedFromInvoiceCompleteById: null,
        printCount: 0,
        lastPrintedAt: null,
        packageReadyAt: null,
        packageReadyById: null,
      },
    });
  });

  const after = await prisma.order.findUnique({
    where: { id: order.id },
    select: {
      name: true,
      fulfillmentStage: true,
      financialStatus: true,
      revertedFromInvoiceCompleteAt: true,
    },
  });

  console.log("After:", JSON.stringify(after, null, 2));
  console.log(`Done — ${orderName} reset to fresh print state`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
