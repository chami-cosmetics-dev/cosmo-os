import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });
const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";

async function main() {
  const nameCounts = new Map();
  const codeCounts = new Map();
  let invoices = 0;
  let cursor = undefined;
  const maxInvoices = 30000;

  while (invoices < maxInvoices) {
    const rows = await prisma.adaptPurchaseHistory.findMany({
      where: { companyId: COMPANY_ID },
      take: 500,
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
        const looksProduct = /^[A-Z0-9]+[-_][A-Z0-9]+/i.test(code) || /\*[A-Z0-9]+$/i.test(code);
        if (looksProduct && code) continue;
        const key = `${code || "(blank)"} | ${name || "(blank)"}`;
        nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
        if (code) codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
      }
    }
  }

  const top = [...nameCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60);
  console.log("invoices scanned", invoices);
  console.log("distinct non-sku-like lines", nameCounts.size);
  for (const [k, n] of top) console.log(String(n).padStart(6), k);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
