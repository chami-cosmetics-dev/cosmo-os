import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: ".env.vault", override: true });
const prisma = new PrismaClient();
const rows = await prisma.$queryRaw`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'CompanyLocation'
    AND column_name IN ('citypakAccountId', 'citypakApiToken')
  ORDER BY column_name
`;
const locations = await prisma.companyLocation.findMany({
  select: { name: true, citypakAccountId: true, citypakApiToken: true },
  orderBy: { name: "asc" },
});
const accounts = await prisma.citypakAccount.findMany({
  select: { label: true, accountId: true, invoicePrefix: true },
  orderBy: { invoicePrefix: "asc" },
});
console.log("COLUMNS", JSON.stringify(rows));
console.log(
  "LOCATIONS",
  JSON.stringify(
    locations.map((row) => ({
      name: row.name,
      citypakAccountId: row.citypakAccountId,
      hasToken: Boolean(row.citypakApiToken),
    })),
    null,
    2
  )
);
console.log("PREFIX ACCOUNTS", JSON.stringify(accounts, null, 2));
await prisma.$disconnect();
