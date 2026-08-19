import {
  buildContactPhoneSearchOrFilters,
  buildPhoneLookupVariants,
  canonicalPhoneForErpCustomerId,
  isCompletePhoneSearch,
  phoneDigitsOnly,
} from "@/lib/phone-lookup";
import { lifetimeTotalsByContactId } from "@/lib/customer-insight/lifetime-totals-batch";
import { pendingLoyaltySuggestion } from "@/lib/customer-insight/loyalty-outreach";
import { prisma } from "@/lib/prisma";
import {
  CUSTOMER_INSIGHT_SEARCH_CAP,
  type SearchMatchDto,
} from "@/lib/customer-insight/types";

export type SearchContactsResult = {
  matches: SearchMatchDto[];
  truncated: boolean;
};

/** Cap raw hits for truncate detection without loading a directory. */
const SEARCH_FETCH_LIMIT = CUSTOMER_INSIGHT_SEARCH_CAP + 1;

/**
 * Pure helper: apply hard cap and truncated flag to an ordered match list.
 * Exported for unit tests.
 */
export function capSearchMatches<T>(rows: T[], cap = CUSTOMER_INSIGHT_SEARCH_CAP): {
  matches: T[];
  truncated: boolean;
} {
  const truncated = rows.length > cap;
  return {
    matches: rows.slice(0, cap),
    truncated,
  };
}

/** Exact-variant filters only — no endsWith / last-4 matching. */
export function buildExactPhoneSearchOrFilters(phone: string): Array<Record<string, unknown>> {
  const variants = buildPhoneLookupVariants(phone);
  if (variants.length === 0) return [];
  return [
    { phoneNumber: { in: variants } },
    { phones: { some: { phoneNumber: { in: variants } } } },
  ];
}

/** True when stored phone is the same number as the query (format-normalized). */
export function phoneNumbersMatch(query: string, stored: string | null | undefined): boolean {
  if (!stored?.trim()) return false;
  const qCanonical = canonicalPhoneForErpCustomerId(query);
  const sCanonical = canonicalPhoneForErpCustomerId(stored);
  if (qCanonical && sCanonical) return qCanonical === sCanonical;

  const qDigits = phoneDigitsOnly(query);
  const sDigits = phoneDigitsOnly(stored);
  if (!qDigits || !sDigits) return false;
  if (qDigits === sDigits) return true;

  // Compare national 9-digit core when one side has country/trunk prefix.
  const national = (d: string) => {
    if (d.length === 10 && d.startsWith("0")) return d.slice(1);
    if (d.length >= 11 && d.startsWith("94")) {
      const rest = d.slice(2);
      return rest.startsWith("0") ? rest.slice(1) : rest;
    }
    return d.length === 9 ? d : d;
  };
  const qn = national(qDigits);
  const sn = national(sDigits);
  return qn.length >= 9 && sn.length >= 9 && qn === sn;
}

export async function searchContactsByPhone(
  companyId: string,
  phone: string
): Promise<SearchContactsResult> {
  const variants = buildPhoneLookupVariants(phone);
  if (variants.length === 0) {
    return { matches: [], truncated: false };
  }

  // Full number → exact variants only (no last-4 endsWith noise).
  // Partial query → allow existing suffix filters for short lookups.
  const complete = isCompletePhoneSearch(phone);
  const orFilters = complete
    ? buildExactPhoneSearchOrFilters(phone)
    : buildContactPhoneSearchOrFilters(phone);
  if (orFilters.length === 0) {
    return { matches: [], truncated: false };
  }

  const rows = await prisma.contactMaster.findMany({
    where: {
      companyId,
      OR: orFilters,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: SEARCH_FETCH_LIMIT,
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      assignedMerchant: true,
      loyaltyAssignedTier: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
  });

  const filtered = complete
    ? rows.filter((row) => {
        if (phoneNumbersMatch(phone, row.phoneNumber)) return true;
        return row.phones.some((p) => phoneNumbersMatch(phone, p.phoneNumber));
      })
    : rows;

  const capped = capSearchMatches(filtered, CUSTOMER_INSIGHT_SEARCH_CAP);
  const lifetimeById = await lifetimeTotalsByContactId(companyId, capped.matches);

  return {
    matches: capped.matches.map((row): SearchMatchDto => {
      const assigned =
        row.loyaltyAssignedTier === "gold" || row.loyaltyAssignedTier === "platinum"
          ? row.loyaltyAssignedTier
          : null;
      const pending = pendingLoyaltySuggestion(
        assigned,
        lifetimeById.get(row.id) ?? 0
      );
      return {
        id: row.id,
        name: row.name,
        phoneNumber: row.phoneNumber,
        email: row.email,
        assignedMerchant: row.assignedMerchant,
        loyaltyAssignedTier: assigned,
        suggestedTier: pending?.suggestedTier ?? null,
        suggestionKind: pending?.kind ?? null,
      };
    }),
    truncated: capped.truncated,
  };
}
