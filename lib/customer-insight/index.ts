export {
  LOYALTY_GOLD_MIN,
  LOYALTY_PLATINUM_ABOVE,
  LOYALTY_THRESHOLDS,
  buildLoyaltyDto,
  classifyLoyaltyTierKey,
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
export type * from "@/lib/customer-insight/types";
export {
  CUSTOMER_INSIGHT_CHART_MIN_DOCS,
  CUSTOMER_INSIGHT_SEARCH_CAP,
  CUSTOMER_INSIGHT_TOP_ITEMS,
} from "@/lib/customer-insight/types";
