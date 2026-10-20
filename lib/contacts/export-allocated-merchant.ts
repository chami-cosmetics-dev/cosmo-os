import { phoneMatchKeys } from "@/lib/contacts/purchase-summary-export";
import { prisma } from "@/lib/prisma";

export type AllocatedMerchantPhoneSource = {
  assignedMerchant: string | null;
  phoneNumber: string | null;
  phones?: Array<{ phoneNumber: string }>;
};

/** Index allocated contacts so 077… / +94… / secondary phones resolve to one label. */
export function indexAllocatedMerchantByPhones(
  map: Map<string, string>,
  row: AllocatedMerchantPhoneSource
) {
  const label = row.assignedMerchant?.trim();
  if (!label) return;

  const phones = [
    row.phoneNumber,
    ...(row.phones ?? []).map((p) => p.phoneNumber),
  ];
  for (const phone of phones) {
    for (const key of phoneMatchKeys(phone)) {
      if (!map.has(key)) map.set(key, label);
    }
  }
}

export function lookupAllocatedMerchantByPhone(
  map: Map<string, string>,
  phones: Array<string | null | undefined>
): string {
  for (const phone of phones) {
    for (const key of phoneMatchKeys(phone)) {
      const label = map.get(key);
      if (label) return label;
    }
  }
  return "";
}

/**
 * Keep the row's own allocation. If blank, use a phone-matched sibling
 * (same number Insight would find — duplicate row or secondary ContactPhone).
 */
export function resolveExportAssignedMerchant(
  own: string | null | undefined,
  phones: Array<string | null | undefined>,
  map: Map<string, string>
): string {
  const existing = own?.trim();
  if (existing) return existing;
  return lookupAllocatedMerchantByPhone(map, phones);
}

/** Local / +94 / 94 forms for one page of blank-allocation phones. */
export function allocationLookupPhones(
  phones: Array<string | null | undefined>
): string[] {
  const out = new Set<string>();
  for (const phone of phones) {
    const trimmed = phone?.trim();
    if (trimmed) out.add(trimmed);
    for (const key of phoneMatchKeys(phone)) out.add(key);
  }
  return [...out];
}

/**
 * Allocated siblings for a page of phones. Do not scan the whole Contact Master —
 * a full-map preload is what made the ~88k export die mid-stream.
 */
export async function loadAllocatedMerchantByPhone(
  companyId: string,
  phones: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const phoneFilter = allocationLookupPhones(phones);
  if (phoneFilter.length === 0) return map;

  const rows = await prisma.contactMaster.findMany({
    where: {
      companyId,
      AND: [
        { assignedMerchant: { not: null } },
        { assignedMerchant: { not: "" } },
        {
          OR: [
            { phoneNumber: { in: phoneFilter } },
            { phones: { some: { phoneNumber: { in: phoneFilter } } } },
          ],
        },
      ],
    },
    select: {
      assignedMerchant: true,
      phoneNumber: true,
      phones: { select: { phoneNumber: true } },
    },
  });
  for (const row of rows) {
    indexAllocatedMerchantByPhones(map, row);
  }
  return map;
}
