import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const p = new PrismaClient();

async function main() {
  const skus = ["BOJ04_1", "BOJ04_2"];
  const out: Record<string, unknown> = {};

  // Try common item tables
  try {
    out.items = await p.item.findMany({
      where: { sku: { in: skus } },
      select: {
        id: true,
        companyId: true,
        sku: true,
        name: true,
        barcode: true,
      },
    });
  } catch (e) {
    out.itemsError = String(e);
  }

  try {
    out.byBarcode = await p.item.findMany({
      where: {
        OR: [{ sku: { in: skus } }, { barcode: { not: null } }],
      },
      take: 5,
    });
  } catch (e) {
    out.byBarcodeError = String(e);
  }

  writeFileSync("tmp/boj04-check.json", JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    writeFileSync("tmp/boj04-check-err.txt", String(e.stack || e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });
