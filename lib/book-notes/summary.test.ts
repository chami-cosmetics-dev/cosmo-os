import { describe, expect, it } from "vitest";

import {
  mergeBookNoteSummaries,
  summarizeBookNoteRows,
} from "@/lib/book-notes/summary";
import type { BookNoteRowDto } from "@/lib/book-notes/types";

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

function totalFor(
  summary: ReturnType<typeof summarizeBookNoteRows>,
  method: string,
) {
  return summary.methods.find((m) => m.method === method)!;
}

describe("summarizeBookNoteRows", () => {
  it("counts each payment method separately and adds up to the grand total", () => {
    const summary = summarizeBookNoteRows([
      row({ cash: 100 }),
      row({ cash: 250.5 }),
      row({ cash: 49.5 }),
      row({ cash: 100 }),
      row({ card: 1000, card_receipt_ref_last4: "1234" }),
      row({ card: 2000, card_receipt_ref_last4: "5678" }),
    ]);

    expect(totalFor(summary, "Cash")).toEqual({
      method: "Cash",
      count: 4,
      total: 500,
    });
    expect(totalFor(summary, "Card")).toEqual({
      method: "Card",
      count: 2,
      total: 3000,
    });
    expect(summary.grandTotal).toBe(3500);
    expect(summary.entryCount).toBe(6);
  });

  it("counts a multi-method row once per method", () => {
    const summary = summarizeBookNoteRows([
      row({ cash: 500, card: 1500, card_receipt_ref_last4: "9999" }),
    ]);

    expect(totalFor(summary, "Cash").count).toBe(1);
    expect(totalFor(summary, "Card").count).toBe(1);
    expect(summary.grandTotal).toBe(2000);
  });

  it("counts split rows leg by leg and ignores their zeroed columns", () => {
    const summary = summarizeBookNoteRows([
      row({
        cash: 0,
        card: 0,
        split_lines: [
          {
            paymentMethod: "Card",
            amount: 1200,
            cardLast4: "1111",
            kokoReference: null,
            bankReference: null,
          },
          {
            paymentMethod: "Card",
            amount: 800,
            cardLast4: "2222",
            kokoReference: null,
            bankReference: null,
          },
          {
            paymentMethod: "Cash",
            amount: 500,
            cardLast4: null,
            kokoReference: null,
            bankReference: null,
          },
        ],
      }),
    ]);

    expect(totalFor(summary, "Card")).toEqual({
      method: "Card",
      count: 2,
      total: 2000,
    });
    expect(totalFor(summary, "Cash").count).toBe(1);
    expect(summary.grandTotal).toBe(2500);
  });

  it("covers KOKO and bank transfer", () => {
    const summary = summarizeBookNoteRows([
      row({ koko: 750 }),
      row({ bank_transfer: 1250 }),
    ]);

    expect(totalFor(summary, "KOKO").total).toBe(750);
    expect(totalFor(summary, "Bank Transfer").total).toBe(1250);
    expect(summary.grandTotal).toBe(2000);
  });

  it("returns four zeroed methods for an empty sheet", () => {
    const summary = summarizeBookNoteRows([]);
    expect(summary.methods).toHaveLength(4);
    expect(summary.entryCount).toBe(0);
    expect(summary.grandTotal).toBe(0);
  });
});

describe("mergeBookNoteSummaries", () => {
  it("rolls day summaries into one range total", () => {
    const merged = mergeBookNoteSummaries([
      summarizeBookNoteRows([row({ cash: 100 }), row({ card: 200 })]),
      summarizeBookNoteRows([row({ cash: 50.25 }), row({ koko: 10 })]),
    ]);

    expect(totalFor(merged, "Cash")).toEqual({
      method: "Cash",
      count: 2,
      total: 150.25,
    });
    expect(merged.grandTotal).toBe(360.25);
    expect(merged.entryCount).toBe(4);
  });

  it("handles an empty range", () => {
    const merged = mergeBookNoteSummaries([]);
    expect(merged.grandTotal).toBe(0);
    expect(merged.methods).toHaveLength(4);
  });
});
