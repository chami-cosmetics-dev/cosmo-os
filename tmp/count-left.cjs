const { PrismaClient } = require("@prisma/client");
const raw = process.env.DATABASE_URL || "";
const prisma = new PrismaClient({
  datasources: { db: { url: raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw } },
});
const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";

async function main() {
  const emailNoPhone = await prisma.contactMaster.count({
    where: {
      companyId: COMPANY_ID,
      AND: [{ OR: [{ phoneNumber: null }, { phoneNumber: "" }] }, { OR: [{ email: { not: null } }, { emails: { some: {} } }] }],
      phones: { none: {} },
    },
  });
  const stripped = await prisma.contactMaster.count({
    where: {
      companyId: COMPANY_ID,
      AND: [{ OR: [{ phoneNumber: null }, { phoneNumber: "" }] }, { OR: [{ email: null }, { email: "" }] }],
      phones: { none: {} },
      emails: { none: {} },
    },
  });
  console.log(JSON.stringify({ emailNoPhone, strippedNoIds: stripped }, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
