/**
 * Find ERP return SIs where the original invoice was NOT credit-noted but Vault OS
 * still has the order active.
 *
 * Usage:
 *   node scripts/with-env.mjs vault npx tsx scripts/find-erp-return-si-mismatches.ts
 *   node scripts/with-env.mjs vault npx tsx scripts/find-erp-return-si-mismatches.ts --mode erp
 *   node scripts/with-env.mjs vault npx tsx scripts/find-erp-return-si-mismatches.ts --invoice SV100-0253
 *   node scripts/with-env.mjs vault npx tsx scripts/find-erp-return-si-mismatches.ts --fix
 */

import { PrismaClient } from "@prisma/client";

import { reconcileOrderErpCreditNote } from "../lib/erp-credit-note-order-sync";
import {
  findErpReturnSiMismatchesFromErpReturns,
  findErpReturnSiMismatchesFromVaultOrders,
  inspectErpReturnSiMismatch,
} from "../lib/find-erp-return-si-mismatches";

const args = process.argv.slice(2);
const mode = args.includes("--mode")
  ? args[args.indexOf("--mode") + 1] ?? "vault"
  : "vault";
const invoiceArg = args.includes("--invoice")
  ? args[args.indexOf("--invoice") + 1]
  : null;
const shouldFix = args.includes("--fix");
const limitArg = args.includes("--limit")
  ? Number.parseInt(args[args.indexOf("--limit") + 1] ?? "40", 10)
  : 40;
const limit = Number.isFinite(limitArg) ? limitArg : 40;

const rawUrl = process.env.DATABASE_URL ?? "";
const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
const prisma = new PrismaClient({
  datasources: { db: { url: directUrl || rawUrl } },
});

function printRows(rows: Awaited<ReturnType<typeof findErpReturnSiMismatchesFromVaultOrders>>) {
  if (rows.length === 0) {
    console.log("No mismatches found.");
    return;
  }

  console.log(`Found ${rows.length} mismatch(es):\n`);
  for (const row of rows) {
    console.log(
      [
        `pattern: ${row.pattern}`,
        `original SI: ${row.originalInvoiceName} (ERP status: ${row.originalErpStatus ?? "?"}, docstatus: ${row.originalErpDocstatus ?? "?"})`,
        `return SIs: ${row.returnInvoiceNames.join(", ") || "(none)"}`,
        row.vaultOrder
          ? `Vault order: ${row.vaultOrder.name ?? row.vaultOrder.id} | ${row.vaultOrder.financialStatus} | ${row.vaultOrder.fulfillmentStage}`
          : "Vault order: (not found)",
      ].join("\n  "),
    );
    console.log("");
  }
}

async function main() {
  if (invoiceArg) {
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { name: invoiceArg },
          { erpnextInvoiceId: invoiceArg },
          { shopifyOrderId: invoiceArg },
          { shopifyOrderId: `erp-${invoiceArg}` },
        ],
      },
      select: {
        id: true,
        name: true,
        erpnextInvoiceId: true,
        financialStatus: true,
        fulfillmentStage: true,
        companyLocation: {
          select: {
            erpnextInstance: {
              select: { baseUrl: true, apiKey: true, apiSecret: true },
            },
          },
        },
      },
    });

    const instance = order?.companyLocation?.erpnextInstance;
    if (!instance) {
      throw new Error(`No Vault order / ERP instance for invoice ${invoiceArg}`);
    }

    const result = await inspectErpReturnSiMismatch(
      {
        baseUrl: instance.baseUrl,
        apiKey: instance.apiKey,
        apiSecret: instance.apiSecret,
      },
      invoiceArg,
      order,
    );

    if (!result) {
      console.log(`No return-SI mismatch for ${invoiceArg}.`);
      return;
    }

    printRows([result]);

    if (shouldFix && order) {
      const fixed = await reconcileOrderErpCreditNote(order.id);
      console.log("Fix result:", fixed);
    }
    return;
  }

  if (mode === "erp") {
    const instance = await prisma.erpnextInstance.findFirst({
      select: { baseUrl: true, apiKey: true, apiSecret: true },
    });
    if (!instance) {
      throw new Error("No ERPNext instance configured.");
    }

    const rows = await findErpReturnSiMismatchesFromErpReturns(
      {
        baseUrl: instance.baseUrl,
        apiKey: instance.apiKey,
        apiSecret: instance.apiSecret,
      },
      {
        limit,
        pattern: "return_si_original_not_credit_noted_os_active",
      },
    );
    printRows(rows);

    if (shouldFix) {
      for (const row of rows) {
        if (!row.vaultOrder?.id) continue;
        const fixed = await reconcileOrderErpCreditNote(row.vaultOrder.id);
        console.log(`Fixed ${row.originalInvoiceName}:`, fixed);
      }
    }
    return;
  }

  const rows = await findErpReturnSiMismatchesFromVaultOrders({
    limit,
    pattern: "return_si_original_not_credit_noted_os_active",
  });
  printRows(rows);

  if (shouldFix) {
    for (const row of rows) {
      if (!row.vaultOrder?.id) continue;
      const fixed = await reconcileOrderErpCreditNote(row.vaultOrder.id);
      console.log(`Fixed ${row.originalInvoiceName}:`, fixed);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
