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

type RawPayment = { mode_of_payment?: unknown; amount?: unknown };

function extractRawPayments(rawPayload: unknown): RawPayment[] {
  if (!rawPayload || typeof rawPayload !== "object") return [];
  const payments = (rawPayload as { payments?: unknown }).payments;
  if (!Array.isArray(payments)) return [];
  return payments.filter((p): p is RawPayment => !!p && typeof p === "object");
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
  const cols = emptyColumns();
  const rawPayments = extractRawPayments(input.rawPayload);

  if (rawPayments.length > 0) {
    let anyMapped = false;
    for (const p of rawPayments) {
      const amount = toAmount(p.amount);
      if (amount <= 0) continue;
      const mop = typeof p.mode_of_payment === "string" ? p.mode_of_payment : "";
      const bucket = mopToBookNoteBucket(mop) ?? "cash";
      cols[bucket] = Math.round((cols[bucket] + amount) * 100) / 100;
      anyMapped = true;
    }
    if (anyMapped) return cols;
  }

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
