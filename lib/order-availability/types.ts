export const ORDER_AVAILABILITY_PERMISSION = "products.order_availability.read";
export const ORDER_AVAILABILITY_MANAGE_PERMISSION = "products.order_availability.manage";

export const PRIORITY_WAREHOUSE_SLOTS = [1, 2, 3, 4] as const;
export type WarehousePriority = (typeof PRIORITY_WAREHOUSE_SLOTS)[number];

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
  /** Typed common SKU that expanded to this variant. Null if the merchant typed this SKU. */
  fromCommonSku: string | null;
};

export type ExpandedLine = NormalizedLine & {
  fromCommonSku: string | null;
};

export type WarehouseStock = {
  warehouse: string;
  available: number;
  priority: WarehousePriority | null;
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
  /** Best (lowest) pinned slot among this company's warehouses. Null = not pinned. */
  warehousePriority: WarehousePriority | null;
  /** Pinned-warehouse companies skip the monthly cap when labelled as options. */
  capExempt: boolean;
  cap: CompanyCap | null;
  option: string | null;
};

export type NoOptionReason =
  | "all_over_cap"
  | "cap_unavailable"
  | "no_coverage"
  | "no_found_skus";

export type PriorityWarehouseSlot = {
  priority: WarehousePriority;
  warehouse: string | null;
  company: string | null;
};

/** Shop-floor stock. Never used for ranking, options, or search cards. */
export type ShopCompanyStock = {
  company: string;
  warehouses: string[];
  /** Keyed by SkuLine.key, found SKUs only. */
  lines: Record<string, CompanyLine>;
};

export type OrderAvailabilityResponse = {
  checkedAt: string;
  capMonth: string;
  lines: SkuLine[];
  notFound: string[];
  unpricedSkus: string[];
  orderValue: number;
  orderValueIsLowerBound: boolean;
  cap: { limit: number; nearThreshold: number; error: string | null };
  priorityWarehouses: Array<{ warehouse: string; priority: WarehousePriority }>;
  companies: CompanyResult[];
  /** Shop warehouses by company. Hidden from search; used in company detail. */
  shopCompanies: ShopCompanyStock[];
  options: string[];
  noOptionReason: NoOptionReason | null;
};

export type DetailSource = {
  company: string;
  warehouse: string;
  available: number;
  priority: WarehousePriority | null;
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
  /** Shop-floor stock for found SKUs that have any shop qty. Separate from main ranking. */
  shops: Array<{
    key: string;
    sku: string;
    qty: number;
    own: WarehouseStock[];
    ownAvailable: number;
    sources: DetailSource[];
  }>;
};
