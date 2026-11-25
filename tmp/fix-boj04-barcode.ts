import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const APPLY = process.argv.includes("--apply");
const p = new PrismaClient();
const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const SKUS = ["BOJ04_1", "BOJ04_2"];

async function main() {
  const products = await p.productItem.findMany({
    where: { companyId: COMPANY_ID, sku: { in: SKUS } },
    select: {
      id: true,
      sku: true,
      barcode: true,
      productTitle: true,
      variantTitle: true,
      companyLocationId: true,
      shopifyVariantId: true,
    },
    orderBy: [{ sku: "asc" }, { companyLocationId: "asc" }],
  });

  const barcodes = [
    ...new Set(products.map((r) => (r.barcode ?? "").trim()).filter(Boolean)),
  ];

  const sameBarcodeOthers =
    barcodes.length > 0
      ? await p.productItem.findMany({
          where: {
            companyId: COMPANY_ID,
            barcode: { in: barcodes },
            sku: { notIn: SKUS },
          },
          select: { id: true, sku: true, barcode: true, productTitle: true },
          take: 20,
        })
      : [];

  const boj1 = products.filter((r) => r.sku === "BOJ04_1");
  const boj2 = products.filter((r) => r.sku === "BOJ04_2");
  const shared = barcodes.filter((b) => {
    const on1 = boj1.some((r) => (r.barcode ?? "").trim() === b);
    const on2 = boj2.some((r) => (r.barcode ?? "").trim() === b);
    return on1 && on2;
  });

  const toClear = boj2.filter((r) => {
    const b = (r.barcode ?? "").trim();
    return b && shared.includes(b);
  });

  const report = {
    apply: APPLY,
    boj1Count: boj1.length,
    boj2Count: boj2.length,
    sharedBarcodes: shared,
    boj1: boj1.map((r) => ({ id: r.id, barcode: r.barcode, title: r.productTitle })),
    boj2: boj2.map((r) => ({ id: r.id, barcode: r.barcode, title: r.productTitle })),
    toClear: toClear.map((r) => ({ id: r.id, sku: r.sku, barcode: r.barcode })),
    sameBarcodeOthers,
  };

  writeFileSync("tmp/boj04-fix.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (!APPLY) {
    console.log("Dry run. Pass --apply to clear barcode on BOJ04_2.");
    return;
  }

  if (toClear.length === 0) {
    console.log("Nothing to clear.");
    return;
  }

  const result = await p.productItem.updateMany({
    where: { id: { in: toClear.map((r) => r.id) } },
    data: { barcode: null },
  });
  console.log("UPDATED", result);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });
