/** Shared DTOs for merchant Customer Insight (contracts/customer-insight.md). */

export type LoyaltyTierKey = "standard" | "gold" | "platinum";

export type LoyaltyThresholds = {
  goldMin: number;
  platinumAbove: number;
};

export type LoyaltyDto = {
  key: LoyaltyTierKey;
  label: string;
  code: "loyalcs" | "loyalcs2" | null;
  lifetimeTotal: number;
  currency: string;
  thresholds: LoyaltyThresholds;
};

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

export type UnifiedInvoiceRowDto = {
  id: string;
  source: UnifiedInvoiceSource;
  date: string;
  reference: string;
  status: string;
  amount: number;
  includedInLoyaltyTotal: boolean;
};

export type InvoicePaginationDto = {
  page: number;
  pageSize: number;
  total: number;
};

export type CustomerInsightDto = {
  contact: ContactInsightDto;
  loyalty: LoyaltyDto;
  frequency: FrequencyDto;
  topItems: TopItemDto[];
  series: SeriesPointDto[];
  chartsAvailable: boolean;
  invoices: UnifiedInvoiceRowDto[];
  invoicePagination: InvoicePaginationDto;
};

export const CUSTOMER_INSIGHT_SEARCH_CAP = 10;
export const CUSTOMER_INSIGHT_TOP_ITEMS = 10;
export const CUSTOMER_INSIGHT_CHART_MIN_DOCS = 3;
