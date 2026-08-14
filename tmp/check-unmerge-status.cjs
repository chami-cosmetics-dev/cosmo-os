/** Quick post-unmerge status for Cosmetics.lk */
const { PrismaClient } = require("@prisma/client");

async function main() {
  const companyId = process.argv[2] || "cmn2xcas1002crl5xtgoq28f5";
  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });
  try {
    const withSecondaryContacts = await prisma.contactMaster.count({
      where: { companyId, phones: { some: {} } },
    });
    const secondaryPhoneRows = await prisma.contactPhone.count({
      where: { contact: { companyId } },
    });
    const unmergePhoneContacts = await prisma.contactMaster.count({
      where: { companyId, source: "unmerge-phone" },
    });
    const hansanie = await prisma.contactMaster.findFirst({
      where: { companyId, id: "cms8vsg2w0123wc10n10m8fff" },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        phones: { select: { phoneNumber: true } },
      },
    });
    console.log(
      JSON.stringify(
        { withSecondaryContacts, secondaryPhoneRows, unmergePhoneContacts, hansanie },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
