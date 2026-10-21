import ExcelJS from "exceljs";

import { PURCHASE_HEADERS, type PurchaseHeader } from "@/lib/vault-supplement-import/headers";

export const TEMPLATE_FILE_NAME = "vault-supplement-contacts-template.xlsx";
export const ITEM_CODE_FILE_NAME = "vault-supplement-item-codes.xlsx";

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Nimal Perera example from the spec. line_amount is the K2*L2 formula, not a stored number. */
const EXAMPLE = [
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
  "LKR",
  "Cash",
  "Website",
  "Kamal",
  "COSMO-ORD-1001",
] as const;

const TEXT_COLUMNS = new Set<PurchaseHeader>(["phone", "item_code", "invoice_no", "invoice_date", "source_ref"]);

function applyTextFormat(cell: ExcelJS.Cell, header: PurchaseHeader) {
  if (TEXT_COLUMNS.has(header)) cell.numFmt = "@";
}

export async function buildTemplateWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const purchases = workbook.addWorksheet("Purchases");
  PURCHASE_HEADERS.forEach((header, index) => {
    const cell = purchases.getCell(1, index + 1);
    cell.value = header;
    cell.font = { bold: true };
  });

  EXAMPLE.forEach((value, index) => {
    const header = PURCHASE_HEADERS[index]!;
    const cell = purchases.getCell(2, index + 1);
    if (header === "line_amount") {
      cell.value = { formula: "K2*L2", result: 30000 };
    } else {
      cell.value = value;
    }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFC000" },
    };
    applyTextFormat(cell, header);
  });

  const guide = workbook.addWorksheet("Guide");
  guide.getCell(1, 1).value = "Supplement contact import";
  guide.getCell(2, 1).value =
    "Fill one supplement purchase line per row on the Purchases sheet. Delete the orange example row before upload.";
  guide.getCell(3, 1).value =
    "invoice_date must be YYYY-MM-DD. Blank line_amount means quantity times unit price. Blank currency means LKR.";
  guide.getCell(4, 1).value = "This Guide sheet is not imported.";
  guide.getColumn(1).width = 110;

  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}
