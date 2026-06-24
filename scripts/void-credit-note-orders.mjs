/**
 * Mark all credit-note orders (negative totalPrice) as voided.
 *
 * Usage:
 *   node scripts/void-credit-note-orders.mjs           # dry run
 *   node scripts/void-credit-note-orders.mjs --apply   # update database
 */
import { PrismaClient } from "@prisma/client";

const apply = process.argv.includes("--apply");

const rawUrl = process.env.DATABASE_URL ?? "";
const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
const prisma = new PrismaClient({
  datasources: { db: { url: directUrl || rawUrl } },
});

const candidates = await prisma.order.findMany({
  where: {
    totalPrice: { lt: 0 },
    NOT: { financialStatus: "voided" },
  },
  select: {
    id: true,
    name: true,
    shopifyOrderId: true,
    financialStatus: true,
    fulfillmentStage: true,
    totalPrice: true,
    sourceName: true,
  },
  orderBy: { createdAt: "desc" },
});

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      count: candidates.length,
      orders: candidates.map((o) => ({
        id: o.id,
        name: o.name,
        shopifyOrderId: o.shopifyOrderId,
        financialStatus: o.financialStatus,
        fulfillmentStage: o.fulfillmentStage,
        totalPrice: o.totalPrice.toString(),
        sourceName: o.sourceName,
      })),
    },
    null,
    2,
  ),
);

if (apply && candidates.length > 0) {
  const result = await prisma.order.updateMany({
    where: {
      totalPrice: { lt: 0 },
      NOT: { financialStatus: "voided" },
    },
    data: { financialStatus: "voided" },
  });
  console.log(JSON.stringify({ updated: result.count }, null, 2));
}

await prisma.$disconnect();
