import ExcelJS from "exceljs";

/** exceljs typings pin an older Buffer generic than this repo's Node types. */
export async function loadXlsxWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  return workbook;
}
