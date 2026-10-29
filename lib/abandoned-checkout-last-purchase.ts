import { canonicalPhoneForErpCustomerId, buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";

const PHONE_VARIANT_CHUNK = 400;

export type LastPurchaseContact = {
  id?: string;
  phoneNumber: string | null;
  lastPurchaseAt: Date | null;
  phones?: Array<{ phoneNumber: string }>;
};

/** Canonical 10-digit local phone, else trimmed raw. */
export function canonicalAbandonedCheckoutPhone(
  raw: string | null | undefined
): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  return canonicalPhoneForErpCustomerId(trimmed) ?? trimmed;
}

export function laterPurchaseAt(
  a: Date | null | undefined,
  b: Date | null | undefined
): Date | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/**
 * Map canonical phone → newest ContactMaster.lastPurchaseAt.
 * Multiple contacts on one number keep the later stamp.
 */
export function indexLastPurchaseAtByPhone(
  contacts: LastPurchaseContact[]
): Map<string, Date> {
  const map = new Map<string, Date>();
  for (const contact of contacts) {
    if (!contact.lastPurchaseAt) continue;
    const keys = new Set<string>();
    const add = (raw: string | null | undefined) => {
      const key = canonicalAbandonedCheckoutPhone(raw);
      if (key) keys.add(key);
    };
    add(contact.phoneNumber);
    for (const row of contact.phones ?? []) add(row.phoneNumber);
    for (const key of keys) {
      map.set(key, laterPurchaseAt(map.get(key) ?? null, contact.lastPurchaseAt)!);
    }
  }
  return map;
}

export function lastPurchaseAtForCheckoutPhones(
  index: Map<string, Date>,
  phones: Array<string | null | undefined>
): Date | null {
  let latest: Date | null = null;
  const seen = new Set<string>();
  for (const raw of phones) {
    const key = canonicalAbandonedCheckoutPhone(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    latest = laterPurchaseAt(latest, index.get(key) ?? null);
  }
  return latest;
}

export async function lookupLastPurchaseAtByPhones(
  companyId: string,
  phones: Array<string | null | undefined>
): Promise<Map<string, Date>> {
  const unique = [
    ...new Set(
      phones
        .map((p) => p?.trim() ?? "")
        .filter((p) => p.length > 0)
    ),
  ];
  if (unique.length === 0) return new Map();

  const variants = new Set<string>();
  for (const phone of unique) {
    for (const variant of buildPhoneLookupVariants(phone)) variants.add(variant);
  }
  const variantList = [...variants];
  const contacts: LastPurchaseContact[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < variantList.length; i += PHONE_VARIANT_CHUNK) {
    const chunk = variantList.slice(i, i + PHONE_VARIANT_CHUNK);
    const rows = await prisma.contactMaster.findMany({
      where: {
        companyId,
        OR: [
          { phoneNumber: { in: chunk } },
          { phones: { some: { phoneNumber: { in: chunk } } } },
        ],
      },
      select: {
        id: true,
        phoneNumber: true,
        lastPurchaseAt: true,
        phones: { select: { phoneNumber: true } },
      },
    });
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      contacts.push(row);
    }
  }

  return indexLastPurchaseAtByPhone(contacts);
}
