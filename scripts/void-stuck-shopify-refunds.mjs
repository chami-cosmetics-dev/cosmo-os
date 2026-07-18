/**
 * Mark fully refunded Shopify orders stuck in active fulfillment as voided.
 *
 * Dry-run:
 *   node scripts/with-env.mjs vault node scripts/void-stuck-shopify-refunds.mjs
 * Apply:
 *   node scripts/with-env.mjs vault node scripts/void-stuck-shopify-refunds.mjs --apply
 */
import { PrismaClient } from "@prisma/client";

const apply = process.argv.includes("--apply");
const activeStages = [
  "order_received",
  "sample_free_issue",
  "print",
  "ready_to_dispatch",
  "dispatched",
];

const rawUrl = process.env.DATABASE_URL ?? "";
const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
const prisma = new PrismaClient({
  datasources: { db: { url: directUrl || rawUrl } },
});

function rawShopifyFinancialStatus(rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const nested =
    rawPayload.data && typeof rawPayload.data === "object" && !Array.isArray(rawPayload.data)
      ? rawPayload.data
      : null;
  const value = rawPayload.financial_status ?? nested?.financial_status;
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

try {
  const candidates = await prisma.order.findMany({
    where: {
      financialStatus: { in: ["refunded", "voided"], mode: "insensitive" },
      fulfillmentStage: { in: activeStages },
      revertedFromInvoiceCompleteAt: null,
      sourceName: { notIn: ["erpnext", "erpnext-pos"] },
    },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      erpnextInvoiceId: true,
      financialStatus: true,
      fulfillmentStage: true,
      cancelledAt: true,
      cancelReason: true,
      rawPayload: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const orders = candidates.filter(
    (order) => rawShopifyFinancialStatus(order.rawPayload) === "refunded",
  );
  const ordersToVoid = orders.filter(
    (order) => order.financialStatus?.toLowerCase() === "refunded",
  );
  const legacyAccSinvCount = await prisma.order.count({
    where: {
      fulfillmentStage: { in: activeStages },
      OR: [
        { name: { startsWith: "ACC-SINV", mode: "insensitive" } },
        { erpnextInvoiceId: { startsWith: "ACC-SINV", mode: "insensitive" } },
      ],
    },
  });

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        refundedCandidates: ordersToVoid.map((order) => ({
          id: order.id,
          name: order.name,
          orderNumber: order.orderNumber,
          erpnextInvoiceId: order.erpnextInvoiceId,
          fulfillmentStage: order.fulfillmentStage,
          cancelledAt: order.cancelledAt,
          cancelReason: order.cancelReason,
        })),
        refundedCandidateCount: ordersToVoid.length,
        approvalReconciliationOrderCount: orders.length,
        ignoredLegacyAccSinvActiveCount: legacyAccSinvCount,
      },
      null,
      2,
    ),
  );

  if (apply && orders.length > 0) {
    const now = new Date();
    const orderIds = orders.map((order) => order.id);
    await prisma.$transaction([
      ...ordersToVoid.map((order) =>
        prisma.order.update({
          where: { id: order.id },
          data: {
            financialStatus: "voided",
            cancelledAt: order.cancelledAt ?? now,
            cancelReason: order.cancelReason ?? "Refunded in Shopify",
          },
        }),
      ),
      prisma.approvalRequest.updateMany({
        where: { orderId: { in: orderIds }, status: "pending" },
        data: {
          status: "cancelled",
          reviewNote: "Order voided — approval no longer required",
        },
      }),
      prisma.approvalRequest.updateMany({
        where: {
          status: "pending",
          orderReturn: { orderId: { in: orderIds } },
        },
        data: {
          status: "cancelled",
          reviewNote: "Order voided — approval no longer required",
        },
      }),
      prisma.orderReturn.updateMany({
        where: {
          orderId: { in: orderIds },
          actionType: "cancel",
          actionStatus: "pending",
        },
        data: { actionStatus: "solved", actionDate: now },
      }),
    ]);
    console.log(
      `Voided ${ordersToVoid.length} fully refunded Shopify order(s); reconciled pending approvals for ${orders.length} order(s).`,
    );
  }
} finally {
  await prisma.$disconnect();
}
