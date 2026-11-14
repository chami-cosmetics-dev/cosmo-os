const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: (process.env.DATABASE_URL || "").replace(
        /(ep-[^.]+)-pooler(\.[^/]+)/,
        "$1$2"
      ),
    },
  },
});

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const DIMANTHA_ID = "cmpl4bqnz003tla04zpnq63lb";
const TARGET = 127000;
const PHONES = ["+94763520381", "0763520381", "94763520381", "763520381"];

async function main() {
  const contact = await prisma.contactMaster.findUnique({
    where: { id: DIMANTHA_ID },
    select: {
      name: true,
      phoneNumber: true,
      purchaseOrderCount: true,
      purchaseTotalValue: true,
    },
  });

  const adapt = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId: COMPANY_ID, contactId: DIMANTHA_ID },
    select: {
      salesInvoiceNo: true,
      invoiceDate: true,
      ttlAmount: true,
      locationName: true,
      merchantKnownName: true,
      adaptCustomerMasterId: true,
      origin: true,
    },
    orderBy: { invoiceDate: "asc" },
  });

  const orders = await prisma.order.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { customerPhone: { in: PHONES } },
        { erpnextCustomerId: "0763520381" },
      ],
    },
    select: {
      name: true,
      orderNumber: true,
      customerPhone: true,
      customerEmail: true,
      totalPrice: true,
      createdAt: true,
      sourceName: true,
      erpnextCustomerId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const rows = [
    ...adapt.map((r) => ({
      source: "adapt",
      invoice: r.salesInvoiceNo,
      date: r.invoiceDate,
      amount: Number(r.ttlAmount),
      location: r.locationName,
      merchant: r.merchantKnownName,
      adaptCustomerMasterId: r.adaptCustomerMasterId,
      phone: null,
      email: null,
    })),
    ...orders.map((r) => ({
      source: r.sourceName === "erpnext" ? "erpnext" : "shopify",
      invoice: r.name || r.orderNumber,
      date: r.createdAt,
      amount: Number(r.totalPrice),
      location: r.sourceName,
      merchant: null,
      adaptCustomerMasterId: null,
      phone: r.customerPhone,
      email: r.customerEmail,
    })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  let running = 0;
  const withRunning = rows.map((r) => {
    running += r.amount;
    return {
      ...r,
      running: Math.round(running * 100) / 100,
      overTarget: running > TARGET,
    };
  });

  const total = rows.reduce((a, r) => a + r.amount, 0);
  const extras = withRunning.filter((r) => r.overTarget);
  // extras includes the invoice that crossed 127k. Split: invoices after the one that crossed, plus leftover on the crossing row.
  let acc = 0;
  const extraRows = [];
  for (const r of withRunning) {
    const next = acc + r.amount;
    if (next <= TARGET) {
      acc = next;
      continue;
    }
    if (acc < TARGET) {
      extraRows.push({ ...r, extraAmount: Math.round((next - TARGET) * 100) / 100, note: "crosses 127k" });
    } else {
      extraRows.push({ ...r, extraAmount: r.amount, note: "fully extra" });
    }
    acc = next;
  }

  const byAdaptId = {};
  for (const r of rows.filter((x) => x.source === "adapt")) {
    const id = r.adaptCustomerMasterId || "(none)";
    if (!byAdaptId[id]) byAdaptId[id] = { n: 0, sum: 0, invoices: [] };
    byAdaptId[id].n += 1;
    byAdaptId[id].sum += r.amount;
    byAdaptId[id].invoices.push(r.invoice);
  }

  console.log(
    JSON.stringify(
      {
        contact,
        target: TARGET,
        cardTotal: Math.round(total * 100) / 100,
        extraVsTarget: Math.round((total - TARGET) * 100) / 100,
        all: withRunning,
        extras: extraRows,
        byAdaptId,
      },
      null,
      2
    )
  );
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
