import {
  buildContactPhoneSearchOrFilters,
  buildPhoneLookupVariants,
} from "@/lib/phone-lookup";
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

export async function searchContactsByPhone(
  companyId: string,
  phone: string
): Promise<SearchContactsResult> {
  const variants = buildPhoneLookupVariants(phone);
  if (variants.length === 0) {
    return { matches: [], truncated: false };
  }

  const orFilters = buildContactPhoneSearchOrFilters(phone);
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
    },
  });

  const capped = capSearchMatches(rows, CUSTOMER_INSIGHT_SEARCH_CAP);
  return {
    matches: capped.matches.map((row) => ({
      id: row.id,
      name: row.name,
      phoneNumber: row.phoneNumber,
      email: row.email,
    })),
    truncated: capped.truncated,
  };
}
