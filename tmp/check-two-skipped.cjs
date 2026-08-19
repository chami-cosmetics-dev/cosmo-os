const { PrismaClient } = require("@prisma/client");
const raw = process.env.DATABASE_URL || "";
const prisma = new PrismaClient({
  datasources: { db: { url: raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw } },
});
const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";

function variants(phone) {
  const t = String(phone || "").trim();
  let d = t.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  const out = new Set([t, d].filter(Boolean));
  if (d.length === 10 && d.startsWith("0")) {
    out.add(d.slice(1));
    out.add(`94${d.slice(1)}`);
    out.add(`+94${d.slice(1)}`);
  }
  return [...out];
}

async function pack(phone, extraIds = []) {
  const phones = variants(phone);
  const contacts = await prisma.contactMaster.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { phoneNumber: { in: phones } },
        { phones: { some: { phoneNumber: { in: phones } } } },
        ...(extraIds.length ? [{ id: { in: extraIds } }] : []),
      ],
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      source: true,
      lastPurchaseAt: true,
      phones: { select: { phoneNumber: true } },
    },
  });
  const orders = await prisma.order.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { customerPhone: { in: phones } },
        { erpnextCustomerId: phone },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      customerPhone: true,
      customerEmail: true,
      erpnextInvoiceId: true,
      erpnextCustomerId: true,
      shopifyOrderId: true,
      totalPrice: true,
      createdAt: true,
      sourceName: true,
    },
  });
  const adapt = [];
  for (const c of contacts) {
    const rows = await prisma.adaptPurchaseHistory.findMany({
      where: { contactId: c.id, companyId: COMPANY_ID },
      orderBy: { invoiceDate: "desc" },
      take: 20,
      select: {
        salesInvoiceNo: true,
        invoiceDate: true,
        ttlAmount: true,
        contactId: true,
      },
    });
    adapt.push(...rows);
  }
  return { contacts, orders, adapt };
}

async function main() {
  const malisha = await pack("0701797374", [
    "cmplzwk1n001njy049q1ddujb",
    "cmseiad592dc9wcygs4nya7rg",
  ]);
  const byEmail = await prisma.contactMaster.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { email: { equals: "malishadealmeida@gmail.com", mode: "insensitive" } },
        { emails: { some: { email: { equals: "malishadealmeida@gmail.com", mode: "insensitive" } } } },
      ],
    },
    select: { id: true, name: true, phoneNumber: true, email: true },
  });
  const shane = await pack("0740332575", ["cmst1pscs0001wcn0k5vw8mw5"]);
  console.log(JSON.stringify({ malisha, malishaEmailContacts: byEmail, shane }, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
