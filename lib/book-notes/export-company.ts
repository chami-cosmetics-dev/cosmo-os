import * as XLSX from "xlsx";

import { mergeBookNoteSummaries } from "@/lib/book-notes/summary";
import type { BookNoteFinanceDay, BookNoteRowDto } from "@/lib/book-notes/types";

const SUMMARY_SHEET = "Summary";

const DETAIL_HEADERS = [
  "Shop",
  "Date",
  "Submitted by",
  "Invoice",
  "Cash",
  "Card",
  "Card last 4",
  "KOKO",
  "KOKO reference",
  "MintPay",
  "MintPay order ID",
  "Bank transfer",
  "Bank reference",
  "Row total",
  "Special note",
] as const;

export function bookNoteCompanyLabel(company: string): string {
  const trimmed = company.trim();
  return trimmed.length > 0 ? trimmed : "Unmapped";
}

export function bookNoteCompanyExportFilename(fromYmd: string, toYmd: string): string {
  return `book-notes-${fromYmd}-to-${toYmd}.xlsx`;
}

/**
 * Excel workbook of every book note in the range, one sheet per ERP company,
 * plus a Summary sheet of company totals.
 */
export function buildBookNoteCompanyWorkbook(input: {
  days: BookNoteFinanceDay[];
  truncated?: boolean;
  maxDays?: number;
}): Buffer {
  const wb = XLSX.utils.book_new();
  const groups = groupDaysByCompany(input.days);
  const used = new Set<string>([SUMMARY_SHEET.toLowerCase()]);

  const summaryRows: Array<Array<string | number>> = [];
  if (input.truncated) {
    const cap = input.maxDays ?? input.days.length;
    summaryRows.push([
      "Note",
      `Newest ${cap} book notes only. Narrow the date range to export the rest.`,
    ]);
    summaryRows.push([]);
  }
  summaryRows.push([
    "Company",
    "Shops",
    "Book notes",
    "Invoice rows",
    "Cash",
    "Card",
    "KOKO",
    "MintPay",
    "Bank transfer",
    "Grand total",
    "Photos",
  ]);

  for (const group of groups) {
    const merged = mergeBookNoteSummaries(
      group.days.map((day) => ({
        methods: day.methods,
        entryCount: day.entryCount,
        grandTotal: day.grandTotal,
      })),
    );
    const methodTotal = (name: string) =>
      merged.methods.find((m) => m.method === name)?.total ?? 0;
    const shops = [...new Set(group.days.map((day) => day.shopName))].sort((a, b) =>
      a.localeCompare(b),
    );
    summaryRows.push([
      group.company,
      shops.join(", "),
      group.days.length,
      group.days.reduce((sum, day) => sum + day.rowCount, 0),
      methodTotal("Cash"),
      methodTotal("Card"),
      methodTotal("KOKO"),
      methodTotal("MintPay"),
      methodTotal("Bank Transfer"),
      merged.grandTotal,
      group.days.reduce((sum, day) => sum + day.receipts.length, 0),
    ]);
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), SUMMARY_SHEET);

  for (const group of groups) {
    const rows: Array<Array<string | number>> = [Array.from(DETAIL_HEADERS)];
    const ordered = [...group.days].sort((a, b) => {
      const byDate = a.posting_date.localeCompare(b.posting_date);
      if (byDate !== 0) return byDate;
      return a.shopName.localeCompare(b.shopName);
    });
    for (const day of ordered) {
      for (const row of day.rows) {
        rows.push(detailRow(day, row));
      }
    }
    const sheetName = uniqueSheetName(group.company, used);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
  }

  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

function groupDaysByCompany(days: BookNoteFinanceDay[]): Array<{
  company: string;
  days: BookNoteFinanceDay[];
}> {
  const byCompany = new Map<string, BookNoteFinanceDay[]>();
  for (const day of days) {
    const company = bookNoteCompanyLabel(day.company);
    const list = byCompany.get(company);
    if (list) list.push(day);
    else byCompany.set(company, [day]);
  }
  return [...byCompany.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([company, companyDays]) => ({ company, days: companyDays }));
}

function detailRow(day: BookNoteFinanceDay, row: BookNoteRowDto): Array<string | number> {
  return [
    day.shopName,
    day.posting_date,
    day.submittedBy?.name ?? "",
    row.sales_invoice,
    row.cash,
    row.card,
    methodRef(row, "card"),
    row.koko,
    methodRef(row, "koko"),
    row.mintpay,
    methodRef(row, "mintpay"),
    row.bank_transfer,
    methodRef(row, "bank"),
    row.row_total,
    row.special_note?.trim() ?? "",
  ];
}

function methodRef(row: BookNoteRowDto, kind: "card" | "koko" | "mintpay" | "bank"): string {
  if (row.split_lines && row.split_lines.length > 0) {
    const parts: string[] = [];
    for (const line of row.split_lines) {
      const value =
        kind === "card"
          ? line.cardLast4
          : kind === "koko"
            ? line.kokoReference
            : kind === "mintpay"
              ? line.mintpayReference
              : line.bankReference;
      const text = value?.trim() ?? "";
      if (text) parts.push(text);
    }
    return parts.join("; ");
  }
  if (kind === "card") return row.card_receipt_ref_last4 ?? "";
  if (kind === "koko") return row.koko_reference ?? "";
  if (kind === "mintpay") return row.mintpay_reference ?? "";
  return "";
}

/** Excel sheet names: 31 chars, no \\ / ? * [ ] : and unique ignoring case. */
export function uniqueSheetName(name: string, used: Set<string>): string {
  const cleaned = name.replace(/[\\/?*\[\]:]/g, " ").replace(/\s+/g, " ").trim() || "Company";
  let n = 1;
  while (n < 1000) {
    const suffix = n === 1 ? "" : ` ${n}`;
    const candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
    const key = candidate.toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      return candidate;
    }
    n += 1;
  }
  const fallback = `Company ${used.size + 1}`.slice(0, 31);
  used.add(fallback.toLowerCase());
  return fallback;
}
