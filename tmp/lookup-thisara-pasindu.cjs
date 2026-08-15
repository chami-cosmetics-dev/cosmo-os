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
const IDS = ["cmplzge220009jy0462109hub", "cmsf01lnb6pqdwcyglf5j9ocx"];

async function main() {
  const contacts = await prisma.contactMaster.findMany({
    where: { id: { in: IDS } },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      source: true,
      origin: true,
      customerType: true,
      lastPurchaseAt: true,
      createdAt: true,
      updatedAt: true,
      remarks: true,
      emails: { select: { email: true } },
      phones: { select: { phoneNumber: true } },
    },
  });

  const orders = await prisma.order.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { customerEmail: { equals: "thisarajayasinghe07@gmail.com", mode: "insensitive" } },
        { customerPhone: { contains: "0756975298" } },
        { customerPhone: { contains: "756975298" } },
      ],
    },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      sourceName: true,
      financialStatus: true,
      customerEmail: true,
      customerPhone: true,
      createdAt: true,
    },
    take: 20,
    orderBy: { createdAt: "desc" },
  });

  const adapt = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId: COMPANY_ID, contactId: { in: IDS } },
    select: {
      contactId: true,
      salesInvoiceNo: true,
      invoiceDate: true,
      ttlAmount: true,
      locationName: true,
      paymentMethod: true,
      adaptCustomerMasterId: true,
    },
    orderBy: { invoiceDate: "desc" },
  });

  console.log(
    JSON.stringify(
      { contacts, orders, adapt },
      (_, v) => (typeof v === "bigint" ? String(v) : v),
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
