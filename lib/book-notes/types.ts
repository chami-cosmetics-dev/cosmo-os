export type BookNotePaymentColumns = {
  cash: number;
  card: number;
  koko: number;
  bankTransfer: number;
};

export type BookNoteRowDto = {
  idx_no: string;
  sales_invoice: string;
  cash: number;
  card: number;
  koko: number;
  bank_transfer: number;
  row_total: number;
  is_multi_method: boolean;
  orderId?: string | null;
};

export type BookNoteDayDto = {
  id: string;
  companyLocationId: string;
  company: string;
  locationName: string;
  posting_date: string;
  locked: boolean;
  rows: BookNoteRowDto[];
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
  posting_date: string;
  rowCount: number;
  grandTotal: number;
  updatedAt: string;
  locked: boolean;
};
