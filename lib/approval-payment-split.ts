export const APPROVAL_SPLIT_KOKO = "koko";
export const APPROVAL_SPLIT_BANK_TRANSFER = "bank_transfer";

export type ApprovalSplitPaymentMethod =
  | typeof APPROVAL_SPLIT_KOKO
  | typeof APPROVAL_SPLIT_BANK_TRANSFER;

export type ApprovalSplitPaymentLine = {
  paymentMethod: ApprovalSplitPaymentMethod;
  amount: number | string | { toString(): string };
};

const SPLIT_NOTE_PREFIX = "Split Payment";

function money(value: number): string {
  return value.toFixed(2);
}

export function toMoneyCents(value: number): number {
  return Math.round(value * 100);
}

export function validateApprovalSplitAmounts(input: {
  kokoAmount: number;
  bankTransferAmount: number;
  invoiceTotal: number;
}): string | null {
  if (
    !Number.isFinite(input.kokoAmount) ||
    !Number.isFinite(input.bankTransferAmount) ||
    input.kokoAmount <= 0 ||
    input.bankTransferAmount <= 0
  ) {
    return "KOKO and Bank Transfer amounts must both be greater than zero.";
  }
  if (
    toMoneyCents(input.kokoAmount) + toMoneyCents(input.bankTransferAmount) !==
    toMoneyCents(input.invoiceTotal)
  ) {
    return "Split payment amounts must equal the invoice total.";
  }
  return null;
}

export function buildApprovalSplitRequestNote(input: {
  kokoAmount: number;
  bankTransferAmount: number;
  invoiceTotal: number;
  currency?: string | null;
}): string {
  const currency = input.currency?.trim() || "LKR";
  return [
    `${SPLIT_NOTE_PREFIX} — amount: ${currency} ${money(input.invoiceTotal)}`,
    `KOKO: ${currency} ${money(input.kokoAmount)}`,
    `Bank Transfer: ${currency} ${money(input.bankTransferAmount)}`,
  ].join("\n");
}

export function buildDefaultOrderPaymentRequestNote(input: {
  paymentType: string;
  invoiceTotal: number | string | { toString(): string };
  currency?: string | null;
}): string {
  const amount = `${input.currency?.trim() ?? ""} ${input.invoiceTotal}`.trim();
  return `${input.paymentType} — amount: ${amount}`;
}

export function isApprovalSplitRequestNote(note: string | null | undefined): boolean {
  return note?.trim().toLowerCase().startsWith(SPLIT_NOTE_PREFIX.toLowerCase()) ?? false;
}

export function parseApprovalSplitRequestNote(
  note: string | null | undefined,
): { kokoAmount: number; bankTransferAmount: number } | null {
  if (!isApprovalSplitRequestNote(note)) return null;
  const kokoMatch = note?.match(/^KOKO:\s+\S+\s+([\d,.]+)$/im);
  const bankMatch = note?.match(/^Bank Transfer:\s+\S+\s+([\d,.]+)$/im);
  if (!kokoMatch || !bankMatch) return null;
  const kokoAmount = Number(kokoMatch[1].replace(/,/g, ""));
  const bankTransferAmount = Number(bankMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(kokoAmount) || !Number.isFinite(bankTransferAmount)) return null;
  return { kokoAmount, bankTransferAmount };
}

export function approvalSplitLineLabel(method: string): string {
  return method === APPROVAL_SPLIT_KOKO ? "KOKO" : "Bank Transfer";
}
