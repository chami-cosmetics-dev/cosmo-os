/** ERP ss9 payment_method values (case-sensitive). */
export const BOOK_NOTE_ERP_PAYMENT_METHODS = [
  "Cash",
  "Card",
  "KOKO",
  "MintPay",
  "Bank Transfer",
] as const;

/** Reference field label. MintPay's export has a different, small "Order Id" column. */
export const MINTPAY_ORDER_ID_LABEL =
  "MintPay Order ID (shown in the MintPay app after payment, 7 digits)";

export type BookNoteErpPaymentMethod =
  (typeof BOOK_NOTE_ERP_PAYMENT_METHODS)[number];

export type BookNoteSplitLine = {
  paymentMethod: BookNoteErpPaymentMethod;
  amount: number;
  cardLast4?: string | null;
  kokoReference?: string | null;
  mintpayReference?: string | null;
  bankReference?: string | null;
};

export type BookNoteSplitLineInput = {
  paymentMethod: string;
  amount: unknown;
  cardLast4?: string | null;
  kokoReference?: string | null;
  mintpayReference?: string | null;
  bankReference?: string | null;
};

export type BookNotePaymentColumnsInput = {
  cash: unknown;
  card: unknown;
  cardReceiptRefLast4?: string | null;
  koko: unknown;
  /** Column-mode KOKO order id. Attached to the synthesized KOKO split line. */
  kokoReference?: string | null;
  mintpay: unknown;
  /** Column-mode MintPay Order ID. Attached to the synthesized MintPay split line. */
  mintpayReference?: string | null;
  bankTransfer: unknown;
};

