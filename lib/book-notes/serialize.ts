import { isBookNoteDayLocked } from "@/lib/book-notes/lock";
import type { BookNoteDayDto, BookNoteRowDto } from "@/lib/book-notes/types";

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
  koko: unknown;
  bankTransfer: unknown;
  orderId?: string | null;
}): BookNoteRowDto {
  const cash = money(row.cash);
  const card = money(row.card);
  const koko = money(row.koko);
  const bank_transfer = money(row.bankTransfer);
  const nonzero = [cash, card, koko, bank_transfer].filter((a) => a > 0).length;
  return {
    idx_no: row.idxNo,
    sales_invoice: row.salesInvoice,
    cash,
    card,
    koko,
    bank_transfer,
    row_total: Math.round((cash + card + koko + bank_transfer) * 100) / 100,
    is_multi_method: nonzero > 1,
    orderId: row.orderId ?? null,
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
    koko: unknown;
    bankTransfer: unknown;
    orderId?: string | null;
  }>;
  now?: Date;
}): BookNoteDayDto {
  const posting_date = postingDateYmd(input.postingDate);
  return {
    id: input.id,
    companyLocationId: input.companyLocationId,
    company: companyLabelForLocation(input.location),
    locationName: input.location.name,
    posting_date,
    locked: isBookNoteDayLocked(posting_date, input.now),
    rows: input.rows.map(serializeBookNoteRow),
  };
}

/** UTC midnight Date for a YYYY-MM-DD calendar posting date. */
export function postingDateToUtcMidnight(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}
