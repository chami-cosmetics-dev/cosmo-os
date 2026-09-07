/**
 * Mark Vault OS orders paid when the linked ERP Sales Invoice is already Paid.
 *
 * Shopify COD/Cash stays `pending` in Shopify, and order webhooks used to copy
 * that onto financialStatus even after ERP created a Payment Entry.
 *
 * Usage:
 *   node scripts/with-env.mjs vault npx tsx scripts/backfill-erp-paid-financial-status.ts
 *   node scripts/with-env.mjs vault npx tsx scripts/backfill-erp-paid-financial-status.ts --fix
 */

import { PrismaClient } from "@prisma/client";

import {
  linkedVaultOrderErpPaymentStatusPatch,
  resolveErpSalesInvoiceFinancialStatus,
} from "../lib/erp-sales-invoice-financial-status";

function isRealErpSalesInvoiceId(id: string | null | undefined) {
  const trimmed = id?.trim();
  return Boolean(trimmed) && trimmed !== "pending" && trimmed !== "pending_approval";
}

const shouldFix = process.argv.includes("--fix");
const BATCH = 50;

const rawUrl = process.env.DATABASE_URL ?? "";
const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
const dbUrl = new URL(directUrl || rawUrl);
dbUrl.searchParams.set("connect_timeout", "30");
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl.toString() } },
});

type ErpInvoiceRow = {
  name: string;
  status?: string | null;
  outstanding_amount?: number | null;
  grand_total?: number | null;
  paid_amount?: number | null;
  docstatus?: number | null;
};

async function fetchInvoices(
  baseUrl: string,
  apiKey: string,
  apiSecret: string,
  names: string[],
): Promise<ErpInvoiceRow[]> {
  if (names.length === 0) return [];
  const fields = encodeURIComponent(
    JSON.stringify(["name", "status", "outstanding_amount", "grand_total", "paid_amount", "docstatus"]),
  );
  const filters = encodeURIComponent(JSON.stringify([["name", "in", names]]));
  const url = `${baseUrl.replace(/\/$/, "")}/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&limit=${names.length}`;
  const res = await fetch(url, {
    headers: { Authorization: `token ${apiKey}:${apiSecret}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ERP SI list [${res.status}]: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: ErpInvoiceRow[] };
  return json.data ?? [];
}

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      cancelledAt: null,
      erpnextInvoiceId: { not: null },
      OR: [
        { financialStatus: null },
        { financialStatus: { equals: "pending", mode: "insensitive" } },
        { financialStatus: { equals: "authorized", mode: "insensitive" } },
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
            select: {
              id: true,
              label: true,
              baseUrl: true,
              apiKey: true,
              apiSecret: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const eligible = orders.filter((order) => isRealErpSalesInvoiceId(order.erpnextInvoiceId));
  console.log(
    `Pending/authorized orders with SI: ${eligible.length} (dry-run=${!shouldFix})`,
  );

  const byInstance = new Map<
    string,
    {
      baseUrl: string;
      apiKey: string;
      apiSecret: string;
      label: string;
      orders: typeof eligible;
    }
  >();
  for (const order of eligible) {
    const instance = order.companyLocation.erpnextInstance;
    if (!instance?.baseUrl || !instance.apiKey || !instance.apiSecret) continue;
    const group = byInstance.get(instance.id) ?? {
      baseUrl: instance.baseUrl,
      apiKey: instance.apiKey,
      apiSecret: instance.apiSecret,
      label: instance.label,
      orders: [],
    };
    group.orders.push(order);
    byInstance.set(instance.id, group);
  }

  let marked = 0;
  let skipped = 0;
  let missing = 0;

  for (const group of byInstance.values()) {
    console.log(`${group.label}: ${group.orders.length} pending SI-linked orders`);
    for (let i = 0; i < group.orders.length; i += BATCH) {
      const batch = group.orders.slice(i, i + BATCH);
      const invoiceNames = [
        ...new Set(batch.map((order) => order.erpnextInvoiceId).filter((name): name is string => Boolean(name))),
      ];
      const invoices = await fetchInvoices(
        group.baseUrl,
        group.apiKey,
        group.apiSecret,
        invoiceNames,
      );
      const byName = new Map(invoices.map((invoice) => [invoice.name, invoice]));

      for (const order of batch) {
        const invoice = order.erpnextInvoiceId ? byName.get(order.erpnextInvoiceId) : undefined;
        if (!invoice) {
          missing += 1;
          continue;
        }
        const erpStatus = resolveErpSalesInvoiceFinancialStatus({
          docstatus: invoice.docstatus,
          isPos: false,
          status: invoice.status,
          outstandingAmount: invoice.outstanding_amount,
          grandTotal: invoice.grand_total,
          paidAmount: invoice.paid_amount,
        });
        const patch = linkedVaultOrderErpPaymentStatusPatch({
          currentStatus: order.financialStatus,
          erpFinancialStatus: erpStatus,
        });
        if (!("financialStatus" in patch) || patch.financialStatus !== "paid") {
          skipped += 1;
          continue;
        }
        marked += 1;
        console.log(
          `${shouldFix ? "PAY" : "would-pay"} ${order.name ?? order.id} ${order.erpnextInvoiceId} (${order.fulfillmentStage})`,
        );
        if (shouldFix) {
          await prisma.order.update({
            where: { id: order.id },
            data: { financialStatus: "paid" },
          });
        }
      }
    }
  }

  console.log(
    JSON.stringify({ dryRun: !shouldFix, candidates: eligible.length, marked, skipped, missing }),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
