export type WaybillMatchStatus = "matched" | "unmatched";

export type WaybillPendingOrderSummary = {
  id: string;
  displayId: string;
  deliveryCompleteAt: string | null;
  name?: string | null;
  orderNumber?: string | null;
  shopifyOrderId?: string | null;
  erpnextInvoiceId?: string | null;
  sourceName?: string | null;
};

export type WaybillPendingRow = {
  id: string;
  waybillNo: string;
  invoiceNumber: string;
  courierName: string | null;
  matchStatus: WaybillMatchStatus;
  order: WaybillPendingOrderSummary | null;
  uploadFileName: string | null;
  uploadedAt: string | null;
  rawPayload: Record<string, unknown> | null;
  source: string;
};

export type WaybillUploadHistoryRow = {
  id: string;
  fileName: string;
  fileType: string;
  totalRows: number;
  importedRows: number;
  invalidRows: number;
  unmatchedRows: number;
  status: string;
  createdAt: string;
  uploadedBy: { id: string; name: string | null; email: string | null } | null;
};

export type WaybillLookupPagination = {
  page: number;
  limit: number;
  total: number;
};

export type WaybillRematchSummary = {
  attempted: number;
  matched: number;
};

export type CitypakApiWaybillHistoryRow = {
  id: string;
  waybillNo: string;
  invoiceNumber: string;
  courierName: string | null;
  orderId: string | null;
  orderLabel: string | null;
  manual: boolean;
  createdAt: string;
};

/** One CityPak API dispatch run (bulk or single), linked via WaybillUpload. */
export type CitypakApiWaybillBatchRow = {
  id: string;
  label: string;
  bookedCount: number;
  createdAt: string;
  uploadedBy: { id: string; name: string | null; email: string | null } | null;
  waybills: CitypakApiWaybillHistoryRow[];
};

export type WaybillLookupPageData = {
  pending: WaybillPendingRow[];
  pagination: WaybillLookupPagination;
  uploads: WaybillUploadHistoryRow[];
  citypakApiBatches: CitypakApiWaybillBatchRow[];
  rematch: WaybillRematchSummary | null;
  canImport: boolean;
};
