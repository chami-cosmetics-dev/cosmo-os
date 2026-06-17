/**
 * READ-ONLY: List Shopify-origin orders that exist in Vault OS but have no real
 * ERPNext Sales Invoice (erpnextInvoiceId is null / pending / pending_approval).
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/list-shopify-orders-missing-erp.mjs
 *   node scripts/with-env.mjs vault     node scripts/list-shopify-orders-missing-erp.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CUTOFF = new Date("2026-06-01T00:00:00.000Z");
const PLACEHOLDERS = ["pending", "pending_approval"];

function isErpOrigin(sourceName) {
  return (sourceName ?? "").toLowerCase().startsWith("erpnext");
}

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      OR: [{ erpnextInvoiceId: null }, { erpnextInvoiceId: { in: PLACEHOLDERS } }],
    },
    select: {
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      sourceName: true,
      financialStatus: true,
      fulfillmentStage: true,
      erpnextInvoiceId: true,
      createdAt: true,
      companyLocation: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const shopifyOrders = orders.filter((o) => !isErpOrigin(o.sourceName));

  const beforeCutoff = shopifyOrders.filter((o) => o.createdAt < CUTOFF);
  const afterCutoff = shopifyOrders.filter((o) => o.createdAt >= CUTOFF);

  const fmt = (o) =>
    [
      (o.name ?? o.orderNumber ?? o.shopifyOrderId).padEnd(12),
      o.createdAt.toISOString().slice(0, 16).replace("T", " "),
      (o.companyLocation?.name ?? "-").padEnd(20).slice(0, 20),
      (o.financialStatus ?? "-").padEnd(9),
      (o.fulfillmentStage ?? "-").padEnd(16),
      `erp=${o.erpnextInvoiceId ?? "null"}`,
    ].join("  ");

  console.log(`\n=== Shopify orders in Vault WITHOUT an ERP Sales Invoice ===`);
  console.log(`Total: ${shopifyOrders.length}  (cutoff = 2026-06-01)\n`);

  console.log(`--- ON/AFTER 2026-06-01 (eligible to recreate in ERP): ${afterCutoff.length} ---`);
  afterCutoff.forEach((o) => console.log("  " + fmt(o)));

  console.log(`\n--- BEFORE 2026-06-01 (should stay blocked): ${beforeCutoff.length} ---`);
  beforeCutoff.forEach((o) => console.log("  " + fmt(o)));

  console.log("");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
