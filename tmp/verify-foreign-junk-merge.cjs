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

async function main() {
  const keep = await prisma.contactMaster.findUnique({
    where: { id: "cmp0r74ye00g7l604iuo7l6g0" },
    select: {
      name: true,
      phoneNumber: true,
      email: true,
      _count: { select: { adaptPurchases: true } },
    },
  });
  const leftover6780 = await prisma.order.count({
    where: { companyId: COMPANY_ID, customerPhone: { in: ["0123456780", "123456780", "+94123456780", "94123456780"] } },
  });
  const live6780 = await prisma.contactMaster.count({
    where: { companyId: COMPANY_ID, phoneNumber: { in: ["0123456780", "123456780", "+94123456780"] } },
  });
  const on5555 = await prisma.order.count({
    where: { companyId: COMPANY_ID, customerPhone: "0123455555" },
  });
  const live5555 = await prisma.contactMaster.findMany({
    where: { companyId: COMPANY_ID, phoneNumber: { in: ["0123455555", "+94123455555"] } },
    select: { id: true, name: true, phoneNumber: true, email: true },
  });
  console.log(JSON.stringify({ keep, leftover6780, live6780, on5555, live5555 }, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
