import * as XLSX from "xlsx";

import type { OsfResolvedColumn } from "@/lib/osf/column-config";
import { prisma } from "@/lib/prisma";

export type RopImportError = {
  row: number;
  sku?: string;
  column?: string;
  message: string;
};

export type RopImportResult = {
  updatedCells: number;
  skippedBlank: number;
  rowsProcessed: number;
  errors: RopImportError[];
};

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeSku(value: unknown) {
  return String(value ?? "").trim();
}

function readWorkbook(buffer: Buffer, filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    return XLSX.read(buffer.toString("utf8"), { type: "string" });
  }
  return XLSX.read(buffer, { type: "buffer", cellDates: false });
}

/** Map template header → OsfColumnConfig.key for active includeInRop columns. */
export function buildRopHeaderToKeyMap(
  ropColumns: Array<{ key: string; label: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const col of ropColumns) {
    map.set(normalizeHeader(col.label), col.key);
    map.set(normalizeHeader(col.key), col.key);
    map.set(normalizeHeader(`${col.label} ROP`), col.key);
  }
  return map;
}

export function parseRopQtyCell(raw: unknown): { ok: true; value: number } | { ok: false; message: string } | { ok: true; blank: true } {
  if (raw == null || raw === "") return { ok: true, blank: true };
  if (typeof raw === "string" && raw.trim() === "") return { ok: true, blank: true };

  const num = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(num)) {
    return { ok: false, message: "ROP must be a non-negative integer" };
  }
  if (num < 0) {
    return { ok: false, message: "ROP must be a non-negative integer" };
  }
  if (!Number.isInteger(num)) {
    if (Math.floor(num) !== num) {
      return { ok: false, message: "ROP must be a non-negative integer" };
    }
  }
  return { ok: true, value: Math.floor(num) };
}

export type ParsedRopImport = {
  rows: Array<{
    sheetRow: number;
    sku: string;
    cells: Array<{ columnKey: string; columnLabel: string; qty: number }>;
  }>;
  skippedBlank: number;
  errors: RopImportError[];
  unknownHeaders: string[];
};

export function parseRopImportSheet(
  buffer: Buffer,
  filename: string,
  ropColumns: Array<{ key: string; label: string }>,
): ParsedRopImport {
  const workbook = readWorkbook(buffer, filename);
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet) {
    throw new Error("Could not find a readable sheet in the uploaded file.");
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const headerIndex = rows.findIndex((row) =>
    row.some((value) => {
      const h = normalizeHeader(value);
      return h === "sku" || h === "variant sku";
    }),
  );
  if (headerIndex < 0) {
    throw new Error('Could not find a header row containing "SKU" or "Variant SKU".');
  }

  const headers = rows[headerIndex]!.map((h) => String(h ?? "").trim());
  const headerNorm = headers.map(normalizeHeader);
  const skuIndex = headerNorm.findIndex((h) => h === "sku" || h === "variant sku");
  if (skuIndex < 0) {
    throw new Error('Required column missing. Need "SKU" or "Variant SKU".');
  }

  const headerMap = buildRopHeaderToKeyMap(ropColumns);
  const labelByKey = new Map(ropColumns.map((c) => [c.key, c.label]));
  const columnIndexes: Array<{ index: number; columnKey: string; columnLabel: string }> = [];
  const unknownHeaders: string[] = [];

  for (let i = 0; i < headers.length; i++) {
    if (i === skuIndex) continue;
    const h = headerNorm[i]!;
    if (!h || h === "barcode" || h === "variant barcode") continue;
    const key = headerMap.get(h);
    if (!key) {
      unknownHeaders.push(headers[i]!);
      continue;
    }
    columnIndexes.push({
      index: i,
      columnKey: key,
      columnLabel: labelByKey.get(key) ?? headers[i]!,
    });
  }

  const errors: RopImportError[] = [];
  for (const uh of unknownHeaders) {
    errors.push({
      row: headerIndex + 1,
      column: uh,
      message: `Unrecognized ROP column header: ${uh}`,
    });
  }

  let skippedBlank = 0;
  const bySku = new Map<
    string,
    {
      sheetRow: number;
      sku: string;
      cells: Array<{ columnKey: string; columnLabel: string; qty: number }>;
      duplicate: boolean;
    }
  >();

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r]!;
    const sku = normalizeSku(row[skuIndex]);
    if (!sku) continue;

    const skuKey = sku.toLowerCase();
    if (bySku.has(skuKey)) {
      const existing = bySku.get(skuKey)!;
      existing.duplicate = true;
      errors.push({
        row: r + 1,
        sku,
        message: "Duplicate SKU row — none of this SKU's changes will be applied",
      });
      continue;
    }

    const cells: Array<{ columnKey: string; columnLabel: string; qty: number }> = [];
    for (const col of columnIndexes) {
      const parsed = parseRopQtyCell(row[col.index]);
      if ("blank" in parsed && parsed.blank) {
        skippedBlank += 1;
        continue;
      }
      if (!parsed.ok) {
        errors.push({
          row: r + 1,
          sku,
          column: col.columnLabel,
          message: parsed.message,
        });
        continue;
      }
      cells.push({
        columnKey: col.columnKey,
        columnLabel: col.columnLabel,
        qty: parsed.value,
      });
    }

    bySku.set(skuKey, { sheetRow: r + 1, sku, cells, duplicate: false });
  }

  const outRows = [...bySku.values()]
    .filter((r) => !r.duplicate)
    .map(({ sheetRow, sku, cells }) => ({ sheetRow, sku, cells }));

  return {
    rows: outRows,
    skippedBlank,
    errors,
    unknownHeaders,
  };
}

