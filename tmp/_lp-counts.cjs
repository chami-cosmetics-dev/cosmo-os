const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL || "" } } });
const companyId = "cmn2xcas1002crl5xtgoq28f5";
(async () => {
  const [orders, adapt, contacts] = await Promise.all([
    prisma.order.count({ where: { companyId } }),
    prisma.adaptPurchaseHistory.count({ where: { companyId } }),
    prisma.contactMaster.count({ where: { companyId } }),
  ]);
  console.log(JSON.stringify({ orders, adapt, contacts }, null, 2));
  // financialStatus is nullable: does Prisma's NOT keep NULL rows?
  const nullFin = await prisma.order.count({ where: { companyId, financialStatus: null } });
  const nullFinSurviving = await prisma.order.count({
    where: { companyId, financialStatus: null, NOT: { financialStatus: "voided" } },
  });
  console.log("orders with NULL financialStatus:", nullFin);
  console.log("of those, surviving NOT financialStatus=voided:", nullFinSurviving);
})().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
