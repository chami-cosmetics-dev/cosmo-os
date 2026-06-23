/**
 * Re-sync a Vault order to ERP after the wrong Sales Invoice was cancelled in ERPNext.
 *
 * ERP cancel via API is broken on some sites (Vault-OS API user) — cancel in ERP UI first.
 *
 * Usage:
 *   1. In ERPNext UI: Cancel wrong Sales Invoice(ices) for the order (e.g. SV100-0419).
 *   2. node scripts/with-env.mjs vault npx tsx scripts/recorrect-erp-order.ts SV1008163 --assume-cancelled
 *
 * Options:
 *   --invoice <erp-name>   Resolve order by erpnextInvoiceId
 *   --assume-cancelled     Skip API cancel (use after manual cancel in ERP)
 */
import { PrismaClient, type Prisma } from "@prisma/client";

import { ERP_SYNC_SUCCESS_CLEAR } from "@/lib/failed-erp-sync-auto-retry";
import { cancelErpnextSalesInvoice, syncOrderToERPNext } from "@/lib/erpnext-sync";
import { shopifyOrderWebhookSchema } from "@/lib/validation/shopify-order";

/** ERP SI cancel webhook marks Shopify orders voided/returned — undo when re-correcting. */
function restoreOrderStatusAfterManualSiCancel(order: {
  financialStatus: string | null;
  fulfillmentStage: string | null;
  sourceName: string | null;
}): Prisma.OrderUpdateInput {
  const patch: Prisma.OrderUpdateInput = {};
  if (order.financialStatus === "voided") {
    patch.financialStatus = "pending";
  }
  if (order.fulfillmentStage === "returned") {
    const source = order.sourceName?.toLowerCase() ?? "";
    patch.fulfillmentStage =
      source === "web" || source === "manual" ? "print" : "print";
  }
  return patch;
}

async function main() {
  const args = process.argv.slice(2);
  const assumeCancelled = args.includes("--assume-cancelled");
  const invoiceFlag = args.indexOf("--invoice");
  const invoiceName = invoiceFlag >= 0 ? args[invoiceFlag + 1]?.trim() : null;
  const orderName = args.find(
    (a) => a !== "--invoice" && a !== "--assume-cancelled" && a !== invoiceName,
  )?.trim();

  if (!orderName && !invoiceName) {
    console.error("Usage: npx tsx scripts/recorrect-erp-order.ts <order-name> [--assume-cancelled]");
    console.error("   or: npx tsx scripts/recorrect-erp-order.ts --invoice <erp-invoice-name> [--assume-cancelled]");
    process.exit(1);
  }

  const rawUrl = process.env.DATABASE_URL ?? "";
  const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
  const prisma = new PrismaClient({
    datasources: { db: { url: directUrl || rawUrl } },
  });

  const order = await prisma.order.findFirst({
    where: invoiceName
      ? { erpnextInvoiceId: invoiceName }
      : { OR: [{ name: orderName }, { shopifyOrderId: orderName }, { erpnextInvoiceId: orderName }] },
    include: {
      companyLocation: { include: { erpnextInstance: true } },
      lineItems: { include: { productItem: true } },
    },
  });

  if (!order) {
    console.error("Order not found for", invoiceName ?? orderName);
    process.exit(1);
  }

  const poNo = order.name ?? order.shopifyOrderId;
  const before = {
    orderId: order.id,
    name: order.name,
    erpnextInvoiceId: order.erpnextInvoiceId,
    totalPrice: order.totalPrice.toString(),
  };

  if (!assumeCancelled) {
    console.log("[recorrect] Attempting ERP API cancel for po_no:", poNo);
    try {
      await cancelErpnextSalesInvoice(poNo, order.companyLocation);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        "[recorrect] ERP API cancel failed. Cancel the invoice in ERPNext UI, then re-run with --assume-cancelled.\n",
        msg.slice(0, 400),
      );
      process.exit(1);
    }
  } else {
    console.log("[recorrect] Skipping API cancel (--assume-cancelled).");
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      erpnextInvoiceId: null,
      ...ERP_SYNC_SUCCESS_CLEAR,
      ...(assumeCancelled ? restoreOrderStatusAfterManualSiCancel(order) : {}),
    },
  });

  const parsed = shopifyOrderWebhookSchema.safeParse(order.rawPayload);
  if (!parsed.success) {
    console.error("[recorrect] rawPayload is not a valid Shopify order — cannot re-sync");
    process.exit(1);
  }

  console.log("[recorrect] Re-syncing order to ERP with updated coupon mapping...");
  await syncOrderToERPNext(order, order.companyLocation, parsed.data, {
    forceNewInvoice: assumeCancelled,
  });

  const after = await prisma.order.findUnique({
    where: { id: order.id },
    select: { erpnextInvoiceId: true, erpnextSyncError: true },
  });

  console.log(JSON.stringify({ before, after }, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
