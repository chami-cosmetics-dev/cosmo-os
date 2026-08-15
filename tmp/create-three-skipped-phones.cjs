const { PrismaClient } = require("@prisma/client");
const raw = process.env.DATABASE_URL || "";
const prisma = new PrismaClient({
  datasources: { db: { url: raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw } },
});
const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";

async function main() {
  const malishaBlank = await prisma.contactMaster.findUnique({
    where: { id: "cmplzwk1n001njy049q1ddujb" },
    select: { id: true, name: true, phoneNumber: true, email: true },
  });
  const shaneExisting = await prisma.contactMaster.findFirst({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { phoneNumber: "0740332575" },
        { phones: { some: { phoneNumber: "0740332575" } } },
      ],
    },
    select: { id: true, name: true, phoneNumber: true },
  });
  const aysha = await prisma.contactMaster.findFirst({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { phoneNumber: "0778682788" },
        { phones: { some: { phoneNumber: "0778682788" } } },
      ],
    },
    select: { id: true, name: true, phoneNumber: true, email: true, source: true },
  });

  const result = { malisha: null, shane: null, aysha: aysha };

  if (malishaBlank && !malishaBlank.phoneNumber) {
    result.malisha = await prisma.contactMaster.update({
      where: { id: malishaBlank.id },
      data: { phoneNumber: "0701797374" },
      select: { id: true, name: true, phoneNumber: true, email: true },
    });
  } else {
    result.malisha = { skipped: true, existing: malishaBlank };
  }

  if (!shaneExisting) {
    result.shane = await prisma.contactMaster.create({
      data: {
        companyId: COMPANY_ID,
        name: "Ms Shane",
        phoneNumber: "0740332575",
        email: null,
        source: "erp1",
      },
      select: { id: true, name: true, phoneNumber: true, email: true, source: true },
    });
  } else {
    result.shane = { skipped: true, existing: shaneExisting };
  }

  console.log(JSON.stringify(result, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
