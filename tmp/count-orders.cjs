const { PrismaClient } = require("@prisma/client");

const raw = process.env.DATABASE_URL || "";
const url = raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw;
const prisma = new PrismaClient({ datasources: { db: { url } } });
const companyId = "cmn2xcas1002crl5xtgoq28f5";

async function main() {
  const [orders, contacts] = await Promise.all([
    prisma.order.count({ where: { companyId } }),
    prisma.contactMaster.count({ where: { companyId } }),
  ]);
  console.log(JSON.stringify({ orders, contacts }, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
