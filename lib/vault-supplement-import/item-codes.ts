import ExcelJS from "exceljs";

import { listVaultErpStockItemCodes } from "@/lib/product-items/vault-erp-catalog-sync";
import { ITEM_CODE_HEADER } from "@/lib/vault-supplement-import/headers";

export async function listVaultErpItemCodes(companyId: string): Promise<Set<string>> {
  return listVaultErpStockItemCodes(companyId);
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