export async function applyRopImport(params: {
  companyId: string;
  buffer: Buffer;
  filename: string;
  ropColumns: OsfResolvedColumn[];
}): Promise<RopImportResult> {
  const activeRop = params.ropColumns
    .filter((c) => c.active && c.includeInRop)
    .map((c) => ({ key: c.key, label: c.label }));

  const parsed = parseRopImportSheet(params.buffer, params.filename, activeRop);
  const errors = [...parsed.errors];
  let updatedCells = 0;
  let rowsProcessed = 0;

  const skus = parsed.rows.map((r) => r.sku);
  const catalog = await prisma.productItem.findMany({
    where: { companyId: params.companyId, sku: { in: skus } },
    select: { sku: true },
    distinct: ["sku"],
  });
  const knownSkus = new Set(
    catalog.map((c) => (c.sku ?? "").toLowerCase()).filter(Boolean),
  );

  for (const row of parsed.rows) {
    if (!knownSkus.has(row.sku.toLowerCase())) {
      errors.push({
        row: row.sheetRow,
        sku: row.sku,
        message: "Unknown SKU",
      });
      continue;
    }
    if (row.cells.length === 0) {
      rowsProcessed += 1;
      continue;
    }

    for (const cell of row.cells) {
      await prisma.productOsfRop.upsert({
        where: {
          companyId_sku_columnKey: {
            companyId: params.companyId,
            sku: row.sku,
            columnKey: cell.columnKey,
          },
        },
        create: {
          companyId: params.companyId,
          sku: row.sku,
          columnKey: cell.columnKey,
          ropQty: cell.qty,
        },
        update: { ropQty: cell.qty },
      });
      updatedCells += 1;
    }
    rowsProcessed += 1;
  }

  return {
    updatedCells,
    skippedBlank: parsed.skippedBlank,
    rowsProcessed,
    errors,
  };
}

export function buildRopTemplateAoa(params: {
  rows: Array<{ sku: string; barcode: string | null; rops: Record<string, number | null> }>;
  ropColumns: Array<{ key: string; label: string }>;
}): (string | number | null)[][] {
  const headers = ["SKU", "Barcode", ...params.ropColumns.map((c) => c.label)];
  const data = params.rows.map((r) => [
    r.sku,
    r.barcode ?? "",
    ...params.ropColumns.map((c) => {
      const v = r.rops[c.key];
      return v == null ? "" : v;
    }),
  ]);
  return [headers, ...data];
}
