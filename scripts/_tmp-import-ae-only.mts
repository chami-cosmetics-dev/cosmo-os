import { readFileSync } from "node:fs";

import ExcelJS from "exceljs";

import { formatAppIsoDate } from "../lib/format-datetime";
import { prisma } from "../lib/prisma";
import { PURCHASE_HEADERS } from "../lib/vault-supplement-import/headers";
import { importSupplementPurchases } from "../lib/vault-supplement-import/import-run";
import { parsePurchasesWorkbook, type ParsedPurchaseLine } from "../lib/vault-supplement-import/parse-sheet";

const file = "C:/Users/Bad-Boy/Downloads/AE Sale history for VOS-13.10.2026.xlsx";

function storedLineKey(adaptInvoiceKey: string, itemCode: string): string | null {
  const prefix = "vsupp:";
  if (!adaptInvoiceKey.startsWith(prefix)) return null;
  const rest = adaptInvoiceKey.slice(prefix.length);
  const splitAt = rest.indexOf("|");
  if (splitAt < 0) return null;
  return `${rest.slice(0, splitAt)}\u0000${rest.slice(splitAt + 1)}\u0000${itemCode}`;
}

function lineKey(line: ParsedPurchaseLine): string {
  return `${line.sourceRef}\u0000${line.invoiceNo}\u0000${line.itemCode}`;
}

const company = await prisma.company.findFirst({
  where: { name: "SupplementVault.lk" },
  select: { id: true },
});
if (!company) throw new Error("SupplementVault.lk company was not found");

const existing = await prisma.adaptPurchaseHistory.findMany({
  where: { companyId: company.id, origin: "vault_supplement_import" },
  select: { adaptInvoiceKey: true, lineItems: true },
});
const stored = new Set<string>();
for (const row of existing) {
  if (!Array.isArray(row.lineItems)) continue;
  for (const item of row.lineItems) {
    if (!item || typeof item !== "object") continue;
    const itemCode = "itemCode" in item && typeof item.itemCode === "string" ? item.itemCode : "";
    if (!itemCode) continue;
    const key = storedLineKey(row.adaptInvoiceKey, itemCode);
    if (key) stored.add(key);
  }
}

const parsed = await parsePurchasesWorkbook(readFileSync(file));
if (!parsed.ok) throw new Error(parsed.error);
const missing = parsed.lines.filter((line) => !stored.has(lineKey(line)));
console.log(`AE parsed ${parsed.lines.length} rejected by parser ${parsed.rejected.length} missing ${missing.length}`);
if (missing.length === 0) {
  await prisma.$disconnect();
  process.exit(0);
}

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Purchases");
[...PURCHASE_HEADERS, "Status"].forEach((header, index) => {
  sheet.getCell(1, index + 1).value = header;
});
missing.forEach((line, index) => {
  const values = [
    line.customerName,
    line.phone ?? "",
    line.email ?? "",
    line.address ?? "",
    line.city ?? "",
    line.district ?? "",
    line.invoiceNo,
    formatAppIsoDate(line.invoiceDate),
    line.itemCode,
    line.itemName,
    line.quantity,
    line.unitPrice,
    line.lineAmount,
    line.currency,
    line.paymentMethod ?? "",
    line.location ?? "",
    line.merchant ?? "",
    line.sourceRef,
    line.financialStatus ?? "",
  ];
  values.forEach((value, column) => {
    sheet.getCell(index + 2, column + 1).value = value;
  });
});
const summary = await importSupplementPurchases({
  companyId: company.id,
  file: Buffer.from(await workbook.xlsx.writeBuffer()),
});
const reasons = new Map<string, number>();
for (const row of summary.rejected) reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + 1);
console.log(
  JSON.stringify(
    {
      rowsRead: summary.rowsRead,
      rowsAccepted: summary.rowsAccepted,
      rowsRejected: summary.rowsRejected,
      contactsCreated: summary.contactsCreated,
      contactsMatched: summary.contactsMatched,
      purchaseLinesAdded: summary.purchaseLinesAdded,
      reasons: Object.fromEntries(reasons),
      sampleRejected: summary.rejected.slice(0, 8),
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
