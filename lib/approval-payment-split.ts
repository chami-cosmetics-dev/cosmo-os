export const APPROVAL_SPLIT_KOKO = "koko";
export const APPROVAL_SPLIT_BANK_TRANSFER = "bank_transfer";
export const APPROVAL_SPLIT_CASH = "cash";

export type ApprovalSplitPaymentMethod =
  | typeof APPROVAL_SPLIT_KOKO
  | typeof APPROVAL_SPLIT_BANK_TRANSFER
  | typeof APPROVAL_SPLIT_CASH;

export type ApprovalSplitPairId = "koko_bank" | "koko_cash" | "bank_cash";

export type ApprovalSplitAmountLine = {
  paymentMethod: ApprovalSplitPaymentMethod;
  amount: number;
};

export const APPROVAL_SPLIT_METHODS: ApprovalSplitPaymentMethod[] = [
  APPROVAL_SPLIT_KOKO,
  APPROVAL_SPLIT_BANK_TRANSFER,
  APPROVAL_SPLIT_CASH,
];

export const APPROVAL_SPLIT_PAIRS: Record<
  ApprovalSplitPairId,
  [ApprovalSplitPaymentMethod, ApprovalSplitPaymentMethod]
> = {
  koko_bank: [APPROVAL_SPLIT_KOKO, APPROVAL_SPLIT_BANK_TRANSFER],
  koko_cash: [APPROVAL_SPLIT_KOKO, APPROVAL_SPLIT_CASH],
  bank_cash: [APPROVAL_SPLIT_BANK_TRANSFER, APPROVAL_SPLIT_CASH],
};

export const APPROVAL_SPLIT_PAIR_LABELS: Record<ApprovalSplitPairId, string> = {
  koko_bank: "KOKO + Bank Transfer",
  koko_cash: "KOKO + Cash",
  bank_cash: "Bank Transfer + Cash",
};

const SPLIT_NOTE_PREFIX = "Split Payment";

const SPLIT_NOTE_LABELS: Record<ApprovalSplitPaymentMethod, string> = {
  [APPROVAL_SPLIT_KOKO]: "KOKO",
  [APPROVAL_SPLIT_BANK_TRANSFER]: "Bank Transfer",
  [APPROVAL_SPLIT_CASH]: "Cash",
};

function money(value: number): string {
  return value.toFixed(2);
}

export function toMoneyCents(value: number): number {
  return Math.round(value * 100);
}

export function isApprovalSplitPaymentMethod(
  value: string,
): value is ApprovalSplitPaymentMethod {
  return (APPROVAL_SPLIT_METHODS as string[]).includes(value);
}

export function approvalSplitLineLabel(method: string): string {
  if (method === APPROVAL_SPLIT_KOKO) return SPLIT_NOTE_LABELS[APPROVAL_SPLIT_KOKO];
  if (method === APPROVAL_SPLIT_CASH) return SPLIT_NOTE_LABELS[APPROVAL_SPLIT_CASH];
  if (method === APPROVAL_SPLIT_BANK_TRANSFER) {
    return SPLIT_NOTE_LABELS[APPROVAL_SPLIT_BANK_TRANSFER];
  }
  return method;
}

export function approvalSplitPairId(methods: string[]): ApprovalSplitPairId | null {
  const unique = new Set(methods);
  if (unique.size !== 2) return null;
  for (const [id, pair] of Object.entries(APPROVAL_SPLIT_PAIRS) as Array<
    [ApprovalSplitPairId, [ApprovalSplitPaymentMethod, ApprovalSplitPaymentMethod]]
  >) {
    if (unique.has(pair[0]) && unique.has(pair[1])) return id;
  }
  return null;
}

export function splitIncludesKoko(methods: Iterable<string>): boolean {
  for (const method of methods) {
    if (method === APPROVAL_SPLIT_KOKO) return true;
  }
  return false;
}

export function splitIncludesCash(methods: Iterable<string>): boolean {
  for (const method of methods) {
    if (method === APPROVAL_SPLIT_CASH) return true;
  }
  return false;
}

