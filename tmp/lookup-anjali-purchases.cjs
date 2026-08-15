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
const ID = "cmst1iv6t00h5wc045tbe7yyh";
const EMAIL = "shavindya99@gmail.com";
const PHONE = "0772014176";

async function main() {
  const contact = await prisma.contactMaster.findUnique({
    where: { id: ID },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      source: true,
      lastPurchaseAt: true,
      createdAt: true,
    },
  });

  const orders = await prisma.order.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { customerEmail: { equals: EMAIL, mode: "insensitive" } },
        { customerPhone: { contains: "772014176" } },
      ],
    },
    select: {
      name: true,
      orderNumber: true,
      sourceName: true,
      totalPrice: true,
      customerEmail: true,
      customerPhone: true,
      createdAt: true,
    },
    take: 20,
    orderBy: { createdAt: "desc" },
  });

  const adapt = await prisma.adaptPurchaseHistory.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { contactId: ID },
        { salesInvoiceNo: { contains: "0772014176" } },
      ],
    },
    select: {
      contactId: true,
      salesInvoiceNo: true,
      invoiceDate: true,
      ttlAmount: true,
      locationName: true,
    },
    take: 20,
  });

  console.log(JSON.stringify({ contact, orders, adapt }, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
