import type {
  CustomerInsightDto,
  UnifiedInvoiceRowDto,
} from "@/lib/customer-insight/types";

/**
 * Limited view (non-allocated merchant, typically exact phone/name lookup):
 * keep name, phone, email + loyalty + invoices with line items + top items.
 * Still hide full profile, progress, contacted, spend chart, edit actions.
 */
export function toLimitedInsightDto(full: CustomerInsightDto): CustomerInsightDto {
  const contact = full.contact;
  return {
    visibility: "limited",
    assignedMerchant: full.assignedMerchant,
    loyalty: full.loyalty,
    loyaltyEligibility: full.loyaltyEligibility ?? null,
    topItems: full.topItems ?? [],
    contact: contact
      ? {
          id: contact.id,
          name: contact.name,
          phoneNumber: contact.phoneNumber,
          phones: contact.phones ?? [],
          email: contact.email,
          gender: null,
          language: null,
          address: null,
          city: null,
          birthYear: null,
          birthMonth: null,
          birthDay: null,
          assignedMerchant: contact.assignedMerchant,
          category: null,
          lastPurchaseAt: null,
        }
      : undefined,
    invoices: full.invoices.map((row) => ({
      ...row,
      // Keep purchase lines for exact lookups of other merchants' customers.
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
