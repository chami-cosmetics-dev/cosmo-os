import { describe, expect, it } from "vitest";

import { rollUpByShop } from "@/lib/book-notes/finance-review";
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
    bank_transfer: 0,
    row_total: 0,
    is_multi_method: false,
    split_lines: null,
    ...over,
  };
}

function day(
  companyLocationId: string,
  shopName: string,
  rows: BookNoteRowDto[],
  receiptCount = 0,
): BookNoteFinanceDay {
  const summary = summarizeBookNoteRows(rows);
  return {
    id: `${companyLocationId}-${Math.random()}`,
    companyLocationId,
    shopName,
    company: `${shopName} Trading Lanka Pvt Ltd`,
    posting_date: "2026-09-10",
    submittedBy: null,
    lastUpdatedBy: null,
    rowCount: rows.length,
    methods: summary.methods,
    entryCount: summary.entryCount,
    grandTotal: summary.grandTotal,
    rows,
    receipts: Array.from({ length: receiptCount }, (_, i) => ({
      id: `r${i}`,
      fileName: "slip.jpg",
      mimeType: "image/jpeg",
      fileSize: 100,
      url: "/x",
      sortOrder: i,
      createdAt: "2026-09-10T00:00:00.000Z",
    })),
  };
}

describe("rollUpByShop", () => {
  it("groups every day of a shop into one row and sums it", () => {
    const totals = rollUpByShop([
      day("loc_ajs", "AJS", [row({ cash: 100 }), row({ card: 200 })], 2),
      day("loc_ajs", "AJS", [row({ cash: 50 })], 1),
      day("loc_lmj", "LMJ", [row({ koko: 400 })]),
    ]);

    expect(totals).toHaveLength(2);

    const ajs = totals.find((t) => t.companyLocationId === "loc_ajs")!;
    expect(ajs.shopName).toBe("AJS");
    expect(ajs.company).toBe("AJS Trading Lanka Pvt Ltd");
    expect(ajs.dayCount).toBe(2);
    expect(ajs.rowCount).toBe(3);
    expect(ajs.receiptCount).toBe(3);
    expect(ajs.grandTotal).toBe(350);
    expect(ajs.methods.find((m) => m.method === "Cash")).toEqual({
      method: "Cash",
      count: 2,
      total: 150,
    });

    expect(totals.find((t) => t.companyLocationId === "loc_lmj")!.grandTotal).toBe(
      400,
    );
  });

  it("sorts shops by grand total, largest first", () => {
    const totals = rollUpByShop([
      day("loc_a", "Small", [row({ cash: 10 })]),
      day("loc_b", "Big", [row({ cash: 5000 })]),
      day("loc_c", "Mid", [row({ cash: 900 })]),
    ]);

    expect(totals.map((t) => t.shopName)).toEqual(["Big", "Mid", "Small"]);
  });

  it("keeps two shops apart even when their names collide", () => {
    const totals = rollUpByShop([
      day("loc_1", "Cosmetics.lk", [row({ cash: 10 })]),
      day("loc_2", "Cosmetics.lk", [row({ cash: 20 })]),
    ]);

    expect(totals).toHaveLength(2);
    expect(totals.map((t) => t.grandTotal).sort()).toEqual([10, 20]);
  });

  it("returns nothing for an empty range", () => {
    expect(rollUpByShop([])).toEqual([]);
  });
});
