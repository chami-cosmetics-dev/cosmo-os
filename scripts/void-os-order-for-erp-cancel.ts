/**
 * Void an OS order after ERP already cancelled the Sales Invoice.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod npx tsx scripts/void-os-order-for-erp-cancel.ts 600-006437 --po 60020348
 *   node scripts/with-env.mjs cosmo-prod npx tsx scripts/void-os-order-for-erp-cancel.ts 600-006437 --po 60020348 --apply
 */
import { PrismaClient } from "@prisma/client";

const ERP_RESOLVED_APPROVAL_CANCEL_NOTE =
  "ERP already cancelled or credit-noted this invoice — approval no longer required";
const ERP_CANCEL_REASON_CANCEL = "ERP cancel";
const PLACEHOLDER_INVOICE_IDS = new Set(["pending", "pending_approval"]);
const ERP_NATIVE_SOURCES = new Set(["erpnext", "erpnext-pos"]);

const rawUrl = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  datasources: { db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl } },
});

function shouldVoid(cancelledInvoiceName: string, linkedInvoiceId?: string | null) {
  const linked = linkedInvoiceId?.trim() ?? "";
  if (!linked || PLACEHOLDER_INVOICE_IDS.has(linked)) return true;
  return linked === cancelledInvoiceName.trim();
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const apply = args.includes("--apply");
  const poIdx = args.indexOf("--po");
  const poNo = poIdx >= 0 ? args[poIdx + 1]?.trim() || null : null;
  const invoiceRef = args.find((arg) => !arg.startsWith("--") && arg !== poNo)?.trim();

  if (!invoiceRef) {
    console.error(
      "Usage: npx tsx scripts/void-os-order-for-erp-cancel.ts <si-name> [--po <order-no>] [--apply]",
    );
    process.exit(1);
  }

  const matches = await prisma.order.findMany({
    where: {
      OR: [
        { erpnextInvoiceId: invoiceRef },
        { name: invoiceRef },
        { shopifyOrderId: invoiceRef },
        { shopifyOrderId: `erp-${invoiceRef}` },
        ...(poNo
          ? [
              { name: poNo },
              { orderNumber: poNo },
              { shopifyOrderId: poNo },
              { name: `#${poNo}` },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      sourceName: true,
      financialStatus: true,
      fulfillmentStage: true,
      erpnextInvoiceId: true,
      cancelledAt: true,
      cancelReason: true,
      approvalRequests: {
        where: { status: "pending" },
        select: { id: true, type: true, status: true },
      },
    },
  });

  const shopifyLinked = matches.find(
    (row) => !ERP_NATIVE_SOURCES.has((row.sourceName ?? "").toLowerCase()),
  );
  const target = shopifyLinked ?? matches[0] ?? null;

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        invoiceRef,
        poNo,
        targetId: target?.id ?? null,
        matches: matches.map((row) => ({
          ...row,
          cancelledAt: row.cancelledAt?.toISOString() ?? null,
        })),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.error("Re-run with --apply to void the Shopify/web order and close pending finance cancel.");
    return;
  }

  if (!target) {
    console.error("No OS order found.");
    process.exitCode = 1;
    return;
  }

  if (!shouldVoid(invoiceRef, target.erpnextInvoiceId)) {
    console.error(
      `Skip void: order ${target.name} is linked to ${target.erpnextInvoiceId}, not ${invoiceRef}.`,
    );
    process.exitCode = 1;
    return;
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.order.update({
      where: { id: target.id },
      data: {
        financialStatus: "voided",
        ...(target.fulfillmentStage === "returned"
          ? { fulfillmentStage: "order_received" }
          : {}),
        ...(target.cancelledAt ? {} : { cancelledAt: now }),
        ...(target.cancelReason?.trim() ? {} : { cancelReason: ERP_CANCEL_REASON_CANCEL }),
        erpnextSyncError: null,
        erpnextSyncFailedAt: null,
        erpnextSyncAutoRetryCount: 0,
        erpnextSyncLastAutoRetryAt: null,
        erpnextSyncNextAutoRetryAt: null,
        erpnextSyncRetryLeaseExpiresAt: null,
      },
    }),
    prisma.approvalRequest.updateMany({
      where: { status: "pending", orderId: target.id },
      data: {
        status: "cancelled",
        reviewNote: ERP_RESOLVED_APPROVAL_CANCEL_NOTE,
        updatedAt: now,
      },
    }),
    prisma.orderReturn.updateMany({
      where: { orderId: target.id, actionStatus: "pending" },
      data: { actionStatus: "solved", actionDate: now },
    }),
  ]);

  const after = await prisma.order.findUnique({
    where: { id: target.id },
    select: {
      id: true,
      name: true,
      financialStatus: true,
      fulfillmentStage: true,
      cancelledAt: true,
      cancelReason: true,
      approvalRequests: {
        where: { status: "pending" },
        select: { id: true, type: true, status: true },
      },
    },
  });

  console.log(JSON.stringify({ voided: after }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