export function approvalSplitCashCollectAmount(
  lines: Array<{ paymentMethod: string; amount: number | string | { toString(): string } }>,
): number | null {
  if (approvalSplitPairId(lines.map((line) => line.paymentMethod)) == null) return null;
  const cash = lines.find((line) => line.paymentMethod === APPROVAL_SPLIT_CASH);
  if (!cash) return null;
  const amount = Number(cash.amount.toString());
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

export function formatApprovalSplitInvoicePaymentLabel(
  lines: Array<{ paymentMethod: string; amount: number | string | { toString(): string } }>,
): string | null {
  if (approvalSplitPairId(lines.map((line) => line.paymentMethod)) == null) return null;
  const parts = sortApprovalSplitLines(lines).map((line) => {
    const amount = Number(line.amount.toString());
    const formatted = Number.isFinite(amount) ? money(amount) : String(line.amount);
    return `${approvalSplitLineLabel(line.paymentMethod)} ${formatted}`;
  });
  const cash = approvalSplitCashCollectAmount(lines);
  if (cash != null) {
    return `${parts.join(" + ")} — collect cash ${money(cash)}`;
  }
  return parts.join(" + ");
}

function splitMethodOrder(method: ApprovalSplitPaymentMethod): number {
  if (method === APPROVAL_SPLIT_KOKO) return 0;
  if (method === APPROVAL_SPLIT_BANK_TRANSFER) return 1;
  return 2;
}

export function sortApprovalSplitLines<T extends { paymentMethod: string }>(
  lines: T[],
): T[] {
  return [...lines].sort(
    (left, right) =>
      splitMethodOrder(
        isApprovalSplitPaymentMethod(left.paymentMethod)
          ? left.paymentMethod
          : APPROVAL_SPLIT_CASH,
      ) -
      splitMethodOrder(
        isApprovalSplitPaymentMethod(right.paymentMethod)
          ? right.paymentMethod
          : APPROVAL_SPLIT_CASH,
      ),
  );
}

export function validateApprovalSplitAmounts(input: {
  lines: Array<{ paymentMethod: string; amount: number }>;
  invoiceTotal: number;
}): string | null {
  if (input.lines.length !== 2) {
    return "Split payment must use exactly two methods.";
  }
  const methods = input.lines.map((line) => line.paymentMethod);
  if (new Set(methods).size !== 2) {
    return "Split payment methods must be different.";
  }
  if (!approvalSplitPairId(methods)) {
    return "Split payment must be KOKO + Bank Transfer, KOKO + Cash, or Bank Transfer + Cash.";
  }
  if (
    input.lines.some(
      (line) => !Number.isFinite(line.amount) || line.amount <= 0,
    )
  ) {
    return "Both split amounts must be greater than zero.";
  }
  const sumCents = input.lines.reduce(
    (sum, line) => sum + toMoneyCents(line.amount),
    0,
  );
  if (sumCents !== toMoneyCents(input.invoiceTotal)) {
    return "Split payment amounts must equal the invoice total.";
  }
  return null;
}

export function buildApprovalSplitRequestNote(input: {
  lines: ApprovalSplitAmountLine[];
  invoiceTotal: number;
  currency?: string | null;
}): string {
  const currency = input.currency?.trim() || "LKR";
  const ordered = sortApprovalSplitLines(input.lines);
  return [
    `${SPLIT_NOTE_PREFIX} — amount: ${currency} ${money(input.invoiceTotal)}`,
    ...ordered.map(
      (line) =>
        `${approvalSplitLineLabel(line.paymentMethod)}: ${currency} ${money(line.amount)}`,
    ),
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

export function approvalSplitNoteIncludesKoko(
  note: string | null | undefined,
): boolean {
  if (!isApprovalSplitRequestNote(note)) return false;
  return /^KOKO:/im.test(note ?? "");
}

export function parseApprovalSplitRequestNote(
  note: string | null | undefined,
): ApprovalSplitAmountLine[] | null {
  if (!isApprovalSplitRequestNote(note)) return null;
  const lines: ApprovalSplitAmountLine[] = [];
  for (const method of APPROVAL_SPLIT_METHODS) {
    const label = SPLIT_NOTE_LABELS[method];
    const match = note?.match(new RegExp(`^${label}:\\s+\\S+\\s+([\\d,.]+)$`, "im"));
    if (!match) continue;
    const amount = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(amount)) return null;
    lines.push({ paymentMethod: method, amount });
  }
  if (lines.length < 2) return null;
  return lines;
}
