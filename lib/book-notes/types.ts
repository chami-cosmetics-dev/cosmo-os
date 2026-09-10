import type { BookNoteSplitLine } from "@/lib/book-notes/split-lines";

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
  /** Who last saved the sheet — shown when same-outlet colleagues share history. */
  enteredBy: string | null;
  /** True when the viewer created or last saved this sheet themselves. */
  isOwn: boolean;
};

/** One receipt photo in the finance gallery, with its book-note day context. */
export type BookNoteReceiptGalleryItem = {
  id: string;
  bookNoteDayId: string;
  companyLocationId: string;
  shopName: string;
  posting_date: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  url: string;
  createdAt: string;
};
