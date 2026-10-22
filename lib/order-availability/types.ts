export const ORDER_AVAILABILITY_PERMISSION = "products.order_availability.read";

export const MAX_DISTINCT_SKUS = 50;
export const MAX_RAW_LINES = 200;
export const MAX_LINE_QTY = 100000;

export const DEFAULT_CAP_LKR = 5_000_000;
export const DEFAULT_OPTION_COUNT = 3;
export const NEAR_CAP_RATIO = 0.1;

export type RequestLine = {
  sku: string;
  qty?: number;
};

export type NormalizedLine = {
  key: string;
  sku: string;
  qty: number;
};

export type SkuLine = NormalizedLine & {
  itemCode: string | null;
  itemName: string | null;
  unitPrice: number | null;
  found: boolean;
};

export type WarehouseStock = {
  warehouse: string;
  available: number;
};

export type LineStatus = "covered" | "short" | "missing";

export type CompanyLine = {
  status: LineStatus;
  available: number;
  byWarehouse: WarehouseStock[];
};

export type CapStatus = "ok" | "near" | "would_exceed" | "reached" | "unknown";

export type CompanyCap = {
  usedMtd: number | null;
  orderValue: number;
  headroomAfter: number | null;
  status: CapStatus;
};

export type CompanyResult = {
  company: string;
  warehouses: string[];
  /** Keyed by SkuLine.key, found SKUs only. */
  lines: Record<string, CompanyLine>;
  coveredCount: number;
  shortCount: number;
  missingCount: number;
  totalAvailable: number;
  fullCoverage: boolean;
  cap: CompanyCap | null;
  option: string | null;
};

export type NoOptionReason =
  | "all_over_cap"
  | "cap_unavailable"
  | "no_coverage"
  | "no_found_skus";

export type OrderAvailabilityResponse = {
  checkedAt: string;
  capMonth: string;
  lines: SkuLine[];
  notFound: string[];
  unpricedSkus: string[];
  orderValue: number;
  orderValueIsLowerBound: boolean;
  cap: { limit: number; nearThreshold: number; error: string | null };
  companies: CompanyResult[];
  options: string[];
  noOptionReason: NoOptionReason | null;
};

export type DetailSource = {
  company: string;
  warehouse: string;
  available: number;
};

export type OrderDetail = {
  company: string;
  covered: Array<{ key: string; sku: string; qty: number; byWarehouse: WarehouseStock[] }>;
  toMove: Array<{
    key: string;
    sku: string;
    qty: number;
    status: LineStatus;
    ownAvailable: number;
    sources: DetailSource[];
    availableAnywhere: boolean;
  }>;
};
