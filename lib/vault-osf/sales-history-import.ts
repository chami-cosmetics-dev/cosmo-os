import * as XLSX from "xlsx";

import { prisma } from "@/lib/prisma";
import {
  buildRopHeaderToKeyMap,
  parseRopImportSheet,
  type RopImportError,
} from "@/lib/osf/rop-import";

export type SalesHistoryImportResult = {
  month: string;
  updatedCells: number;
  skippedBlank: number;
  rowsProcessed: number;
  errors: RopImportError[];
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function assertMonthKey(month: string): string {
  const m = month.trim();
  if (!MONTH_RE.test(m)) throw new Error("month must be YYYY-MM");
  return m;
}

export function buildSalesHistoryTemplateAoa(params: {
  rows: Array<{ sku: string; barcode: string | null; qty: Record<string, number | null> }>;
  columns: Array<{ key: string; label: string }>;
}): (string | number | null)[][] {
  const headers = ["SKU", "Barcode", ...params.columns.map((c) => c.label)];
  const data = params.rows.map((r) => [
    r.sku,
    r.barcode ?? "",
    ...params.columns.map((c) => {
      const v = r.qty[c.key];
      return v == null ? "" : v;
    }),
  ]);
  return [headers, ...data];
}

export function parseSalesHistorySheet(
  buffer: Buffer,
  filename: string,
  columns: Array<{ key: string; label: string }>,
) {
  return parseRopImportSheet(buffer, filename, columns);
}

export async function importSalesHistory(params: {
  companyId: string;
  month: string;
  buffer: Buffer;
  filename: string;
  columns: Array<{ key: string; label: string }>;
  knownSkus: Set<string>;
}): Promise<SalesHistoryImportResult> {
  const month = assertMonthKey(params.month);
  const parsed = parseSalesHistorySheet(params.buffer, params.filename, params.columns);
  const errors: RopImportError[] = [...parsed.errors];
  const known = new Set([...params.knownSkus].map((s) => s.trim().toLowerCase()));

  let updatedCells = 0;
  let rowsProcessed = 0;

  for (const row of parsed.rows) {
    if (!known.has(row.sku.toLowerCase())) {
      errors.push({ row: row.sheetRow, sku: row.sku, message: "Unknown SKU" });
      continue;
    }
    for (const cell of row.cells) {
      await prisma.osfMonthlySalesHistory.upsert({
        where: {
          companyId_sku_columnKey_month: {
            companyId: params.companyId,
            sku: row.sku,
            columnKey: cell.columnKey,
            month,
          },
        },
        create: {
          companyId: params.companyId,
          sku: row.sku,
          columnKey: cell.columnKey,
          month,
          qty: cell.qty,
        },
        update: { qty: cell.qty },
      });
      updatedCells += 1;
    }
    rowsProcessed += 1;
  }

  return {
    month,
    updatedCells,
    skippedBlank: parsed.skippedBlank,
    rowsProcessed,
    errors,
  };
}

export function workbookFromAoa(aoa: (string | number | null)[][], sheetName: string): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

export { buildRopHeaderToKeyMap };
