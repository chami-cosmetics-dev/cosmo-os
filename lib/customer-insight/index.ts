export {
  LOYALTY_GOLD_MIN,
  LOYALTY_PLATINUM_MIN,
  LOYALTY_PLATINUM_ABOVE,
  LOYALTY_THRESHOLDS,
  PUSH_GOLD_MIN,
  PUSH_GOLD_MAX,
  PUSH_PLATINUM_MIN,
  PUSH_PLATINUM_MAX,
  buildLoyaltyDto,
  classifyLoyaltyTierKey,
  isPushToGold,
  isPushToPlatinum,
  loyaltyCode,
  loyaltyLabel,
} from "@/lib/customer-insight/loyalty-tier";
export {
  computeLifetimeTotal,
  sumAdaptTotals,
  sumEligibleOrderTotals,
} from "@/lib/customer-insight/lifetime-total";
export {
  buildCustomerInsightDto,
  serializeContactInsight,
  serializeLoyalty,
} from "@/lib/customer-insight/serialize";
export { capSearchMatches, searchContactsByPhone } from "@/lib/customer-insight/search";
export {
  mapAdaptToInvoiceRow,
  mapOrderToInvoiceRow,
  mergeAndPaginateInvoices,
  invoiceLineDisplayName,
} from "@/lib/customer-insight/invoices";
export { buildFrequencyMetrics } from "@/lib/customer-insight/frequency";
export { aggregateTopItems } from "@/lib/customer-insight/top-items";
export { buildMonthlySeries } from "@/lib/customer-insight/series";
export { loadCustomerInsight } from "@/lib/customer-insight/load";
export {
  isAllocatedOwner,
  insightVisibility,
  viewerMerchantLabels,
  isAdminOrSuperAdmin,
} from "@/lib/customer-insight/ownership";
export { toLimitedInsightDto } from "@/lib/customer-insight/visibility";
export { buildProgressBarDto } from "@/lib/customer-insight/progress-bar";
export {
  getMerchantDisplayName,
  resolveAutoAllocateMerchant,
} from "@/lib/customer-insight/auto-allocate";
export {
  brandFromVendorName,
  brandFromAdaptLineItem,
  brandsMatch,
} from "@/lib/customer-insight/brand";
export { filterAllocatedContacts } from "@/lib/customer-insight/filters";
export { updateContactInsightProfile } from "@/lib/customer-insight/profile";
export {
  markContactInsightContacted,
  getLastContactedAt,
  CONTACTED_ALLOCATION_CATEGORY,
} from "@/lib/customer-insight/contacted";
export type * from "@/lib/customer-insight/types";
export {
  CUSTOMER_INSIGHT_CHART_MIN_DOCS,
  CUSTOMER_INSIGHT_SEARCH_CAP,
  CUSTOMER_INSIGHT_TOP_ITEMS,
  CUSTOMER_INSIGHT_FILTER_PAGE_SIZE_MAX,
} from "@/lib/customer-insight/types";
