const { PrismaClient } = require("@prisma/client");
const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
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

function variants(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  const out = new Set([raw, d]);
  if (d.startsWith("0") && d.length === 10) {
    out.add(d.slice(1));
    out.add(`94${d.slice(1)}`);
    out.add(`+94${d.slice(1)}`);
  }
  return [...out].filter(Boolean);
}

async function dumpPhone(phone) {
  const phones = variants(phone);
  const contacts = await prisma.contactMaster.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { phoneNumber: { in: phones } },
        { phones: { some: { phoneNumber: { in: phones } } } },
      ],
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      source: true,
      lastPurchaseAt: true,
      emails: { select: { email: true } },
      phones: { select: { phoneNumber: true } },
      _count: { select: { adaptPurchases: true } },
    },
  });
  const extraPhones = await prisma.contactPhone.findMany({
    where: { phoneNumber: { in: phones } },
    select: {
      phoneNumber: true,
      contact: {
        select: {
          id: true,
          companyId: true,
          name: true,
          phoneNumber: true,
          email: true,
        },
      },
    },
  });
  const orders = await prisma.order.findMany({
    where: { companyId: COMPANY_ID, customerPhone: { in: phones } },
    select: {
      id: true,
      orderNumber: true,
      name: true,
      customerPhone: true,
      customerEmail: true,
      createdAt: true,
      totalPrice: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const orderCount = await prisma.order.count({
    where: { companyId: COMPANY_ID, customerPhone: { in: phones } },
  });
  return {
    phone,
    contacts: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phoneNumber,
      email: c.email,
      extraEmails: c.emails.map((e) => e.email),
      extraPhones: c.phones.map((p) => p.phoneNumber),
      source: c.source,
      lastPurchaseAt: c.lastPurchaseAt,
      adapt: c._count.adaptPurchases,
    })),
    extraPhoneHits: extraPhones
      .filter((r) => r.contact.companyId === COMPANY_ID)
      .map((r) => ({
        extra: r.phoneNumber,
        id: r.contact.id,
        name: r.contact.name,
        primary: r.contact.phoneNumber,
        email: r.contact.email,
      })),
    orderCount,
    orderSamples: orders.map((o) => ({
      orderNumber: o.orderNumber || o.name,
      phone: o.customerPhone,
      email: o.customerEmail,
      createdAt: o.createdAt,
      total: o.totalPrice,
    })),
  };
}

async function main() {
  const a = await dumpPhone("0123455555");
  const b = await dumpPhone("0123456780");
  const emailCounts = {};
  const emails = new Set();
  for (const pack of [a, b]) {
    for (const c of pack.contacts) {
      if (c.email) emails.add(c.email.toLowerCase());
      for (const e of c.extraEmails) emails.add(e.toLowerCase());
    }
    for (const o of pack.orderSamples) {
      if (o.email) emails.add(String(o.email).toLowerCase());
    }
  }
  for (const email of emails) {
    const n = await prisma.contactMaster.count({
      where: { companyId: COMPANY_ID, email: { equals: email, mode: "insensitive" } },
    });
    emailCounts[email] = n;
  }
  console.log(JSON.stringify({ a, b, emailReuse: emailCounts }, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
