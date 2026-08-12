import { buildLoyaltyDto } from "@/lib/customer-insight/loyalty-tier";
import { buildProgressBarDto } from "@/lib/customer-insight/progress-bar";
import type {
  ContactInsightDto,
  CustomerInsightDto,
  FrequencyDto,
  InvoicePaginationDto,
  InsightVisibility,
  LoyaltyAssignmentDto,
  LoyaltyDto,
  SeriesPointDto,
  TopItemDto,
  UnifiedInvoiceRowDto,
} from "@/lib/customer-insight/types";
import { toLimitedInsightDto } from "@/lib/customer-insight/visibility";

export function serializeContactInsight(input: {
  id: string;
  name: string;
  phoneNumber: string | null;
  phones: string[];
  email: string | null;
  gender?: string | null;
  language?: string | null;
  address?: string | null;
  birthYear?: number | null;
  birthMonth?: number | null;
  birthDay?: number | null;
  assignedMerchant?: string | null;
  category?: string | null;
}): ContactInsightDto {
  return {
    id: input.id,
    name: input.name,
    phoneNumber: input.phoneNumber,
    phones: input.phones,
    email: input.email,
    gender: input.gender ?? null,
    language: input.language ?? null,
    address: input.address ?? null,
    birthYear: input.birthYear ?? null,
    birthMonth: input.birthMonth ?? null,
    birthDay: input.birthDay ?? null,
    assignedMerchant: input.assignedMerchant ?? null,
    category: input.category ?? null,
  };
}

export function serializeLoyalty(lifetimeTotal: number, currency = "LKR"): LoyaltyDto {
  return buildLoyaltyDto(lifetimeTotal, currency);
}

export function buildCustomerInsightDto(input: {
  visibility: InsightVisibility;
  assignedMerchant: string | null;
  contact: ContactInsightDto;
  loyalty: LoyaltyDto;
  frequency: FrequencyDto;
  topItems: TopItemDto[];
  series: SeriesPointDto[];
  chartsAvailable: boolean;
  invoices: UnifiedInvoiceRowDto[];
  invoicePagination: InvoicePaginationDto;
  lastContactedAt?: string | null;
  canEditProfile?: boolean;
  canMarkContacted?: boolean;
  loyaltyAssignment?: LoyaltyAssignmentDto | null;
  canMergeContacts?: boolean;
}): CustomerInsightDto {
  const owner: CustomerInsightDto = {
    visibility: "owner",
    assignedMerchant: input.assignedMerchant,
    contact: input.contact,
    loyalty: input.loyalty,
    frequency: input.frequency,
    topItems: input.topItems,
    series: input.series,
    chartsAvailable: input.chartsAvailable,
    progressBar: buildProgressBarDto(input.loyalty.lifetimeTotal),
    lastContactedAt: input.lastContactedAt ?? null,
    canEditProfile: input.canEditProfile ?? true,
    canMarkContacted: input.canMarkContacted ?? true,
    loyaltyAssignment: input.loyaltyAssignment ?? null,
    canMergeContacts: input.canMergeContacts ?? false,
    invoices: input.invoices,
    invoicePagination: input.invoicePagination,
  };

  if (input.visibility === "limited") {
    return toLimitedInsightDto(owner);
  }
  return owner;
}
