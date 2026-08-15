const { PrismaClient } = require("@prisma/client");
const raw = process.env.DATABASE_URL || "";
const prisma = new PrismaClient({
  datasources: { db: { url: raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw } },
});
const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";

async function main() {
  const rows = await prisma.contactMaster.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { name: { contains: "Bimsara", mode: "insensitive" } },
        { phoneNumber: { contains: "770271960" } },
        { phones: { some: { phoneNumber: { contains: "770271960" } } } },
        { email: { contains: "bimsara", mode: "insensitive" } },
        { email: { contains: "salithmadubashna", mode: "insensitive" } },
        { id: "cmpauwr080007l804xac1njw5" },
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
      phones: { select: { phoneNumber: true, isPrimary: true } },
      emails: { select: { email: true } },
    },
  });
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
