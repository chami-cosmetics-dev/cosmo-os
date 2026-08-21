import type {
  CustomerInsightDto,
  UnifiedInvoiceRowDto,
} from "@/lib/customer-insight/types";

/**
 * Limited view (non-allocated merchant, typically exact phone lookup):
 * keep loyalty + invoices with line items + top items.
 * Still hide profile, progress, contacted, spend chart, edit actions.
 */
export function toLimitedInsightDto(full: CustomerInsightDto): CustomerInsightDto {
  return {
    visibility: "limited",
    assignedMerchant: full.assignedMerchant,
    loyalty: full.loyalty,
    loyaltyEligibility: full.loyaltyEligibility ?? null,
    topItems: full.topItems ?? [],
    invoices: full.invoices.map((row) => ({
      ...row,
      // Keep purchase lines for exact-number lookups of other merchants' customers.
      lineItems: row.lineItems,
    })),
    invoicePagination: full.invoicePagination,
    historyScope: full.historyScope ?? null,
  };
}

export function stripInvoiceLineItems(row: UnifiedInvoiceRowDto): UnifiedInvoiceRowDto {
  return {
    ...row,
    lineItems: [],
  };
}

/** Ensure limited payloads never retain owner-only keys. */
export function assertLimitedShape(dto: CustomerInsightDto): CustomerInsightDto {
  if (dto.visibility !== "limited") return dto;
  return toLimitedInsightDto(dto);
}
