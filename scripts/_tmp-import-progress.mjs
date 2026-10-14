import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const rows = await prisma.adaptPurchaseHistory.count({
  where: { origin: "vault_supplement_import" },
});
const contacts = await prisma.contactMaster.count({
  where: { source: "vault-supplement-import" },
});
console.log(JSON.stringify({ supplementHistoryRows: rows, supplementContacts: contacts }));
await prisma.$disconnect();
