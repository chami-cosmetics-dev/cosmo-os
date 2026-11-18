import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const SKUS = [
  "CERA58_1",
  "LOME01_1",
  "MAMA01_1",
  "MIG01_1",
  "MIG02_1",
  "OGX50_1",
  "OGX51_1",
  "TRES03_1",
  "TRES04_1",
  "TRES05_1",
  "TRES06_1",
  "TRES07_1",
  "TRES08_1",
  "TRES09_1",
];

async function main() {
  const result = await p.productItem.updateMany({
    where: { companyId: COMPANY_ID, sku: { in: SKUS } },
    data: {
      erp1TaxStatus: "Non Vat",
      erp2TaxStatus: "Non Vat",
    },
  });
  console.log(JSON.stringify({ updated: result.count, skus: SKUS.length }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });
