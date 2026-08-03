import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const adapt = await prisma.adaptPurchaseHistory.count({
    where: { companyId: "cmn2xcas1002crl5xtgoq28f5" },
  });
  const contacts = await prisma.contactMaster.count({
    where: { companyId: "cmn2xcas1002crl5xtgoq28f5" },
  });
  const adaptSource = await prisma.contactMaster.count({
    where: { companyId: "cmn2xcas1002crl5xtgoq28f5", source: "adapt" },
  });
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      adaptPurchases: adapt,
      contacts,
      adaptSourceContacts: adaptSource,
    })
  );
} finally {
  await prisma.$disconnect();
}
