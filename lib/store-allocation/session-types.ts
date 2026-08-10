/** Max SKUs in one store allocation session (FR-014). */
export const MAX_STORE_ALLOCATION_SESSION_ITEMS = 50;

export type StoreAllocationPlanStatus = "idle" | "loading" | "ready" | "error";

export type SessionLocationQty = {
  columnKey: string;
  label: string;
  locationRop: number;
  stock: number;
  need: number;
  sales90d: number;
  suggestedQty: number;
  qty: number;
};

export type SessionItem = {
  sku: string;
  barcode: string | null;
  description: string;
  priorityErp1?: string | null;
  priorityErp2?: string | null;
  companyReorderQty: number;
  /** null = blank; 0 = explicit zero (no plan). */
  takeQty: number | null;
  locations: SessionLocationQty[];
  shortShipment: boolean;
  erpAvailable: boolean;
  planStatus: StoreAllocationPlanStatus;
};

export type WalkthroughLine = {
  sku: string;
  description: string;
  qty: number;
};

export type WalkthroughStep = {
  columnKey: string;
  label: string;
  lines: WalkthroughLine[];
  index: number;
  total: number;
};
