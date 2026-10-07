import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });
const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";

async function main() {
  const sources = await prisma.order.groupBy({
    by: ["sourceName"],
    where: { companyId: COMPANY_ID },
    _count: { _all: true },
  });
  console.log("order sources", sources);

  let pickup = 0;
  let mer = 0;
  let promo = 0;
  let shipping = 0;
  let invoices = 0;
  let product = 0;
  let cursor;
  const pickupExamples = [];
  const merExamples = [];
  const promoExamples = [];

  for (;;) {
    const rows = await prisma.adaptPurchaseHistory.findMany({
      where: { companyId: COMPANY_ID },
      take: 800,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, lineItems: true },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    invoices += rows.length;
    for (const row of rows) {
      const items = Array.isArray(row.lineItems) ? row.lineItems : [];
      for (const item of items) {
        const name = String(item?.itemName ?? "").trim();
        const code = String(item?.itemCode ?? "").trim();
        const blob = `${code} ${name}`.toLowerCase();
        if (blob.includes("store pick")) {
          pickup += 1;
          if (pickupExamples.length < 5) pickupExamples.push({ code, name });
          continue;
        }
        if (code.toLowerCase() === "shipping" || /shipping|flat rate|bag fee/i.test(name)) {
          shipping += 1;
          continue;
        }
        if (/^mer\d+/i.test(code) || /^mer\d+/i.test(name.replace(/\s+/g, ""))) {
          mer += 1;
          if (merExamples.length < 8) merExamples.push({ code, name, price: item.unitPrice });
          continue;
        }
        if (/%\s*off|promotion|promo /i.test(name)) {
          promo += 1;
          if (promoExamples.length < 8) promoExamples.push({ code, name });
          continue;
        }
        product += 1;
      }
    }
    if (invoices % 40000 === 0) console.log("scanned", invoices);
  }
  console.log({ invoices, product, pickup, mer, promo, shipping, pickupExamples, merExamples, promoExamples });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
