import {
  isBookNoteDayLocked,
  type BookNoteWriteAccess,
} from "@/lib/book-notes/lock";
import {
  aggregateSplitLines,
  parseStoredSplitLines,
} from "@/lib/book-notes/split-lines";
import type {
  BookNoteDayDto,
  BookNoteReceiptDto,
  BookNoteRowDto,
} from "@/lib/book-notes/types";

function money(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function postingDateYmd(value: Date | string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  // Date-only fields stored as UTC midnight
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function companyLabelForLocation(location: {
  name: string;
  erpnextCompany?: string | null;
}): string {
  const erp = location.erpnextCompany?.trim();
  return erp || location.name;
}

/** Shop label stored on ERP Book Note Entry.outlet (prefer shortName). */
export function shopLabelForLocation(location: {
  name: string;
  shortName?: string | null;
}): string {
  const short = location.shortName?.trim();
  return short || location.name;
}

export function serializeBookNoteRow(row: {
  idxNo: string;
  salesInvoice: string;
  cash: unknown;
  card: unknown;
  cardReceiptRefLast4?: string | null;
  koko: unknown;
  bankTransfer: unknown;
  splitLines?: unknown;
  orderId?: string | null;
}): BookNoteRowDto {
  const split_lines = parseStoredSplitLines(row.splitLines);
  const fromSplit = split_lines ? aggregateSplitLines(split_lines) : null;
  const cash = fromSplit ? fromSplit.cash : money(row.cash);
  const card = fromSplit ? fromSplit.card : money(row.card);
  const koko = fromSplit ? fromSplit.koko : money(row.koko);
  const bank_transfer = fromSplit ? fromSplit.bankTransfer : money(row.bankTransfer);
  const ref = fromSplit
    ? fromSplit.cardReceiptRefLast4
    : (row.cardReceiptRefLast4?.trim() ?? "");
  const card_receipt_ref_last4 = ref && ref.length > 0 ? ref : null;
  const nonzero = split_lines
    ? split_lines.filter((sl) => sl.amount > 0).length
    : [cash, card, koko, bank_transfer].filter((a) => a > 0).length;
  return {
    idx_no: row.idxNo,
    sales_invoice: row.salesInvoice,
    cash,
    card,
    card_receipt_ref_last4,
    koko,
    bank_transfer,
    row_total: Math.round((cash + card + koko + bank_transfer) * 100) / 100,
    is_multi_method: nonzero > 1,
    split_lines,
    orderId: row.orderId ?? null,
  };
}

export function serializeBookNoteReceipt(receipt: {
  id: string;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
  sortOrder: number;
  createdAt: Date | string;
}): BookNoteReceiptDto {
  return {
    id: receipt.id,
    fileName: receipt.fileName,
    mimeType: receipt.mimeType ?? null,
    fileSize: receipt.fileSize ?? null,
    url: `/api/admin/book-notes/receipts/${receipt.id}`,
    sortOrder: receipt.sortOrder,
    createdAt:
      receipt.createdAt instanceof Date
        ? receipt.createdAt.toISOString()
        : String(receipt.createdAt),
  };
}

export function serializeBookNoteDay(input: {
  id: string;
  companyLocationId: string;
  postingDate: Date | string;
  location: { name: string; erpnextCompany?: string | null };
  rows: Array<{
    idxNo: string;
    salesInvoice: string;
    cash: unknown;
    card: unknown;
    cardReceiptRefLast4?: string | null;
    koko: unknown;
    bankTransfer: unknown;
    splitLines?: unknown;
    orderId?: string | null;
  }>;
  receipts?: Array<{
    id: string;
    fileName: string;
    mimeType?: string | null;
    fileSize?: number | null;
    sortOrder: number;
    createdAt: Date | string;
  }>;
  now?: Date;
  writeAccess?: BookNoteWriteAccess;
}): BookNoteDayDto {
  const posting_date = postingDateYmd(input.postingDate);
  const writeAccess = input.writeAccess ?? { canBackdate: false };
  return {
    id: input.id,
    companyLocationId: input.companyLocationId,
    company: companyLabelForLocation(input.location),
    locationName: input.location.name,
    posting_date,
    locked: isBookNoteDayLocked(posting_date, input.now, writeAccess),
    rows: input.rows.map(serializeBookNoteRow),
    receipts: (input.receipts ?? []).map(serializeBookNoteReceipt),
  };
}

/** UTC midnight Date for a YYYY-MM-DD calendar posting date. */
export function postingDateToUtcMidnight(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}
