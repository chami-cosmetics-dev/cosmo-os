import { buildLoyaltyDto } from "@/lib/customer-insight/loyalty-tier";
import type {
  ContactInsightDto,
  CustomerInsightDto,
  FrequencyDto,
  InvoicePaginationDto,
  LoyaltyDto,
  SeriesPointDto,
  TopItemDto,
  UnifiedInvoiceRowDto,
} from "@/lib/customer-insight/types";

export function serializeContactInsight(input: {
  id: string;
  name: string;
  phoneNumber: string | null;
  phones: string[];
  email: string | null;
}): ContactInsightDto {
  return {
    id: input.id,
    name: input.name,
    phoneNumber: input.phoneNumber,
    phones: input.phones,
    email: input.email,
  };
}

export function serializeLoyalty(lifetimeTotal: number, currency = "LKR"): LoyaltyDto {
  return buildLoyaltyDto(lifetimeTotal, currency);
}

export function buildCustomerInsightDto(input: {
  contact: ContactInsightDto;
  loyalty: LoyaltyDto;
  frequency: FrequencyDto;
  topItems: TopItemDto[];
  series: SeriesPointDto[];
  chartsAvailable: boolean;
  invoices: UnifiedInvoiceRowDto[];
  invoicePagination: InvoicePaginationDto;
}): CustomerInsightDto {
  return {
    contact: input.contact,
    loyalty: input.loyalty,
    frequency: input.frequency,
    topItems: input.topItems,
    series: input.series,
    chartsAvailable: input.chartsAvailable,
    invoices: input.invoices,
    invoicePagination: input.invoicePagination,
  };
}
