import { PrismaClient } from "@prisma/client";

const ref = process.argv[2];
if (!ref?.trim()) {
  console.error("Usage: node scripts/reconcile-order-credit-note.mjs <invoice-name>");
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
  include: {
    companyLocation: {
      include: {
        erpnextInstance: {
          select: { baseUrl: true, apiKey: true, apiSecret: true },
        },
      },
    },
  },
});

if (!order?.companyLocation?.erpnextInstance) {
  console.error("Order or ERP instance not found");
  process.exit(1);
}

const invoiceName = order.erpnextInvoiceId ?? order.name ?? ref;
const { baseUrl, apiKey, apiSecret } = order.companyLocation.erpnextInstance;
const headers = { Authorization: `token ${apiKey}:${apiSecret}` };

const invoiceRes = await fetch(
  `${baseUrl.replace(/\/$/, "")}/api/resource/Sales Invoice/${encodeURIComponent(invoiceName)}`,
  { headers }
);
if (!invoiceRes.ok) {
  console.error("Failed to load ERP invoice", invoiceRes.status, await invoiceRes.text());
  process.exit(1);
}
const invoice = (await invoiceRes.json()).data;

const filters = encodeURIComponent(
  JSON.stringify([["return_against", "=", invoiceName]])
);
const fields = encodeURIComponent(
  JSON.stringify(["name", "docstatus", "is_return", "return_against", "grand_total"])
);
const returnsRes = await fetch(
  `${baseUrl.replace(/\/$/, "")}/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&limit_page_length=5`,
  { headers }
);
const creditNotes = returnsRes.ok ? (await returnsRes.json()).data : [];

const hasCreditNote =
  invoice.status === "Credit Note Issued" ||
  invoice.docstatus === 2 ||
  creditNotes.some((cn) => cn.docstatus === 1 || cn.docstatus === 2);

if (!hasCreditNote) {
  console.log(
    JSON.stringify(
      {
        updated: false,
        reason: "no_submitted_credit_note_in_erp",
        invoiceStatus: invoice.status,
        creditNotes,
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
  process.exit(0);
}

const updated = await prisma.order.update({
  where: { id: order.id },
  data: {
    fulfillmentStage: "returned",
    financialStatus: "voided",
    erpnextSyncError: null,
    erpnextSyncFailedAt: null,
    erpnextSyncNextAutoRetryAt: null,
    erpnextSyncAutoRetryCount: 0,
  },
  select: {
    id: true,
    name: true,
    financialStatus: true,
    fulfillmentStage: true,
  },
});

console.log(
  JSON.stringify(
    {
      updated: true,
      order: updated,
      erpInvoiceStatus: invoice.status,
      erpCreditNotes: creditNotes,
    },
    null,
    2
  )
);

await prisma.$disconnect();
