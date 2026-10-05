import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });

function classifyLine(item) {
  const name = String(item?.itemName ?? "").trim();
  const code = String(item?.itemCode ?? "").trim();
  const lower = name.toLowerCase();
  if (lower.includes("store pick") || lower.includes("store pick-up") || lower.includes("store pick - up")) {
    return "shipping_pickup";
  }
  if (/^mer\d+/i.test(code) || /^mer\d+/i.test(name.replace(/\s+/g, ""))) return "coupon";
  if (/off\b|promo|promotion|discount|% off/i.test(name) && !code) return "promo";
  if (!code && /fee|delivery|shipping|pick/i.test(name)) return "fee";
  return "product";
}

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  console.log("companies", companies);

  const companyId = companies[0]?.id;
  if (!companyId) throw new Error("no company");

  const [adaptCount, orderCount, lineCount, minAdapt, maxAdapt, minOrder, maxOrder] = await Promise.all([
    prisma.adaptPurchaseHistory.count({ where: { companyId } }),
    prisma.order.count({ where: { companyId } }),
    prisma.orderLineItem.count({ where: { order: { companyId } } }),
    prisma.adaptPurchaseHistory.findFirst({
      where: { companyId },
      orderBy: { invoiceDate: "asc" },
      select: { invoiceDate: true, salesInvoiceNo: true },
    }),
    prisma.adaptPurchaseHistory.findFirst({
      where: { companyId },
      orderBy: { invoiceDate: "desc" },
      select: { invoiceDate: true, salesInvoiceNo: true },
    }),
    prisma.order.findFirst({
      where: { companyId },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, name: true, sourceName: true },
    }),
    prisma.order.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, name: true, sourceName: true },
    }),
  ]);

  const sources = await prisma.order.groupBy({
    by: ["sourceName"],
    where: { companyId },
    _count: { _all: true },
  });

  console.log({
    adaptCount,
    orderCount,
    lineCount,
    minAdapt,
    maxAdapt,
    minOrder,
    maxOrder,
    sources,
  });

  const sample = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId },
    take: 4000,
    orderBy: { invoiceDate: "desc" },
    select: { lineItems: true, ttlAmount: true },
  });

  const counts = { product: 0, coupon: 0, shipping_pickup: 0, promo: 0, fee: 0, other: 0, empty: 0 };
  const examples = { coupon: [], shipping_pickup: [], promo: [], fee: [] };
  let productRows = 0;
  for (const row of sample) {
    const items = Array.isArray(row.lineItems) ? row.lineItems : [];
    if (items.length === 0) counts.empty += 1;
    for (const item of items) {
      const kind = classifyLine(item);
      counts[kind] = (counts[kind] ?? 0) + 1;
      if (kind === "product") productRows += 1;
      if (examples[kind] && examples[kind].length < 8) {
        examples[kind].push({
          code: item.itemCode,
          name: item.itemName,
          price: item.unitPrice,
          qty: item.quantity,
        });
      }
    }
  }
  console.log({ sampleInvoices: sample.length, counts, productRows, examples });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
