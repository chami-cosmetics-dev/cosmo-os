/**
 * READ-ONLY: List orders that are PAID in ERPNext (ERP_1 / ERP_2) but are still
 * NOT invoice complete in Vault OS.
 *
 * Usage:
 *   node scripts/with-env.mjs vault node scripts/list-erp-paid-not-invoice-complete.mjs
 *   node scripts/with-env.mjs vault node scripts/list-erp-paid-not-invoice-complete.mjs --from 2026-06-01
 *   node scripts/with-env.mjs vault node scripts/list-erp-paid-not-invoice-complete.mjs --json
 */
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const fromArg = (() => {
  const idx = args.indexOf("--from");
  return idx >= 0 ? args[idx + 1]?.trim() : undefined;
})();

const PLACEHOLDER_ERP_IDS = new Set(["pending", "pending_approval"]);
const ERP_CHUNK_SIZE = 50;

const rawUrl = process.env.DATABASE_URL ?? "";
const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
const prisma = new PrismaClient({ datasources: { db: { url: directUrl || rawUrl } } });

function resolveErpInvoiceRef(order) {
  const erpId = order.erpnextInvoiceId?.trim();
  if (erpId && !PLACEHOLDER_ERP_IDS.has(erpId.toLowerCase())) return erpId;
  const isErpOrigin = ["erpnext", "erpnext-pos"].includes(order.sourceName ?? "");
  const name = order.name?.trim();
  if (isErpOrigin && name && !PLACEHOLDER_ERP_IDS.has(name.toLowerCase())) return name;
  return null;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchErpInvoices(instance, invoiceNames) {
  const baseUrl = instance.baseUrl.replace(/\/$/, "");
  const headers = { Authorization: `token ${instance.apiKey}:${instance.apiSecret}` };
  const fields = JSON.stringify([
    "name",
    "status",
    "docstatus",
    "outstanding_amount",
    "grand_total",
    "posting_date",
    "is_return",
    "customer",
    "company",
  ]);

  const byName = new Map();
  for (const names of chunk(invoiceNames, ERP_CHUNK_SIZE)) {
    const filters = JSON.stringify([["name", "in", names]]);
    const url =
      `${baseUrl}/api/resource/Sales Invoice` +
      `?filters=${encodeURIComponent(filters)}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&limit_page_length=${names.length}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ERP GET failed [${res.status}] ${instance.label}: ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    for (const row of json.data ?? []) byName.set(row.name, row);
  }
  return byName;
}

function isPaidInErp(invoice) {
  return (
    invoice.docstatus === 1 &&
    invoice.is_return !== 1 &&
    Number(invoice.outstanding_amount ?? 0) <= 0 &&
    Number(invoice.grand_total ?? 0) > 0
  );
}

try {
  const instances = await prisma.erpnextInstance.findMany({
    select: { id: true, label: true, baseUrl: true, apiKey: true, apiSecret: true },
    orderBy: { label: "asc" },
  });

  const orders = await prisma.order.findMany({
    where: {
      invoiceCompleteAt: null,
      fulfillmentStage: { notIn: ["invoice_complete", "returned", "returned_to_store"] },
      financialStatus: { not: "voided" },
      ...(fromArg ? { createdAt: { gte: new Date(`${fromArg}T00:00:00.000Z`) } } : {}),
    },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      sourceName: true,
      erpnextInvoiceId: true,
      financialStatus: true,
      fulfillmentStage: true,
      totalPrice: true,
      currency: true,
      createdAt: true,
      customerPhone: true,
      paymentGatewayPrimary: true,
      companyLocation: { select: { name: true, erpnextInstanceId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const byInstance = new Map(instances.map((inst) => [inst.id, { instance: inst, orders: [] }]));
  let missingInstance = 0;
  let missingErpRef = 0;

  for (const order of orders) {
    const erpRef = resolveErpInvoiceRef(order);
    if (!erpRef) {
      missingErpRef += 1;
      continue;
    }
    const instanceId = order.companyLocation?.erpnextInstanceId;
    const bucket = instanceId ? byInstance.get(instanceId) : null;
    if (!bucket) {
      missingInstance += 1;
      continue;
    }
    bucket.orders.push({ order, erpRef });
  }

  const results = [];
  for (const { instance, orders: candidates } of byInstance.values()) {
    if (candidates.length === 0) continue;
    const erpInvoices = await fetchErpInvoices(
      instance,
      [...new Set(candidates.map((c) => c.erpRef))],
    );

    for (const { order, erpRef } of candidates) {
      const invoice = erpInvoices.get(erpRef);
      if (!invoice || !isPaidInErp(invoice)) continue;
      results.push({
        erpInstance: instance.label,
        erpInvoice: invoice.name,
        erpStatus: invoice.status,
        erpCompany: invoice.company,
        erpPostingDate: invoice.posting_date,
        erpGrandTotal: Number(invoice.grand_total ?? 0),
        vaultOrder: order.name ?? order.orderNumber ?? order.id,
        vaultStage: order.fulfillmentStage,
        vaultFinancialStatus: order.financialStatus,
        vaultTotal: order.totalPrice.toString(),
        currency: order.currency,
        source: order.sourceName,
        paymentMethod: order.paymentGatewayPrimary,
        location: order.companyLocation?.name ?? null,
        customerPhone: order.customerPhone,
        orderCreatedAt: order.createdAt.toISOString(),
        orderId: order.id,
      });
    }
  }

  results.sort((a, b) => a.erpPostingDate?.localeCompare(b.erpPostingDate ?? "") ?? 0);

  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(
      `Scanned ${orders.length} Vault order(s) not invoice complete` +
        (fromArg ? ` (created >= ${fromArg})` : "") +
        `; skipped ${missingErpRef} without ERP invoice ref, ${missingInstance} without ERP instance.\n`,
    );
    console.log(`PAID IN ERP BUT NOT INVOICE COMPLETE IN VAULT OS: ${results.length}\n`);
    for (const row of results) {
      console.log(
        [
          row.erpInstance,
          row.erpInvoice,
          `(${row.erpStatus})`,
          row.erpPostingDate,
          `${row.currency ?? ""} ${row.erpGrandTotal}`,
          `| Vault: ${row.vaultOrder}`,
          `stage=${row.vaultStage}`,
          `pay=${row.vaultFinancialStatus}`,
          `via=${row.paymentMethod ?? "-"}`,
          `loc=${row.location ?? "-"}`,
        ].join(" "),
      );
    }
  }
} finally {
  await prisma.$disconnect();
}
