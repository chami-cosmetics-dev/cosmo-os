/**
 * Restore rearranged orders voided by a delayed ERP credit note webhook back to ready_to_dispatch.
 * Only acts on orders that have a rearrange return with actionStatus=solved.
 *
 * Usage: node scripts/with-env.mjs vault npx tsx scripts/restore-rearranged-orders-to-dispatch.ts SV1008384 SV1008323 SV1008381
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const orderNames = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
  if (!orderNames.length) {
    console.error("Usage: node scripts/with-env.mjs <env> npx tsx scripts/restore-rearranged-orders-to-dispatch.ts <order1> [order2 ...]");
    process.exit(1);
  }

  const rawUrl = process.env.DATABASE_URL ?? "";
  const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
  const prisma = new PrismaClient({
    datasources: { db: { url: directUrl || rawUrl } },
  });

  for (const orderName of orderNames) {
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
        returns: {
          select: { id: true, actionType: true, actionStatus: true },
        },
      },
    });

    if (!order) {
      console.error(`[SKIP] Order not found: ${orderName}`);
      continue;
    }

    const rearrangeReturn = order.returns.find(
      (r) => r.actionType === "rearrange" && r.actionStatus === "solved",
    );

    if (!rearrangeReturn) {
      console.error(`[SKIP] ${order.name} — no solved rearrange return found`);
      console.log("  returns:", JSON.stringify(order.returns));
      continue;
    }

    if (order.fulfillmentStage === "ready_to_dispatch") {
      console.log(`[SKIP] ${order.name} — already at ready_to_dispatch`);
      continue;
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        fulfillmentStage: "ready_to_dispatch",
        financialStatus: "paid",
      },
      select: {
        name: true,
        financialStatus: true,
        fulfillmentStage: true,
      },
    });

    console.log(`[OK] ${order.name}`);
    console.log("  before:", { fulfillmentStage: order.fulfillmentStage, financialStatus: order.financialStatus });
    console.log("  after: ", updated);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
