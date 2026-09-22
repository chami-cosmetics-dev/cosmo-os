import * as XLSX from "xlsx";

/** OSF workbook gap-fills Cosmo purchase import for these months only. */
export const VAULT_OSF_PURCHASE_HISTORY_MONTHS = ["2026-04", "2026-05"] as const;

export type VaultOsfPurchaseHistoryMonth =
  (typeof VAULT_OSF_PURCHASE_HISTORY_MONTHS)[number];

export function isVaultOsfPurchaseHistoryMonth(
  month: string,
): month is VaultOsfPurchaseHistoryMonth {
  return (VAULT_OSF_PURCHASE_HISTORY_MONTHS as readonly string[]).includes(month);
}

export type ParsedPurchaseHistoryLine = {
  sheetRow: number;
  sku: string;
  supplier: string;
  postingDate: string;
  qty: number;
  rate: number;
  netValue: number;
  excelCompany: string | null;
  sourceRef: string | null;
};

export type PurchaseHistoryParseResult = {
  lines: ParsedPurchaseHistoryLine[];
  skippedBlank: number;
  errors: Array<{ row: number; sku?: string; message: string }>;
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function excelDateToIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Spreadsheet calendar dates — use local Y-M-D (avoid UTC day shift).
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const y = parsed.y;
    const m = String(parsed.m).padStart(2, "0");
    const d = String(parsed.d).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse Dilhan-style purchasing history workbook.
 * Expects headers: Date, SKU U, Supplier, Company, … Qty, Rate, Amount, …
 */
export function parseDilhanPurchaseHistorySheet(
  buffer: Buffer,
  _filename: string,
): PurchaseHistoryParseResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { lines: [], skippedBlank: 0, errors: [{ row: 0, message: "Workbook has no sheets" }] };
  }
  const sheet = wb.Sheets[sheetName]!;
  const rows = XLSX.utils.sheet_to_json<(string | number | Date | null | undefined)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  let headerIdx = -1;
  let col: Record<string, number> = {};
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i] ?? [];
    const map = new Map<string, number>();
    row.forEach((cell, idx) => {
      const h = normalizeHeader(cell);
      if (h) map.set(h, idx);
    });
    const dateCol = map.get("date");
    const skuCol = map.get("sku u") ?? map.get("sku") ?? map.get("variant sku");
    const supplierCol = map.get("supplier");
    const qtyCol = map.get("qty") ?? map.get("quantity");
    const rateCol = map.get("rate");
    if (
      dateCol == null ||
      skuCol == null ||
      supplierCol == null ||
      qtyCol == null ||
      rateCol == null
    ) {
      continue;
    }
    headerIdx = i;
    col = {
      date: dateCol,
      sku: skuCol,
      supplier: supplierCol,
      qty: qtyCol,
      rate: rateCol,
      amount: map.get("amount") ?? map.get("net amount") ?? -1,
      company: map.get("company") ?? -1,
      po: map.get("po no.") ?? map.get("po no") ?? map.get("po") ?? -1,
    };
    break;
  }

  if (headerIdx < 0) {
    return {
      lines: [],
      skippedBlank: 0,
      errors: [
        {
          row: 0,
          message: "Missing headers (need Date, SKU U, Supplier, Qty, Rate)",
        },
      ],
    };
  }

  const lines: ParsedPurchaseHistoryLine[] = [];
  const errors: PurchaseHistoryParseResult["errors"] = [];
  let skippedBlank = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const sheetRow = i + 1;
    const skuRaw = row[col.sku!];
    const supplierRaw = row[col.supplier!];
    const dateRaw = row[col.date!];
    const allEmpty =
      (skuRaw == null || String(skuRaw).trim() === "") &&
      (supplierRaw == null || String(supplierRaw).trim() === "") &&
      dateRaw == null;
    if (allEmpty) {
      skippedBlank += 1;
      continue;
    }

    const sku = String(skuRaw ?? "").trim();
    if (!sku) {
      errors.push({ row: sheetRow, message: "Missing SKU" });
      continue;
    }
    const supplier = String(supplierRaw ?? "").trim();
    if (!supplier) {
      errors.push({ row: sheetRow, sku, message: "Missing supplier" });
      continue;
    }
    const postingDate = excelDateToIso(dateRaw);
    if (!postingDate) {
      errors.push({ row: sheetRow, sku, message: "Invalid date" });
      continue;
    }
    const qty = toNumber(row[col.qty!]);
    const rate = toNumber(row[col.rate!]);
    if (qty == null || !Number.isFinite(qty)) {
      errors.push({ row: sheetRow, sku, message: "Invalid qty" });
      continue;
    }
    if (rate == null || !Number.isFinite(rate) || rate <= 0) {
      errors.push({ row: sheetRow, sku, message: "Invalid rate" });
      continue;
    }
    const amountCol = col.amount!;
    const amount = amountCol >= 0 ? toNumber(row[amountCol]) : null;
    const netValue =
      amount != null && Number.isFinite(amount) ? amount : Math.round(qty * rate * 100) / 100;
    const companyCol = col.company!;
    const poCol = col.po!;
    const excelCompany =
      companyCol >= 0 && row[companyCol] != null ? String(row[companyCol]).trim() || null : null;
    const sourceRef =
      poCol >= 0 && row[poCol] != null ? String(row[poCol]).trim() || null : null;

    lines.push({
      sheetRow,
      sku,
      supplier,
      postingDate,
      qty,
      rate,
      netValue,
      excelCompany,
      sourceRef,
    });
  }

  return { lines, skippedBlank, errors };
}
