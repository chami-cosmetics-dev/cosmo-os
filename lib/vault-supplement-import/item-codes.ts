import ExcelJS from "exceljs";

import { listVaultErpStockItemCodes } from "@/lib/product-items/vault-erp-catalog-sync";
import { ITEM_CODE_HEADER } from "@/lib/vault-supplement-import/headers";
import { loadXlsxWorkbook } from "@/lib/vault-supplement-import/xlsx-load";

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    if ("result" in value && value.result != null) return cellText(value.result as ExcelJS.CellValue);
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? "").join("").trim();
    }
  }
  return String(value).trim();
}

export async function listVaultErpItemCodes(companyId: string): Promise<Set<string>> {
  return listVaultErpStockItemCodes(companyId);
}

export type ItemCodeWorkbookResult =
  | { ok: true; codes: string[] }
  | { ok: false; error: string };

/** Read `item_code` from sheet ItemCodes or Purchases. Extra columns are ignored. */
export async function readItemCodeWorkbook(buffer: Buffer): Promise<ItemCodeWorkbookResult> {
  const workbook = await loadXlsxWorkbook(buffer);
  const sheet =
    workbook.getWorksheet("ItemCodes") ??
    workbook.getWorksheet("Purchases") ??
    workbook.worksheets.find((candidate) => {
      const name = candidate.name.trim().toLowerCase();
      return name === "itemcodes" || name === "purchases";
    });
  if (!sheet) {
    return { ok: false, error: "Item code header is missing" };
  }

  const headerRow = sheet.getRow(1);
  let column = -1;
  const lastColumn = Math.max(headerRow.cellCount, 1);
  for (let index = 1; index <= lastColumn; index += 1) {
    if (cellText(headerRow.getCell(index).value) === ITEM_CODE_HEADER) {
      column = index;
      break;
    }
  }
  if (column < 0) {
    return { ok: false, error: "Item code header is missing" };
  }

  const codes: string[] = [];
  const seen = new Set<string>();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const code = cellText(sheet.getRow(rowNumber).getCell(column).value);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  if (codes.length === 0) {
    return { ok: false, error: "Item code file has no codes" };
  }
  return { ok: true, codes };
}

export async function buildItemCodeWorkbook(codes: Iterable<string>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("ItemCodes");
  sheet.getCell(1, 1).value = ITEM_CODE_HEADER;
  let row = 2;
  const sorted = [...codes].filter((code) => code.trim()).sort((a, b) => a.localeCompare(b));
  for (const code of sorted) {
    const cell = sheet.getCell(row, 1);
    cell.value = code.trim();
    cell.numFmt = "@";
    row += 1;
  }
  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}
