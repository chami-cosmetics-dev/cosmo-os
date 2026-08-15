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

async function main() {
  const variants = [
    "0772014176",
    "772014176",
    "+94772014176",
    "94772014176",
  ];
  const byPhone = await prisma.contactMaster.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { phoneNumber: { in: variants } },
        { name: { contains: "Anjali Wijesinghe", mode: "insensitive" } },
        { email: { contains: "shavindya99", mode: "insensitive" } },
        { emails: { some: { email: { contains: "shavindya99", mode: "insensitive" } } } },
        { phones: { some: { phoneNumber: { in: variants } } } },
      ],
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      source: true,
      lastPurchaseAt: true,
      createdAt: true,
      emails: { select: { email: true } },
      phones: { select: { phoneNumber: true } },
      _count: { select: { adaptPurchases: true } },
    },
  });

  const merged = {
    emailId: "cmpiepf700027l804amag90vl",
    phoneId: "cmst1iv6t00h5wc045tbe7yyh",
  };
  const pair = await prisma.contactMaster.findMany({
    where: { id: { in: [merged.emailId, merged.phoneId] } },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      source: true,
      createdAt: true,
      emails: { select: { email: true } },
      phones: { select: { phoneNumber: true } },
    },
  });

  console.log(JSON.stringify({ byPhone, pair }, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
