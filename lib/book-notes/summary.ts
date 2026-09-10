import {
  BOOK_NOTE_ERP_PAYMENT_METHODS,
  type BookNoteErpPaymentMethod,
} from "@/lib/book-notes/split-lines";
import type { BookNoteRowDto } from "@/lib/book-notes/types";

/** One payment method's entry count and money total across a set of rows. */
export type BookNoteMethodTotal = {
  method: BookNoteErpPaymentMethod;
  /** Payment legs, not invoices — a split row counts once per leg. */
  count: number;
  total: number;
};

export type BookNoteRowsSummary = {
  methods: BookNoteMethodTotal[];
  /** Payment legs across every method. */
  entryCount: number;
  grandTotal: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Per-payment-method totals for saved book note rows.
 *
 * Split rows are counted leg by leg (their columns are zero), so four cash
 * entries and five card entries read as "Cash x4" / "Card x5" and the method
 * totals always add back up to the grand total.
 */
export function summarizeBookNoteRows(
  rows: BookNoteRowDto[],
): BookNoteRowsSummary {
  const acc = new Map<BookNoteErpPaymentMethod, { count: number; total: number }>(
    BOOK_NOTE_ERP_PAYMENT_METHODS.map((m) => [m, { count: 0, total: 0 }]),
  );

  for (const row of rows) {
    if (row.split_lines && row.split_lines.length > 0) {
      for (const line of row.split_lines) {
        const bucket = acc.get(line.paymentMethod);
        const amount = money(line.amount);
        if (!bucket || amount <= 0) continue;
        bucket.count += 1;
        bucket.total += amount;
      }
      continue;
    }

    const legs: [BookNoteErpPaymentMethod, number][] = [
      ["Cash", money(row.cash)],
      ["Card", money(row.card)],
      ["KOKO", money(row.koko)],
      ["Bank Transfer", money(row.bank_transfer)],
    ];
    for (const [method, amount] of legs) {
      if (amount <= 0) continue;
      const bucket = acc.get(method)!;
      bucket.count += 1;
      bucket.total += amount;
    }
  }

  const methods = BOOK_NOTE_ERP_PAYMENT_METHODS.map((method) => ({
    method,
    count: acc.get(method)!.count,
    total: round2(acc.get(method)!.total),
  }));

  return {
    methods,
    entryCount: methods.reduce((sum, m) => sum + m.count, 0),
    grandTotal: round2(methods.reduce((sum, m) => sum + m.total, 0)),
  };
}

/** Roll several day summaries into one range total. */
export function mergeBookNoteSummaries(
  summaries: BookNoteRowsSummary[],
): BookNoteRowsSummary {
  const methods = BOOK_NOTE_ERP_PAYMENT_METHODS.map((method) => {
    let count = 0;
    let total = 0;
    for (const s of summaries) {
      const found = s.methods.find((m) => m.method === method);
      if (!found) continue;
      count += found.count;
      total += found.total;
    }
    return { method, count, total: round2(total) };
  });

  return {
    methods,
    entryCount: methods.reduce((sum, m) => sum + m.count, 0),
    grandTotal: round2(methods.reduce((sum, m) => sum + m.total, 0)),
  };
}
