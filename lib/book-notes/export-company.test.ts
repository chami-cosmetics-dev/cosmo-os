import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { buildBookNoteCompanyWorkbook } from "@/lib/book-notes/export-company";
import { summarizeBookNoteRows } from "@/lib/book-notes/summary";
import type { BookNoteFinanceDay, BookNoteRowDto } from "@/lib/book-notes/types";

function row(over: Partial<BookNoteRowDto>): BookNoteRowDto {
  return {
    idx_no: "1",
    sales_invoice: "SI-0001",
    cash: 0,
    card: 0,
    card_receipt_ref_last4: null,
    koko: 0,
    koko_reference: null,
    mintpay: 0,
    mintpay_reference: null,
    bank_transfer: 0,
    row_total: 0,
    is_multi_method: false,
    special_note: null,
    split_lines: null,
    ...over,
  };
}

function day(
  companyLocationId: string,
  shopName: string,
  company: string,
  postingDate: string,
  rows: BookNoteRowDto[],
): BookNoteFinanceDay {
  const summary = summarizeBookNoteRows(rows);
  return {
    id: `${companyLocationId}-${postingDate}`,
    companyLocationId,
    shopName,
    company,
    posting_date: postingDate,
    submittedBy: { name: "Nimal", at: "2026-09-10T00:00:00.000Z" },
    lastUpdatedBy: null,
    rowCount: rows.length,
    methods: summary.methods,
    entryCount: summary.entryCount,
    grandTotal: summary.grandTotal,
    rows,
    receipts: [],
  };
}

function sheets(buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  return {
    names: wb.SheetNames,
    rows: (name: string) =>
      XLSX.utils.sheet_to_json<Array<string | number>>(wb.Sheets[name]!, {
        header: 1,
        raw: true,
      }),
  };
}

describe("buildBookNoteCompanyWorkbook", () => {
  it("puts every shop of one ERP company on one sheet and sums the summary", () => {
    const buffer = buildBookNoteCompanyWorkbook({
      days: [
        day(
          "loc_ajs",
          "AJS",
          "Cosmo Trading (Pvt) Ltd",
          "2026-09-11",
          [row({ sales_invoice: "SI-2", cash: 100, row_total: 100 })],
        ),
        day(
          "loc_lmj",
          "LMJ",
          "Cosmo Trading (Pvt) Ltd",
          "2026-09-10",
          [row({ sales_invoice: "SI-1", card: 40, row_total: 40 })],
        ),
        day(
          "loc_other",
          "Other",
          "Other Company",
          "2026-09-10",
          [row({ sales_invoice: "SI-9", koko: 5, row_total: 5 })],
        ),
      ],
    });

    const book = sheets(buffer);
    expect(book.names[0]).toBe("Summary");
    expect(book.names).toContain("Cosmo Trading (Pvt) Ltd");
    expect(book.names).toContain("Other Company");

    const summary = book.rows("Summary");
    const cosmo = summary.find((line) => line[0] === "Cosmo Trading (Pvt) Ltd");
    expect(cosmo?.[1]).toBe("AJS, LMJ");
    expect(cosmo?.[2]).toBe(2);
    expect(cosmo?.[3]).toBe(2);
    expect(cosmo?.[4]).toBe(100);
    expect(cosmo?.[5]).toBe(40);
    expect(cosmo?.[9]).toBe(140);

    const detail = book.rows("Cosmo Trading (Pvt) Ltd");
    expect(detail[0]?.[0]).toBe("Shop");
    expect(detail[1]?.[0]).toBe("LMJ");
    expect(detail[1]?.[1]).toBe("2026-09-10");
    expect(detail[1]?.[3]).toBe("SI-1");
    expect(detail[2]?.[0]).toBe("AJS");
    expect(detail[2]?.[3]).toBe("SI-2");
  });

  it("groups a blank ERP company as Unmapped and sanitizes sheet names", () => {
    const buffer = buildBookNoteCompanyWorkbook({
      days: [
        day("loc_a", "Shop A", "", "2026-09-01", [
          row({ cash: 10, row_total: 10, special_note: "slip missing" }),
        ]),
        day("loc_b", "Shop B", "Bad/Name?Co", "2026-09-01", [
          row({ cash: 1, row_total: 1 }),
        ]),
      ],
    });

    const book = sheets(buffer);
    expect(book.names).toContain("Unmapped");
    expect(book.names).toContain("Bad Name Co");
    expect(book.names.some((name) => /[\\/?*\[\]:]/.test(name))).toBe(false);

    const unmapped = book.rows("Unmapped");
    expect(unmapped[1]?.[14]).toBe("slip missing");
  });

  it("writes a cap note when the range was truncated", () => {
    const buffer = buildBookNoteCompanyWorkbook({
      days: [],
      truncated: true,
      maxDays: 10000,
    });
    const book = sheets(buffer);
    expect(book.names).toEqual(["Summary"]);
    expect(book.rows("Summary")[0]?.[1]).toContain("10000");
  });
});
