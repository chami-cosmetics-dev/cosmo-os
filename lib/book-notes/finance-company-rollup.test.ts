import { describe, expect, it } from "vitest";

import { rollUpByCompany } from "@/lib/book-notes/finance-review";
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
  company: string,
  rows: BookNoteRowDto[],
  receiptCount = 0,
): BookNoteFinanceDay {
  const summary = summarizeBookNoteRows(rows);
  return {
    id: `${company}-${Math.random()}`,
    companyLocationId: "loc",
    shopName: "Shop",
    company,
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

describe("rollUpByCompany", () => {
  it("groups days by ERP company and sums each one", () => {
    const totals = rollUpByCompany([
      day("SPK Trading (Pvt) Ltd", [row({ cash: 100 }), row({ card: 200 })], 2),
      day("SPK Trading (Pvt) Ltd", [row({ cash: 50 })], 1),
      day("Cosmetics.lk", [row({ koko: 400 })]),
    ]);

    expect(totals).toHaveLength(2);

    const spk = totals.find((t) => t.company === "SPK Trading (Pvt) Ltd")!;
    expect(spk.dayCount).toBe(2);
    expect(spk.rowCount).toBe(3);
    expect(spk.receiptCount).toBe(3);
    expect(spk.grandTotal).toBe(350);
    expect(spk.methods.find((m) => m.method === "Cash")).toEqual({
      method: "Cash",
      count: 2,
      total: 150,
    });

    const cos = totals.find((t) => t.company === "Cosmetics.lk")!;
    expect(cos.grandTotal).toBe(400);
  });

  it("sorts companies by grand total, largest first", () => {
    const totals = rollUpByCompany([
      day("Small Co", [row({ cash: 10 })]),
      day("Big Co", [row({ cash: 5000 })]),
      day("Mid Co", [row({ cash: 900 })]),
    ]);

    expect(totals.map((t) => t.company)).toEqual([
      "Big Co",
      "Mid Co",
      "Small Co",
    ]);
  });

  it("buckets shops with no ERP company mapping", () => {
    const totals = rollUpByCompany([day("", [row({ cash: 25 })])]);
    expect(totals[0]!.company).toBe("(no ERP company)");
    expect(totals[0]!.grandTotal).toBe(25);
  });

  it("returns nothing for an empty range", () => {
    expect(rollUpByCompany([])).toEqual([]);
  });
});