function money(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

function digits4(value: string | null | undefined): string | null {
  const t = (value ?? "").trim();
  return /^\d{4}$/.test(t) ? t : null;
}

function textRef(value: string | null | undefined): string | null {
  const t = (value ?? "").trim();
  return t.length > 0 ? t : null;
}

/** Strip spaces. Keeps digits, #11465305, and ORDER11465305. */
export function normalizeKokoOrderReference(
  value: string | null | undefined,
): string | null {
  const t = (value ?? "").replace(/\s+/g, "");
  return t.length > 0 ? t : null;
}

/**
 * Trim spaces. Keeps an optional leading '#' and leading zeros.
 * ERP strips '#', spaces, and leading zeros itself.
 */
export function normalizeMintpayReference(
  value: string | null | undefined,
): string | null {
  const t = (value ?? "").replace(/\s+/g, "");
  return t.length > 0 ? t : null;
}

/**
 * Soft check only. True when a non-blank ref is not 6–8 digits
 * (optional leading '#'). Do not block submit on this.
 */
export function mintpayReferenceDigitWarning(
  value: string | null | undefined,
): boolean {
  const t = normalizeMintpayReference(value);
  if (!t) return false;
  const digits = t.startsWith("#") ? t.slice(1) : t;
  return !/^\d{6,8}$/.test(digits);
}

export function isBookNoteErpPaymentMethod(
  value: string,
): value is BookNoteErpPaymentMethod {
  return (BOOK_NOTE_ERP_PAYMENT_METHODS as readonly string[]).includes(value);
}

/** True when row should use split_lines ERP payload (2+ legs or explicit split). */
export function bookNoteRowUsesSplitPayload(
  splitLines: BookNoteSplitLine[] | null | undefined,
): boolean {
  return Array.isArray(splitLines) && splitLines.length > 0;
}

/** Convert legacy column amounts into split lines (one per nonzero bucket). */
export function columnsToSplitLines(
  input: BookNotePaymentColumnsInput,
): BookNoteSplitLine[] {
  const lines: BookNoteSplitLine[] = [];
  const cash = money(input.cash);
  const card = money(input.card);
  const koko = money(input.koko);
  const mintpay = money(input.mintpay);
  const bank = money(input.bankTransfer);
  const cardLast4 = digits4(input.cardReceiptRefLast4);

  if (cash > 0) lines.push({ paymentMethod: "Cash", amount: cash });
  if (card > 0) {
    lines.push({
      paymentMethod: "Card",
      amount: card,
      cardLast4,
    });
  }
  if (koko > 0) {
    lines.push({
      paymentMethod: "KOKO",
      amount: koko,
      kokoReference: normalizeKokoOrderReference(input.kokoReference),
    });
  }
  if (mintpay > 0) {
    lines.push({
      paymentMethod: "MintPay",
      amount: mintpay,
      mintpayReference: normalizeMintpayReference(input.mintpayReference),
    });
  }
  if (bank > 0) lines.push({ paymentMethod: "Bank Transfer", amount: bank });

  return lines;
}

/** Sum split lines back into legacy columns (for DB totals / history). */
export function aggregateSplitLines(splitLines: BookNoteSplitLine[]): {
  cash: number;
  card: number;
  koko: number;
  mintpay: number;
  bankTransfer: number;
  cardReceiptRefLast4: string | null;
} {
  let cash = 0;
  let card = 0;
  let koko = 0;
  let mintpay = 0;
  let bankTransfer = 0;
  const cardLast4s: string[] = [];

  for (const line of splitLines) {
    const amt = money(line.amount);
    if (amt <= 0) continue;
    switch (line.paymentMethod) {
      case "Cash":
        cash += amt;
        break;
      case "Card":
        card += amt;
        if (line.cardLast4) cardLast4s.push(line.cardLast4);
        break;
      case "KOKO":
        koko += amt;
        break;
      case "MintPay":
        mintpay += amt;
        break;
      case "Bank Transfer":
        bankTransfer += amt;
        break;
      default:
        break;
    }
  }

  const uniqueLast4 = [...new Set(cardLast4s)];
  return {
    cash: Math.round(cash * 100) / 100,
    card: Math.round(card * 100) / 100,
    koko: Math.round(koko * 100) / 100,
    mintpay: Math.round(mintpay * 100) / 100,
    bankTransfer: Math.round(bankTransfer * 100) / 100,
    cardReceiptRefLast4:
      uniqueLast4.length === 1 ? uniqueLast4[0]! : null,
  };
}

export function rowTotalFromSplitLines(
  splitLines: BookNoteSplitLine[],
): number {
  const agg = aggregateSplitLines(splitLines);
  return Math.round(
    (agg.cash + agg.card + agg.koko + agg.mintpay + agg.bankTransfer) * 100,
  ) / 100;
}

/** Normalize and validate split line inputs from API/UI. */
export function normalizeBookNoteSplitLines(
  raw: BookNoteSplitLineInput[] | null | undefined,
): { ok: true; lines: BookNoteSplitLine[] } | { ok: false; error: string } {
  if (!raw || !Array.isArray(raw)) {
    return { ok: true, lines: [] };
  }

  const lines: BookNoteSplitLine[] = [];
  for (let i = 0; i < raw.length; i++) {
    const sl = raw[i]!;
    const pm = (sl.paymentMethod ?? "").trim();
    if (!isBookNoteErpPaymentMethod(pm)) {
      return {
        ok: false,
        error: `Split line ${i + 1}: payment method must be Cash, Card, KOKO, MintPay, or Bank Transfer`,
      };
    }
    const amount = money(sl.amount);
    if (amount <= 0) continue;

    const cardLast4 =
      pm === "Card" ? digits4(sl.cardLast4) : null;
    if (pm === "Card" && sl.cardLast4?.trim() && !cardLast4) {
      return {
        ok: false,
        error: `Split line ${i + 1}: card last 4 must be exactly 4 digits`,
      };
    }

    lines.push({
      paymentMethod: pm,
      amount,
      cardLast4,
      kokoReference:
        pm === "KOKO" ? normalizeKokoOrderReference(sl.kokoReference) : null,
      mintpayReference:
        pm === "MintPay"
          ? normalizeMintpayReference(sl.mintpayReference)
          : null,
      bankReference:
        pm === "Bank Transfer" ? textRef(sl.bankReference) : null,
    });
  }

  return { ok: true, lines };
}

/** First KOKO split line that has an amount but no order reference. */
export function missingKokoSplitReference(
  lines: Array<{
    paymentMethod: string;
    amount: number;
    kokoReference?: string | null;
  }>,
): number | null {
  for (let i = 0; i < lines.length; i++) {
    const sl = lines[i]!;
    if (
      sl.paymentMethod === "KOKO" &&
      sl.amount > 0 &&
      !normalizeKokoOrderReference(sl.kokoReference)
    ) {
      return i;
    }
  }
  return null;
}

/** First MintPay split line that has an amount but no Order ID. */
export function missingMintpaySplitReference(
  lines: Array<{
    paymentMethod: string;
    amount: number;
    mintpayReference?: string | null;
  }>,
): number | null {
  for (let i = 0; i < lines.length; i++) {
    const sl = lines[i]!;
    if (
      sl.paymentMethod === "MintPay" &&
      sl.amount > 0 &&
      !normalizeMintpayReference(sl.mintpayReference)
    ) {
      return i;
    }
  }
  return null;
}

export type BookNoteErpVerifyRowPayload = {
  idx_no: string;
  sales_invoice: string;
  cash: number;
  card: number;
  card_last_4: string | null;
  koko: number;
  mintpay: number;
  /** Legacy flat key. ERP also reads mintpay_reference on a MintPay split line. */
  mintpay_reference: string | null;
  bank_transfer: number;
  split_lines: Array<{
    payment_method: BookNoteErpPaymentMethod;
    amount: number;
    card_last_4?: string;
    koko_reference?: string;
    mintpay_reference?: string;
    bank_reference?: string;
  }>;
};

/** Build one ss9 rows_json item (legacy columns + split_lines, per ERP contract). */
export function buildBookNoteErpVerifyRow(input: {
  idx_no: string;
  sales_invoice: string;
  cash: number;
  card: number;
  card_last_4?: string | null;
  koko: number;
  /** Column-mode KOKO order id. Used when the row has no explicit split lines. */
  koko_reference?: string | null;
  mintpay: number;
  /** Column-mode MintPay Order ID. Used when the row has no explicit split lines. */
  mintpay_reference?: string | null;
  bank_transfer: number;
  split_lines?: BookNoteSplitLine[] | null;
}): BookNoteErpVerifyRowPayload {
  const explicit = bookNoteRowUsesSplitPayload(input.split_lines)
    ? input.split_lines!
    : null;
  const mintpayReference =
    input.mintpay > 0
      ? normalizeMintpayReference(input.mintpay_reference)
      : null;
  const lines =
    explicit ??
    (input.koko > 0 || input.mintpay > 0
      ? columnsToSplitLines({
          cash: input.cash,
          card: input.card,
          cardReceiptRefLast4: input.card_last_4,
          koko: input.koko,
          kokoReference: input.koko_reference,
          mintpay: input.mintpay,
          mintpayReference,
          bankTransfer: input.bank_transfer,
        })
      : null);
  const split_lines = lines
    ? lines.map((sl) => {
        const line: {
          payment_method: BookNoteErpPaymentMethod;
          amount: number;
          card_last_4?: string;
          koko_reference?: string;
          mintpay_reference?: string;
          bank_reference?: string;
        } = {
          payment_method: sl.paymentMethod,
          amount: sl.amount,
        };
        if (sl.paymentMethod === "Card" && sl.cardLast4) {
          line.card_last_4 = sl.cardLast4;
        }
        if (sl.paymentMethod === "KOKO" && sl.kokoReference) {
          line.koko_reference = sl.kokoReference;
        }
        if (sl.paymentMethod === "MintPay" && sl.mintpayReference) {
          line.mintpay_reference = sl.mintpayReference;
        }
        if (sl.paymentMethod === "Bank Transfer" && sl.bankReference) {
          line.bank_reference = sl.bankReference;
        }
        return line;
      })
    : [];

  return {
    idx_no: input.idx_no,
    sales_invoice: input.sales_invoice,
    cash: input.cash,
    card: input.card,
    card_last_4: input.card_last_4 ?? null,
    koko: input.koko,
    mintpay: input.mintpay,
    mintpay_reference: mintpayReference,
    bank_transfer: input.bank_transfer,
    split_lines,
  };
}

export function parseStoredSplitLines(
  value: unknown,
): BookNoteSplitLine[] | null {
  if (!value || !Array.isArray(value)) return null;
  const normalized = normalizeBookNoteSplitLines(
    value as BookNoteSplitLineInput[],
  );
  if (!normalized.ok || normalized.lines.length === 0) return null;
  return normalized.lines;
}
