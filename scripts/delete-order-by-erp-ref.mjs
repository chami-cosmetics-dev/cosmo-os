/**
 * Delete a single order by ERP invoice reference (name, erpnextInvoiceId, or shopifyOrderId).
 *
 * Child records that cascade-delete automatically:
 *   OrderLineItem, OrderReturn, ApprovalRequest (nulled), OrderWaybill (nulled),
 *   RiderDeliveryTask, DeliveryPayment, MerchantOrderReview, OrderRemark,
 *   OrderSampleFreeIssue, PickListGroupOrder, OrderExchange refs (nulled)
 *
 * Usage:
 *   node scripts/with-env.mjs vault node scripts/delete-order-by-erp-ref.mjs ACC-SINV-2026-00390
 *   node scripts/with-env.mjs vault node scripts/delete-order-by-erp-ref.mjs ACC-SINV-2026-00390 --apply
 */
import { PrismaClient } from "@prisma/client";

const ref = process.argv[2]?.trim();
const apply = process.argv.includes("--apply");

if (!ref) {
  console.error("Usage: node scripts/delete-order-by-erp-ref.mjs <erp-invoice-ref> [--apply]");
  process.exit(1);
}

const rawUrl = process.env.DATABASE_URL ?? "";
const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
const prisma = new PrismaClient({
  datasources: { db: { url: directUrl || rawUrl } },
});

const order = await prisma.order.findFirst({
  where: {
    OR: [
      { name: ref },
      { erpnextInvoiceId: ref },
      { shopifyOrderId: ref },
      { shopifyOrderId: `erp-${ref}` },
    ],
  },
  select: {
    id: true,
    name: true,
    shopifyOrderId: true,
    erpnextInvoiceId: true,
    financialStatus: true,
    fulfillmentStage: true,
    totalPrice: true,
    sourceName: true,
    createdAt: true,
    companyLocation: { select: { name: true } },
    _count: {
      select: {
        lineItems: true,
        returns: true,
        approvalRequests: true,
        remarks: true,
      },
    },
  },
});

if (!order) {
  console.log(JSON.stringify({ found: false, ref }, null, 2));
  process.exit(0);
}

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      found: true,
      order: {
        id: order.id,
        name: order.name,
        shopifyOrderId: order.shopifyOrderId,
        erpnextInvoiceId: order.erpnextInvoiceId,
        financialStatus: order.financialStatus,
        fulfillmentStage: order.fulfillmentStage,
        totalPrice: order.totalPrice.toString(),
        sourceName: order.sourceName,
        location: order.companyLocation?.name ?? null,
        createdAt: order.createdAt.toISOString(),
        relatedCounts: order._count,
      },
    },
    null,
    2,
  ),
);

if (apply) {
  await prisma.order.delete({ where: { id: order.id } });
  console.log(JSON.stringify({ deleted: true, id: order.id, name: order.name }, null, 2));
}

await prisma.$disconnect();
