import { PrismaClient } from "@prisma/client";

const ref = process.argv[2] ?? "SV100-0159";
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

const { baseUrl, apiKey, apiSecret } = order.companyLocation.erpnextInstance;
const headers = { Authorization: `token ${apiKey}:${apiSecret}` };

async function getDoc(name) {
  const res = await fetch(
    `${baseUrl.replace(/\/$/, "")}/api/resource/Sales Invoice/${encodeURIComponent(name)}`,
    { headers }
  );
  if (!res.ok) {
    return { error: res.status, body: await res.text() };
  }
  return (await res.json()).data;
}

async function listReturns() {
  const filters = encodeURIComponent(
    JSON.stringify([["return_against", "=", ref]])
  );
  const fields = encodeURIComponent(
    JSON.stringify([
      "name",
      "docstatus",
      "is_return",
      "return_against",
      "grand_total",
      "status",
      "modified",
    ])
  );
  const res = await fetch(
    `${baseUrl.replace(/\/$/, "")}/api/resource/Sales Invoice?filters=${filters}&fields=${fields}&limit_page_length=20`,
    { headers }
  );
  if (!res.ok) {
    return { error: res.status, body: await res.text() };
  }
  return (await res.json()).data;
}

const [invoice, returns] = await Promise.all([getDoc(ref), listReturns()]);

console.log(
  JSON.stringify(
    {
      vaultOrder: {
        id: order.id,
        name: order.name,
        financialStatus: order.financialStatus,
        fulfillmentStage: order.fulfillmentStage,
        erpnextInvoiceId: order.erpnextInvoiceId,
      },
      erpInvoice: invoice,
      erpCreditNotes: returns,
    },
    null,
    2
  )
);

await prisma.$disconnect();
