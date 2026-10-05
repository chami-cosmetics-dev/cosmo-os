import { phoneMatchKeys } from "@/lib/contacts/purchase-summary-export";
import { prisma } from "@/lib/prisma";

const ALLOCATION_MAP_BATCH = 5000;

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

export async function loadAllocatedMerchantByPhone(
  companyId: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.contactMaster.findMany({
      where: {
        companyId,
        AND: [{ assignedMerchant: { not: null } }, { assignedMerchant: { not: "" } }],
      },
      take: ALLOCATION_MAP_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        assignedMerchant: true,
        phoneNumber: true,
        phones: { select: { phoneNumber: true } },
      },
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      indexAllocatedMerchantByPhones(map, row);
    }
    cursor = rows[rows.length - 1]!.id;
    if (rows.length < ALLOCATION_MAP_BATCH) break;
  }

  return map;
}
