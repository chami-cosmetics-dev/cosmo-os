import type { BookNoteSplitLine } from "@/lib/book-notes/split-lines";
import type { BookNoteMethodTotal } from "@/lib/book-notes/summary";

export type BookNotePaymentColumns = {
  cash: number;
  card: number;
  koko: number;
  bankTransfer: number;
};

export type { BookNoteSplitLine };

export type BookNoteRowDto = {
  idx_no: string;
  sales_invoice: string;
  cash: number;
  card: number;
  /** Last 4 digits of POS card receipt reference (when card > 0). */
  card_receipt_ref_last4: string | null;
  koko: number;
  bank_transfer: number;
  row_total: number;
  is_multi_method: boolean;
  /** Present when outlet used SPLIT — sent to ERP as split_lines. */
  split_lines: BookNoteSplitLine[] | null;
  orderId?: string | null;
};

/** Day-level receipt photo (whole-day set, not per invoice row). */
export type BookNoteReceiptDto = {
  id: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  /** Authenticated Cosmo proxy URL for preview. */
  url: string;
  sortOrder: number;
  createdAt: string;
};

export type BookNoteDayDto = {
  id: string;
  companyLocationId: string;
  company: string;
  locationName: string;
  posting_date: string;
  locked: boolean;
  rows: BookNoteRowDto[];
  receipts: BookNoteReceiptDto[];
  /**
   * Another merchant already keyed this day at an outlet the viewer is not
   * posted to. Rows and receipts are withheld and the sheet stays read-only so
   * a save cannot replace their entry.
   */
  restricted?: boolean;
  /** Who owns the sheet, shown with the restricted notice. */
  enteredBy?: string | null;
};

export type BookNoteOrderSuggestion = {
  orderId: string;
  salesInvoice: string;
  label: string;
  totalPrice: number;
  cash: number;
  card: number;
  koko: number;
  bankTransfer: number;
  paymentGatewayPrimary: string | null;
  sourceName: string;
};

export type BookNoteLocationOption = {
  id: string;
  name: string;
  shortName: string | null;
  erpnextCompany: string | null;
};

/** Summary row for merchant save-history list. */
export type BookNoteHistoryItem = {
  id: string;
  companyLocationId: string;
  shopName: string;
  posting_date: string;
  rowCount: number;
  grandTotal: number;
  updatedAt: string;
  locked: boolean;
  /** Who last saved the sheet. Merchant history only lists the viewer's own. */
  enteredBy: string | null;
  /** True when the viewer created this sheet. */
  isOwn: boolean;
};

/** Who created or last saved a sheet, for the finance audit column. */
export type BookNoteActor = {
  name: string;
  at: string;
};

/** One book note day as finance reviews it: totals, rows, photos, authorship. */
export type BookNoteFinanceDay = {
  id: string;
  companyLocationId: string;
  shopName: string;
  /** ERPNext company for the shop, when mapped. */
  company: string;
  posting_date: string;
  submittedBy: BookNoteActor | null;
  lastUpdatedBy: BookNoteActor | null;
  rowCount: number;
  methods: BookNoteMethodTotal[];
  entryCount: number;
  grandTotal: number;
  rows: BookNoteRowDto[];
  receipts: BookNoteReceiptDto[];
};

/**
 * One shop's slice of the range. Each shop is its own ERP company here, so
 * this is both the outlet total and the company total — there is no second
 * grouping to make.
 */
export type BookNoteShopTotal = {
  companyLocationId: string;
  shopName: string;
  /** ERPNext company the shop submits under. */
  company: string;
  dayCount: number;
  rowCount: number;
  receiptCount: number;
  methods: BookNoteMethodTotal[];
  grandTotal: number;
};

/** Range roll-up shown above the day list. */
export type BookNoteFinanceSummary = {
  dayCount: number;
  rowCount: number;
  receiptCount: number;
  methods: BookNoteMethodTotal[];
  entryCount: number;
  grandTotal: number;
  /** Same range broken down by shop. */
  shops: BookNoteShopTotal[];
};
