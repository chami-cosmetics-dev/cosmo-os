import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "tmp", "full-history-export", "adapt-invoice-contacts.csv");
const prisma = new PrismaClient({ log: ["error"] });

function csvCell(value: string) {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function main() {
  await mkdir(dirname(OUT), { recursive: true });
  const stream = createWriteStream(OUT);
  stream.write("invoice_no,contact_id,customer_name,phone\n");
  let cursor: string | undefined;
  let n = 0;
  for (;;) {
    const rows = await prisma.adaptPurchaseHistory.findMany({
      where: { companyId: COMPANY_ID },
      take: 1000,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        salesInvoiceNo: true,
        contactId: true,
        contact: { select: { name: true, phoneNumber: true } },
      },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;
    for (const row of rows) {
      n += 1;
      stream.write(
        `${csvCell(row.salesInvoiceNo)},${csvCell(row.contactId)},${csvCell(row.contact.name)},${csvCell(row.contact.phoneNumber ?? "")}\n`,
      );
    }
    if (n % 20000 === 0) console.error(`exported ${n}`);
    if (rows.length < 1000) break;
  }
  await new Promise<void>((resolvePromise, reject) => {
    stream.end(() => resolvePromise());
    stream.on("error", reject);
  });
  console.error(`done ${n} -> ${OUT}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
