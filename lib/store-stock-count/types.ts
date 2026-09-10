export type SelectableErpCompany = {
  instanceId: string;
  instanceLabel: string;
  erpCompany: string;
};

export type SelectableErpWarehouse = StoreStockCountWarehouseColumn;

/** One company load from POST /items. */
export type StoreStockCountApiItem = {
  sku: string;
  name: string;
  description: string;
  barcodes: string[];
  stock: number;
  stockByWarehouse: Record<string, number>;
};

export type StoreStockCountItemsResponse = {
  instanceId: string;
  instanceLabel: string;
  erpCompany: string;
  items: StoreStockCountApiItem[];
};

/** Client row: one SKU across selected companies. */
export type StoreStockCountRow = {
  sku: string;
  skuKey: string;
  name: string;
  description: string;
  barcodes: string[];
  /** null = unavailable for that company this load */
  stockByCompany: Record<string, number | null>;
};

export type CompanyLoadError = {
  instanceId: string;
  erpCompany: string;
  message: string;
};

export type StoreStockCountSavedItem = StoreStockCountRow & {
  id: string;
  reportId: string;
  stockByWarehouse: Record<string, number | null>;
  stockSum: number | null;
  qbStock: number | null;
  manualCount: number | null;
  updatedAt?: string;
};

export type StoreStockCountReportStatus = "draft" | "submitted";
export type StoreStockCountView = "personal" | "combined";

export type StoreStockCountWarehouseColumn = {
  key: string;
  label: string;
  warehouse: string;
  instanceId: string;
  instanceLabel: string;
  erpCompany: string;
};

export type StoreStockCountSavedReport = {
  id: string;
  title: string;
  status: StoreStockCountReportStatus;
  selectedCompanies: SelectableErpCompany[];
  warehouses: StoreStockCountWarehouseColumn[];
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  submittedByName: string | null;
  countView: StoreStockCountView;
  myCountsSaved: boolean;
  counterCount: number;
  savedCounterCount: number;
  items: StoreStockCountSavedItem[];
};

export type StoreStockCountReportListItem = {
  id: string;
  title: string;
  itemCount: number;
  countedCount: number;
  status: StoreStockCountReportStatus;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  submittedByName: string | null;
};
