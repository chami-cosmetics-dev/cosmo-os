import * as XLSX from "xlsx";

import { phoneDigitsOnly } from "@/lib/phone-lookup";

const PHONE_HEADERS = new Set([
  "phone",
  "phones",
  "phone number",
  "phone no",
  "phonenumber",
  "mobile",
  "mobile no",
  "mobile_no",
  "contact phone",
  "contact number",
]);

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function readWorkbook(buffer: Buffer, filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    return XLSX.read(buffer.toString("utf8"), { type: "string" });
  }
  return XLSX.read(buffer, { type: "buffer", cellDates: false });
}

function splitPhoneCell(raw: unknown): string[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  return text
    .split(/[;|,/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** True when cell looks like a phone rather than a name. */
export function looksLikeImportPhone(raw: string): boolean {
  const digits = phoneDigitsOnly(raw);
  return digits.length >= 7;
}

/**
 * Pull phone values from an Excel/CSV upload.
 * Prefers a Phone column (same header family as call-queue export).
 * Falls back to first column when no phone header found.
 */
export function parseCallQueueImportPhones(
  buffer: Buffer,
  filename: string
): { phones: string[]; skippedBlank: number; usedFallbackColumn: boolean } {
  const workbook = readWorkbook(buffer, filename);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { phones: [], skippedBlank: 0, usedFallbackColumn: false };
  }
  const sheet = workbook.Sheets[sheetName]!;
  const rows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown as Array<Array<string | number | null | undefined>>;

  if (rows.length === 0) {
    return { phones: [], skippedBlank: 0, usedFallbackColumn: false };
  }

  const headerRow = rows[0] ?? [];
  let phoneCol = -1;
  for (let c = 0; c < headerRow.length; c++) {
    if (PHONE_HEADERS.has(normalizeHeader(headerRow[c]))) {
      phoneCol = c;
      break;
    }
  }

  const usedFallbackColumn = phoneCol < 0;
  if (phoneCol < 0) phoneCol = 0;

  const phones: string[] = [];
  let skippedBlank = 0;
  const dataRows = phoneCol === 0 && usedFallbackColumn ? rows : rows.slice(1);

  for (const row of dataRows) {
    const cell = row?.[phoneCol];
    const parts = splitPhoneCell(cell);
    if (parts.length === 0) {
      skippedBlank += 1;
      continue;
    }
    for (const part of parts) {
      if (!looksLikeImportPhone(part)) {
        skippedBlank += 1;
        continue;
      }
      phones.push(part);
    }
  }

  return { phones, skippedBlank, usedFallbackColumn };
}
