import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const locs = await p.companyLocation.findMany({
  select: {
    name: true,
    shortName: true,
    erpnextCompany: true,
    supplierPrefix: true,
    manualInvoicePrefix: true,
    locationReference: true,
    isMainCompany: true,
    erpnextWarehouse: true,
  },
  orderBy: [{ erpnextCompany: "asc" }, { name: "asc" }],
});
console.log(JSON.stringify(locs, null, 2));
await p.$disconnect();
