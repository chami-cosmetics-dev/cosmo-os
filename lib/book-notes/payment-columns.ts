import {
  aggregateSplitLines,
  type BookNoteErpPaymentMethod,
  type BookNoteSplitLine,
} from "@/lib/book-notes/split-lines";
import type { BookNotePaymentColumns } from "@/lib/book-notes/types";

function toAmount(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function emptyColumns(): BookNotePaymentColumns {
  return { cash: 0, card: 0, koko: 0, bankTransfer: 0 };
}

export type BookNotePaymentBucket = keyof BookNotePaymentColumns;

export type BookNotePaymentLeg = {
  modeOfPayment: string;
  amount: number;
};

export type BookNoteOrderPaymentEntryInput = {
  paymentType?: string | null;
  modeOfPayment?: string | null;
  allocatedAmount?: unknown;
  amount?: unknown;
};

export type BookNotePaymentSuggestion = {
  columns: BookNotePaymentColumns;
  /**
   * Set only when 2+ legs share the same method (two cards, two KOKO).
   * Mixed Cash+Card stays in the four columns — no SPLIT panel.
   */
  splitLines: BookNoteSplitLine[] | null;
};

/** Map ERP/Shopify MOP or gateway string → book-note column. */
export function mopToBookNoteBucket(mop: string | null | undefined): BookNotePaymentBucket | null {
  const low = (mop ?? "").trim().toLowerCase();
  if (!low) return null;

  if (low.includes("koko")) return "koko";

  if (
    low.includes("bank") ||
    low.includes("wire") ||
    low.includes("bank transfer") ||
    low.includes("bank draft")
  ) {
    return "bankTransfer";
  }

  if (
    low.includes("card on delivery") ||
    low === "cc" ||
    low === "cc checkout" ||
    low.includes("cc checkout") ||
    low.includes("webxpay") ||
    low.includes("shopify payments") ||
    low.includes("credit card") ||
    low.includes("visa") ||
    low.includes("mastercard") ||
    low.includes("amex") ||
    (low.includes("card") && !low.includes("discard"))
  ) {
    return "card";
  }

  if (
    low === "cash" ||
    low === "manual" ||
    low === "cod" ||
    low.includes("cash on delivery") ||
    low.includes("cash")
  ) {
    return "cash";
  }

  return null;
}

const BUCKET_TO_ERP_METHOD: Record<BookNotePaymentBucket, BookNoteErpPaymentMethod> = {
  cash: "Cash",
  card: "Card",
  koko: "KOKO",
  bankTransfer: "Bank Transfer",
};

export function mopToBookNoteErpPaymentMethod(
  mop: string | null | undefined,
): BookNoteErpPaymentMethod {
  const bucket = mopToBookNoteBucket(mop) ?? "cash";
  return BUCKET_TO_ERP_METHOD[bucket];
}

type RawPayment = { mode_of_payment?: unknown; amount?: unknown };

function extractRawPayments(rawPayload: unknown): RawPayment[] {
  if (!rawPayload || typeof rawPayload !== "object") return [];
  const payments = (rawPayload as { payments?: unknown }).payments;
  if (!Array.isArray(payments)) return [];
  return payments.filter((p): p is RawPayment => !!p && typeof p === "object");
}

function legsFromRawPayload(rawPayload: unknown): BookNotePaymentLeg[] {
  const legs: BookNotePaymentLeg[] = [];
  for (const p of extractRawPayments(rawPayload)) {
    const amount = toAmount(p.amount);
    if (amount <= 0) continue;
    const mop = typeof p.mode_of_payment === "string" ? p.mode_of_payment : "";
    legs.push({ modeOfPayment: mop, amount });
  }
  return legs;
}

function legsFromPaymentEntries(
  entries: BookNoteOrderPaymentEntryInput[] | null | undefined,
): BookNotePaymentLeg[] {
  if (!entries?.length) return [];
  const legs: BookNotePaymentLeg[] = [];
  for (const pe of entries) {
    if ((pe.paymentType ?? "").trim().toLowerCase() === "pay") continue;
    const amount = toAmount(pe.allocatedAmount ?? pe.amount);
    if (amount <= 0) continue;
    legs.push({
      modeOfPayment: (pe.modeOfPayment ?? "").trim(),
      amount,
    });
  }
  return legs;
}

export function mapPaymentLegsToSplitLines(
  legs: BookNotePaymentLeg[],
): BookNoteSplitLine[] {
  const lines: BookNoteSplitLine[] = [];
  for (const leg of legs) {
    const amount = toAmount(leg.amount);
    if (amount <= 0) continue;
    lines.push({
      paymentMethod: mopToBookNoteErpPaymentMethod(leg.modeOfPayment),
      amount,
    });
  }
  return lines;
}

function sameMethodAppearsTwice(lines: BookNoteSplitLine[]): boolean {
  if (lines.length < 2) return false;
  const methods = new Set(lines.map((line) => line.paymentMethod));
  return methods.size < lines.length;
}

function suggestionFromLegs(legs: BookNotePaymentLeg[]): BookNotePaymentSuggestion | null {
  const splitLines = mapPaymentLegsToSplitLines(legs);
  if (splitLines.length === 0) return null;
  const agg = aggregateSplitLines(splitLines);
  return {
    columns: {
      cash: agg.cash,
      card: agg.card,
      koko: agg.koko,
      bankTransfer: agg.bankTransfer,
    },
    splitLines: sameMethodAppearsTwice(splitLines) ? splitLines : null,
  };
}

/**
 * Map OS order payment data → Cash / Card / KOKO / Bank columns.
 * Prefer rawPayload.payments[]; else single total into primary gateway bucket; else Cash.
 */
export function mapOrderPaymentsToBookNoteColumns(input: {
  totalPrice?: unknown;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
  rawPayload?: unknown;
}): BookNotePaymentColumns {
  return mapOrderPaymentsToBookNoteSuggestion(input).columns;
}

/**
 * Suggestion autofill: prefer synced ERP payment entries, then POS payments[],
 * then the primary gateway total. Same-method duplicate legs return splitLines
 * (SPLIT panel). Different methods fill Cash / Card / KOKO / Bank columns.
 */
export function mapOrderPaymentsToBookNoteSuggestion(input: {
  totalPrice?: unknown;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
  rawPayload?: unknown;
  paymentEntries?: BookNoteOrderPaymentEntryInput[] | null;
}): BookNotePaymentSuggestion {
  const fromPe = suggestionFromLegs(legsFromPaymentEntries(input.paymentEntries));
  if (fromPe) return fromPe;

  const fromRaw = suggestionFromLegs(legsFromRawPayload(input.rawPayload));
  if (fromRaw) return fromRaw;

  return {
    columns: fallbackPrimaryColumns(input),
    splitLines: null,
  };
}

function fallbackPrimaryColumns(input: {
  totalPrice?: unknown;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
}): BookNotePaymentColumns {
  const cols = emptyColumns();
  const total = toAmount(input.totalPrice);
  if (total <= 0) return cols;
  const primary =
    input.paymentGatewayPrimary?.trim() ||
    input.paymentGatewayNames?.find((n) => n?.trim())?.trim() ||
    "";
  const bucket = mopToBookNoteBucket(primary) ?? "cash";
  cols[bucket] = total;
  return cols;
}
