/**
 * One-time fix for orders 60016465 and 60016447:
 *  1. Cancel the spurious pending ORDER_PAYMENT_APPROVAL created by the ERP SI
 *     webhook after PAYMENT_METHOD_CHANGE_APPROVAL was already approved.
 *  2. Move orders back from invoice_complete → print so they continue through
 *     the normal fulfillment pipeline (dispatch → delivery → invoice_complete).
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
      select: {
        id: true,
        name: true,
        fulfillmentStage: true,
        financialStatus: true,
        paymentGatewayPrimary: true,
      },
    });

    if (!order) {
      console.log(`[${orderName}] Order not found — skipping`);
      continue;
    }

    console.log(`[${orderName}] Current stage: ${order.fulfillmentStage}, financialStatus: ${order.financialStatus}`);

    const approvedMethodChange = await prisma.approvalRequest.findFirst({
      where: {
        orderId: order.id,
        type: "payment_method_change_approval",
        status: "approved",
      },
      select: { id: true },
    });

    if (!approvedMethodChange) {
      console.log(`[${orderName}] No approved PAYMENT_METHOD_CHANGE_APPROVAL — skipping`);
      continue;
    }

    // 1. Cancel spurious pending ORDER_PAYMENT_APPROVAL
    const cancelled = await prisma.approvalRequest.updateMany({
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
    console.log(`[${orderName}] Cancelled ${cancelled.count} spurious pending ORDER_PAYMENT_APPROVAL record(s)`);

    // 2. Move back from invoice_complete → print so order can be dispatched and delivered normally
    if (order.fulfillmentStage === "invoice_complete") {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          fulfillmentStage: "print",
          fulfillmentStatus: "unfulfilled",
          // Clear invoice_complete timestamps so the stage is genuinely re-enterable
          invoiceCompleteAt: null,
          invoiceCompleteById: null,
        },
      });
      console.log(`[${orderName}] Stage reset: invoice_complete → print`);
    } else {
      console.log(`[${orderName}] Stage is ${order.fulfillmentStage}, not invoice_complete — stage not changed`);
    }
  }

  console.log("\nDone. Orders are now at 'print' stage and will appear in the fulfillment queue.");
  console.log("Mark each as package ready when packed, then dispatch normally.");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
