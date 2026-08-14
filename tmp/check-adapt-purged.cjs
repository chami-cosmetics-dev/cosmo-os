const { PrismaClient } = require("@prisma/client");

async function main() {
  const companyId = "cmn2xcas1002crl5xtgoq28f5";
  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });
  try {
    const adaptHistoryRemaining = await prisma.adaptPurchaseHistory.count({
      where: { companyId },
    });
    const withSecondary = await prisma.contactMaster.count({
      where: { companyId, phones: { some: {} } },
    });
    console.log(JSON.stringify({ adaptHistoryRemaining, withSecondary }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
