/**
 * Find orders stuck in fulfillmentStage="returned" with financialStatus != "voided"
 * and correct their financialStatus to "voided".
 *
 * This inconsistent state occurs when the fulfillment stage was set to "returned"
 * by an older code path that didn't simultaneously update financialStatus.
 * All current code paths set both fields together, so this is purely a data fix.
 *
 * Usage:
 *   node scripts/fix-returned-orders-financial-status.mjs           # dry run
 *   node scripts/fix-returned-orders-financial-status.mjs --apply   # update database
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
    fulfillmentStage: "returned",
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
    createdAt: true,
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
        createdAt: o.createdAt.toISOString(),
      })),
    },
    null,
    2,
  ),
);

if (apply && candidates.length > 0) {
  const result = await prisma.order.updateMany({
    where: {
      fulfillmentStage: "returned",
      NOT: { financialStatus: "voided" },
    },
    data: { financialStatus: "voided" },
  });
  console.log(JSON.stringify({ updated: result.count }, null, 2));
}

await prisma.$disconnect();
