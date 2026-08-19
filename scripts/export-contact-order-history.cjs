/**
 * Export contact phone + order history to CSV (Cosmo orders + Adapt purchases).
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/export-contact-order-history.cjs
 *   node scripts/with-env.mjs cosmo-prod node scripts/export-contact-order-history.cjs --out ./tmp/contact-order-history.csv
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = process.env.EXPORT_COMPANY_ID || "cmn2xcas1002crl5xtgoq28f5";
const BATCH = 5000;

const raw = process.env.DATABASE_URL || "";
const url = raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw;
const prisma = new PrismaClient({ datasources: { db: { url } } });

function parseArgs(argv) {
  const outIdx = argv.indexOf("--out");
  return {
    out:
      outIdx >= 0 && argv[outIdx + 1]
        ? path.resolve(argv[outIdx + 1])
        : path.resolve("tmp/contact-order-history.csv"),
  };
}

function formatDate(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function formatMoney(value) {
  if (value == null || value === "") return "";
  const n = typeof value === "object" && value !== null && "toString" in value ? value.toString() : String(value);
  return n;
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeRow(stream, cols) {
  stream.write(`${cols.map(csvEscape).join(",")}\n`);
}

async function exportCosmoOrders(stream) {
  let cursor = undefined;
  let count = 0;
  for (;;) {
    const rows = await prisma.order.findMany({
      where: { companyId: COMPANY_ID },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        name: true,
        orderNumber: true,
        customerPhone: true,
        totalPrice: true,
        totalShipping: true,
        createdAt: true,
        invoiceCompleteAt: true,
      },
    });
    if (!rows.length) break;
    for (const row of rows) {
      writeRow(stream, [
        row.customerPhone ?? "",
        row.name || row.orderNumber || row.id,
        formatMoney(row.totalPrice),
        formatMoney(row.totalShipping),
        formatDate(row.createdAt),
        formatDate(row.invoiceCompleteAt),
        "cosmo",
      ]);
      count += 1;
    }
    cursor = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }
  return count;
}

async function exportAdaptPurchases(stream) {
  let cursor = undefined;
  let count = 0;
  for (;;) {
    const rows = await prisma.adaptPurchaseHistory.findMany({
      where: { companyId: COMPANY_ID },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        salesInvoiceNo: true,
        ttlAmount: true,
        invoiceDate: true,
        contact: { select: { phoneNumber: true } },
      },
    });
    if (!rows.length) break;
    for (const row of rows) {
      writeRow(stream, [
        row.contact?.phoneNumber ?? "",
        row.salesInvoiceNo,
        formatMoney(row.ttlAmount),
        "",
        formatDate(row.invoiceDate),
        "",
        "adapt",
      ]);
      count += 1;
    }
    cursor = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }
  return count;
}

async function main() {
  const { out } = parseArgs(process.argv.slice(2));
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const stream = fs.createWriteStream(out, { encoding: "utf8" });
  writeRow(stream, [
    "contact_number",
    "order_id",
    "total_amount",
    "delivery_charges",
    "invoice_date",
    "complete_date",
    "source",
  ]);

  const cosmoCount = await exportCosmoOrders(stream);
  const adaptCount = await exportAdaptPurchases(stream);

  await new Promise((resolve, reject) => {
    stream.end(() => resolve());
    stream.on("error", reject);
  });

  const stat = fs.statSync(out);
  console.log(
    JSON.stringify(
      {
        file: out,
        bytes: stat.size,
        cosmoOrders: cosmoCount,
        adaptPurchases: adaptCount,
        totalRows: cosmoCount + adaptCount,
      },
      null,
      2,
    ),
  );
}

main()
  .finally(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
