import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { requireStoreStockCountAccess } from "@/lib/store-stock-count/auth";
import { importStoreStockCountQbStock } from "@/lib/store-stock-count/reports";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
type ImportRow = { sku: string; qbStock: number | null };

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseWholeNumber(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) throw new Error(`Invalid QB stock value: ${text}`);
  return Number(text);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function rowsFromTable(table: unknown[][]): ImportRow[] {
  const [headers, ...body] = table;
  if (!headers) return [];
  const normalizedHeaders = headers.map(normalizeHeader);
  const skuIndex = normalizedHeaders.findIndex(
    (header) => header === "itemcode" || header === "sku",
  );
  const qbIndex = normalizedHeaders.findIndex((header) => header === "qbstock");
  if (skuIndex < 0 || qbIndex < 0)
    throw new Error("Import file must contain Item Code and QB Stock columns");

  return body
    .map((row) => {
      const sku = String(row[skuIndex] ?? "").trim();
      if (!sku) return null;
      return { sku, qbStock: parseWholeNumber(row[qbIndex]) };
    })
    .filter((row): row is ImportRow => row != null);
}

async function parseFile(file: File): Promise<ImportRow[]> {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];
    return rowsFromTable(
      XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as unknown[][],
    );
  }
  const text = new TextDecoder("utf-8").decode(buffer);
  return rowsFromTable(parseCsv(text));
}

export async function POST(request: NextRequest, context: Ctx) {
  const auth = await requireStoreStockCountAccess();
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "File is required" }, { status: 400 });

  try {
    const items = await parseFile(file);
    if (items.length === 0)
      return NextResponse.json(
        { error: "No rows found in import file" },
        { status: 400 },
      );
    const { id } = await context.params;
    const result = await importStoreStockCountQbStock({
      companyId: auth.companyId,
      reportId: id,
      items,
      actor: {
        userId: auth.context.user.id,
        name: auth.context.user.name ?? null,
        email: auth.context.user.email ?? null,
      },
    });
    if (!result)
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Could not import QB stock",
      },
      { status: 400 },
    );
  }
}
