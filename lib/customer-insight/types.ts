/** Shared DTOs for merchant Customer Insight (contracts/insight-allocation-loyalty.md). */

export type LoyaltyTierKey = "standard" | "gold" | "platinum";

export type LoyaltyOutreachStatus =
  | "eligible"
  | "contacted"
  | "responded"
  | "not_responded"
  | "assigned";

export type ContactEventOutcome =
  | "general"
  | "loyalty_informed"
  | "responded"
  | "not_responded";

export type LoyaltyAssignmentDto = {
  tier: "gold" | "platinum";
  assignedAt: string;
  assignedByName: string | null;
  assignedByUserId: string | null;
};

export type LoyaltyThresholds = {
  goldMin: number;
  platinumMin: number;
};

export type LoyaltyDto = {
  key: LoyaltyTierKey;
  label: string;
  code: "loyalcs" | "loyalcs2" | null;
  lifetimeTotal: number;
  currency: string;
  thresholds: LoyaltyThresholds;
};

export type InsightVisibility = "owner" | "limited";

export type SearchMatchDto = {
  id: string;
  name: string;
  phoneNumber: string | null;
  email: string | null;
};

export type ContactInsightDto = {
  id: string;
  name: string;
  phoneNumber: string | null;
  phones: string[];
  email: string | null;
  gender: string | null;
  language: string | null;
  address: string | null;
  city: string | null;
  birthYear: number | null;
  birthMonth: number | null;
  birthDay: number | null;
  assignedMerchant: string | null;
  category: string | null;
  /** ContactMaster.lastPurchaseAt ISO timestamp, or null. */
  lastPurchaseAt: string | null;
};

export type FrequencyDto = {
  orderCount: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  avgDaysBetweenOrders: number | null;
};

export type TopItemDto = {
  name: string;
  quantity: number;
  spend: number;
};

export type SeriesPointDto = {
  month: string;
  spend: number;
  orderCount: number;
};

export type UnifiedInvoiceSource = "order" | "adapt";

export type InvoiceLineDto = {
  id: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  /** Unit price as string (Contact Master purchase table style). */
  price: string;
  brand?: string | null;
};

export type UnifiedInvoiceRowDto = {
  id: string;
  source: UnifiedInvoiceSource;
  date: string;
  reference: string;
  /** Secondary label under Order (order number / Adapt). */
  secondaryLabel: string | null;
  status: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  amount: number;
  currency: string;
  includedInLoyaltyTotal: boolean;
  /** Cosmo order id when source is order; null for Adapt. */
  orderId: string | null;
  lineItems: InvoiceLineDto[];
};

export type InvoicePaginationDto = {
  page: number;
  pageSize: number;
  total: number;
};

export type HistoryScopeDto = {
  brand: string | null;
  item: string | null;
  scopedSpend: number;
};

export type ProgressBarDto = {
  currentTotal: number;
  goldMin: number;
  platinumMin: number;
  amountToNext: number;
  tier: LoyaltyTierKey;
};

/** Full owner insight, or limited fields when visibility is "limited". */
export type CustomerInsightDto = {
  visibility: InsightVisibility;
  assignedMerchant: string | null;
  loyalty: LoyaltyDto;
  invoices: UnifiedInvoiceRowDto[];
  invoicePagination: InvoicePaginationDto;
  /** When opened from brand/item filters — history charts and invoices are scoped. */
  historyScope?: HistoryScopeDto | null;
  /** Owner / admin only */
  contact?: ContactInsightDto;
  frequency?: FrequencyDto;
  topItems?: TopItemDto[];
  series?: SeriesPointDto[];
  chartsAvailable?: boolean;
  progressBar?: ProgressBarDto;
  lastContactedAt?: string | null;
  canEditProfile?: boolean;
  canMarkContacted?: boolean;
  loyaltyAssignment?: LoyaltyAssignmentDto | null;
};

export type AllocatedFilterItemDto = {
  contactId: string;
  name: string;
  phoneNumber: string | null;
  lifetimeTotal: number;
  /** Present when brand filter is applied — spend on that brand only. */
  brandSpend?: number | null;
  /** Present when item filter is applied — spend on that item only. */
  itemSpend?: number | null;
  loyalty: Pick<LoyaltyDto, "key" | "label" | "code">;
  assignedMerchant: string | null;
  /** ContactMaster.lastPurchaseAt ISO timestamp, or null. */
  lastPurchaseAt: string | null;
};

export type AllocatedFilterResultDto = {
  items: AllocatedFilterItemDto[];
  pagination: InvoicePaginationDto;
};

export const CUSTOMER_INSIGHT_SEARCH_CAP = 10;
export const CUSTOMER_INSIGHT_TOP_ITEMS = 10;
export const CUSTOMER_INSIGHT_CHART_MIN_DOCS = 3;
export const CUSTOMER_INSIGHT_FILTER_PAGE_SIZE_MAX = 50;
