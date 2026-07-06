/**
 * One-time fix: cancel pending ORDER_PAYMENT_APPROVAL records that were spuriously
 * created by the ERP SI webhook after a PAYMENT_METHOD_CHANGE_APPROVAL was already
 * approved for COD→KOKO/bank orders.
 *
 * Run: node scripts/cancel-spurious-order-payment-approvals.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ORDER_NAMES = ["60016465", "60016447"];

async function main() {
  for (const orderName of ORDER_NAMES) {
    const order = await prisma.order.findFirst({
      where: { name: orderName },
      select: { id: true, name: true, financialStatus: true, paymentGatewayPrimary: true },
    });

    if (!order) {
      console.log(`[${orderName}] Order not found — skipping`);
      continue;
    }

    const approvedMethodChange = await prisma.approvalRequest.findFirst({
      where: {
        orderId: order.id,
        type: "payment_method_change_approval",
        status: "approved",
      },
      select: { id: true },
    });

    if (!approvedMethodChange) {
      console.log(`[${orderName}] No approved PAYMENT_METHOD_CHANGE_APPROVAL — skipping (not a COD→KOKO case)`);
      continue;
    }

    const result = await prisma.approvalRequest.updateMany({
      where: {
        orderId: order.id,
        type: "order_payment_approval",
        status: "pending",
      },
      data: {
        status: "cancelled",
        reviewNote: "Cancelled — spurious record created by ERP webhook after payment method change was already approved",
        updatedAt: new Date(),
      },
    });

    console.log(`[${orderName}] Cancelled ${result.count} spurious pending ORDER_PAYMENT_APPROVAL record(s)`);
  }

  console.log("Done.");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
