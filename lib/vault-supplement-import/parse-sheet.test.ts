import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { REJECT_REASON } from "@/lib/vault-supplement-import/headers";
import { PURCHASE_HEADERS } from "@/lib/vault-supplement-import/headers";
import { parsePurchasesWorkbook } from "@/lib/vault-supplement-import/parse-sheet";

async function workbookBuffer(
  headers: string[],
  rows: Array<Array<string | number | null>>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Purchases");
  headers.forEach((header, index) => {
    sheet.getCell(1, index + 1).value = header;
  });
  rows.forEach((row, rowIndex) => {
    row.forEach((value, column) => {
      if (value != null) sheet.getCell(rowIndex + 2, column + 1).value = value;
    });
  });
  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}

const example = [
  "Nimal Perera",
  "0771234567",
  "nimal@example.com",
  "12 Galle Rd",
  "Colombo",
  "Colombo",
  "INV-1001",
  "2024-03-15",
  "SV-WHEY-1KG",
  "Whey Protein 1kg",
  2,
  15000,
  null,
  "",
  "Cash",
  "Website",
  "Kamal",
  "COSMO-ORD-1001",
];

describe("purchase headers", () => {
  it("rejects a renamed required header and classifies no data rows", async () => {
    const headers = PURCHASE_HEADERS.map((header) => (header === "item_code" ? "sku" : header));
    const buffer = await workbookBuffer(headers, [example]);
    const parsed = await parsePurchasesWorkbook(buffer);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain("item_code");
      expect(parsed).not.toHaveProperty("lines");
    }
  });
});

describe("parse purchases sheet", () => {
  it("accepts YYYY-MM-DD and fills a blank line amount from quantity times unit price", async () => {
    const buffer = await workbookBuffer([...PURCHASE_HEADERS], [example]);
    const parsed = await parsePurchasesWorkbook(buffer);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rowsRead).toBe(1);
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0]).toMatchObject({
      invoiceNo: "INV-1001",
      itemCode: "SV-WHEY-1KG",
      quantity: 2,
      unitPrice: 15000,
      lineAmount: 30000,
      currency: "LKR",
    });
    expect(parsed.lines[0]?.invoiceDate.toISOString()).toBe("2024-03-14T18:30:00.000Z");
    expect(parsed.lines[0]?.financialStatus).toBeNull();
  });

  it("stores a Status column in lowercase", async () => {
    const buffer = await workbookBuffer([...PURCHASE_HEADERS, "Status"], [[...example, "Voided"]]);
    const parsed = await parsePurchasesWorkbook(buffer);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lines[0]?.financialStatus).toBe("voided");
  });

  it("rejects quantity that is not greater than zero", async () => {
    const row = [...example];
    row[10] = 0;
    const buffer = await workbookBuffer([...PURCHASE_HEADERS], [row]);
    const parsed = await parsePurchasesWorkbook(buffer);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lines).toHaveLength(0);
    expect(parsed.rejected).toEqual([{ rowNumber: 2, reason: REJECT_REASON.quantity }]);
  });

  it("rejects a line amount that is not a number", async () => {
    const row = [...example];
    row[12] = "abc";
    const buffer = await workbookBuffer([...PURCHASE_HEADERS], [row]);
    const parsed = await parsePurchasesWorkbook(buffer);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rejected[0]?.reason).toBe(REJECT_REASON.lineAmount);
  });

  it("keeps the later quantity for the same source, invoice, and item code", async () => {
    const first = [...example];
    const second = [...example];
    second[10] = 5;
    second[12] = 75000;
    const buffer = await workbookBuffer([...PURCHASE_HEADERS], [first, second]);
    const parsed = await parsePurchasesWorkbook(buffer);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rowsRead).toBe(2);
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0]).toMatchObject({ rowNumber: 3, quantity: 5, lineAmount: 75000 });
    expect(parsed.rejected).toHaveLength(0);
  });

  it("uses the stable reject phrase when phone and email are both blank", async () => {
    const row = [...example];
    row[1] = "";
    row[2] = "";
    const buffer = await workbookBuffer([...PURCHASE_HEADERS], [row]);
    const parsed = await parsePurchasesWorkbook(buffer);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rejected).toEqual([{ rowNumber: 2, reason: REJECT_REASON.phoneOrEmail }]);
  });
});
