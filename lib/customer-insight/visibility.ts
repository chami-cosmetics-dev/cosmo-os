import type {
  CustomerInsightDto,
  UnifiedInvoiceRowDto,
} from "@/lib/customer-insight/types";

/** Strip owner-only fields and invoice line items for limited viewers. */
export function toLimitedInsightDto(full: CustomerInsightDto): CustomerInsightDto {
  return {
    visibility: "limited",
    assignedMerchant: full.assignedMerchant,
    loyalty: full.loyalty,
    loyaltyEligibility: full.loyaltyEligibility ?? null,
    invoices: full.invoices.map(stripInvoiceLineItems),
    invoicePagination: full.invoicePagination,
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
