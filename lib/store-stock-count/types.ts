export type SelectableErpCompany = {
  instanceId: string;
  instanceLabel: string;
  erpCompany: string;
};

/** One company load from POST /items. */
export type StoreStockCountApiItem = {
  sku: string;
  name: string;
  description: string;
  barcodes: string[];
  stock: number;
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
