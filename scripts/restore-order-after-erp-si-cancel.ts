/**
 * Undo voided/returned after manual ERP SI cancel webhook (order still active in Shopify).
 * Usage: node scripts/with-env.mjs vault npx tsx scripts/restore-order-after-erp-si-cancel.ts SV1008221
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const orderName = process.argv[2]?.trim();
  if (!orderName) {
    console.error("Usage: npx tsx scripts/restore-order-after-erp-si-cancel.ts <order-name>");
    process.exit(1);
  }

  const rawUrl = process.env.DATABASE_URL ?? "";
  const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
  const prisma = new PrismaClient({
    datasources: { db: { url: directUrl || rawUrl } },
  });

  const order = await prisma.order.findFirst({
    where: {
      OR: [{ name: orderName }, { shopifyOrderId: orderName }, { erpnextInvoiceId: orderName }],
    },
    select: {
      id: true,
      name: true,
      financialStatus: true,
      fulfillmentStage: true,
      erpnextInvoiceId: true,
      sourceName: true,
    },
  });

  if (!order) {
    console.error("Order not found:", orderName);
    process.exit(1);
  }

  const source = order.sourceName?.toLowerCase() ?? "";
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      ...(order.financialStatus === "voided" ? { financialStatus: "pending" } : {}),
      ...(order.fulfillmentStage === "returned"
        ? { fulfillmentStage: source === "web" || source === "manual" ? "print" : "print" }
        : {}),
    },
    select: {
      name: true,
      financialStatus: true,
      fulfillmentStage: true,
      erpnextInvoiceId: true,
    },
  });

  console.log(JSON.stringify({ before: order, after: updated }, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
