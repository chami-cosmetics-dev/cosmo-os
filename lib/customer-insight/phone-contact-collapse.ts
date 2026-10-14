import { canonicalPhoneForErpCustomerId, buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";

export type PhoneLinkedContact = {
  id: string;
  phoneNumber: string | null;
  phones?: Array<{ phoneNumber: string }>;
  updatedAt?: Date | null;
  assignedMerchant?: string | null;
};

const PHONE_VARIANT_CHUNK = 400;

function phoneKey(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  return canonicalPhoneForErpCustomerId(trimmed) ?? trimmed;
}

/** Canonical phones on a contact (primary plus previous / alias numbers). */
export function canonicalPhonesForContact(contact: PhoneLinkedContact): string[] {
  const keys = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const key = phoneKey(raw);
    if (key) keys.add(key);
  };
  add(contact.phoneNumber);
  for (const row of contact.phones ?? []) add(row.phoneNumber);
  return [...keys];
}

function isPhoneSubset(smaller: Set<string>, larger: Set<string>): boolean {
  if (smaller.size > larger.size) return false;
  for (const phone of smaller) {
    if (!larger.has(phone)) return false;
  }
  return true;
}

type PhoneEntry<T> = {
  contact: T;
  phones: Set<string>;
};

function newerProfile<T extends PhoneLinkedContact>(a: PhoneEntry<T>, b: PhoneEntry<T>): boolean {
  const aTime = a.contact.updatedAt?.getTime() ?? 0;
  const bTime = b.contact.updatedAt?.getTime() ?? 0;
  if (aTime !== bTime) return aTime > bTime;
  return a.contact.id < b.contact.id;
}

/**
 * One person, one card. The profile that holds the primary number (and lists
 * the previous number) is kept, including that profile's allocated merchant.
 * A contact that only exists for the previous number is dropped.
 * Same phone set keeps the newer profile.
 */
export function collapsePhoneSubsetContacts<T extends PhoneLinkedContact>(
  contacts: T[]
): { contacts: T[]; absorbedIdsByKeeperId: Map<string, string[]> } {
  const byId = new Map<string, T>();
  for (const contact of contacts) byId.set(contact.id, contact);

  const entries: PhoneEntry<T>[] = [...byId.values()].map((contact) => ({
    contact,
    phones: new Set(canonicalPhonesForContact(contact)),
  }));

  const byPhone = new Map<string, PhoneEntry<T>[]>();
  for (const entry of entries) {
    for (const phone of entry.phones) {
      const list = byPhone.get(phone) ?? [];
      list.push(entry);
      byPhone.set(phone, list);
    }
  }

  const absorbedBy = new Map<string, string>();

  for (const entry of entries) {
    if (entry.phones.size === 0) continue;
    const candidates = new Map<string, PhoneEntry<T>>();
    for (const phone of entry.phones) {
      for (const other of byPhone.get(phone) ?? []) {
        if (other.contact.id !== entry.contact.id) {
          candidates.set(other.contact.id, other);
        }
      }
    }

    let best: PhoneEntry<T> | null = null;
    for (const other of candidates.values()) {
      if (other.phones.size === 0) continue;
      if (!isPhoneSubset(entry.phones, other.phones)) continue;
      if (other.phones.size === entry.phones.size && !newerProfile(other, entry)) continue;
      if (!best) {
        best = other;
        continue;
      }
      if (other.phones.size !== best.phones.size) {
        if (other.phones.size > best.phones.size) best = other;
        continue;
      }
      if (newerProfile(other, best)) best = other;
    }
    if (best) absorbedBy.set(entry.contact.id, best.contact.id);
  }

  const ultimate = (id: string) => {
    const seen = new Set<string>();
    let current = id;
    while (absorbedBy.has(current) && !seen.has(current)) {
      seen.add(current);
      current = absorbedBy.get(current)!;
    }
    return current;
  };

  const absorbedIdsByKeeperId = new Map<string, string[]>();
  for (const absorbedId of absorbedBy.keys()) {
    const root = ultimate(absorbedId);
    if (root === absorbedId) continue;
    const list = absorbedIdsByKeeperId.get(root) ?? [];
    list.push(absorbedId);
    absorbedIdsByKeeperId.set(root, list);
  }

  const absorbedIds = new Set([...absorbedIdsByKeeperId.values()].flat());
  return {
    contacts: [...byId.values()].filter((contact) => !absorbedIds.has(contact.id)),
    absorbedIdsByKeeperId,
  };
}

const ALLOCATION_ID_CHUNK = 500;

/**
 * Primary number keeps its allocated merchant. Previous-number cards do not.
 * Returns true when that other merchant should be cleared.
 */
export function previousMerchantShouldClear(
  primaryMerchant: string | null | undefined,
  previousMerchant: string | null | undefined
): boolean {
  const previous = previousMerchant?.trim() ?? "";
  if (!previous) return false;
  const primary = primaryMerchant?.trim() ?? "";
  return primary.toLowerCase() !== previous.toLowerCase();
}

/** Merchant that stays on the surviving card: the primary number's merchant. */
export function merchantKeptForPrimaryNumber(
  primaryMerchant: string | null | undefined
): string | null {
  const primary = primaryMerchant?.trim() ?? "";
  return primary || null;
}

/**
 * Drop the allocated merchant on previous-number contacts. Does not change the
 * primary contact's merchant. Pending call-queue rows for those contacts go too.
 */
export async function releasePreviousNumberAllocations(
  companyId: string,
  contacts: PhoneLinkedContact[],
  absorbedIdsByKeeperId: Map<string, string[]>
) {
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  const ids: string[] = [];
  for (const [keeperId, absorbedIds] of absorbedIdsByKeeperId) {
    const primaryMerchant = byId.get(keeperId)?.assignedMerchant;
    for (const id of absorbedIds) {
      if (previousMerchantShouldClear(primaryMerchant, byId.get(id)?.assignedMerchant)) {
        ids.push(id);
      }
    }
  }
  if (ids.length === 0) return;

  for (let i = 0; i < ids.length; i += ALLOCATION_ID_CHUNK) {
    const slice = ids.slice(i, i + ALLOCATION_ID_CHUNK);
    await prisma.contactMaster.updateMany({
      where: {
        companyId,
        id: { in: slice },
        AND: [
          { assignedMerchant: { not: null } },
          { assignedMerchant: { not: "" } },
        ],
      },
      data: { assignedMerchant: null },
    });
    await prisma.contactInsightCallQueue.deleteMany({
      where: {
        companyId,
        contactId: { in: slice },
        status: "pending",
      },
    });
  }
}

/** Add amounts that live only on absorbed contacts (Adapt invoices) onto the keeper. */
export function addAbsorbedAmounts(
  totals: Map<string, number>,
  absorbedIdsByKeeperId: Map<string, string[]>,
  extraById: Map<string, number>
) {
  for (const [keeperId, ids] of absorbedIdsByKeeperId) {
    if (!totals.has(keeperId)) continue;
    let extra = 0;
    for (const id of ids) extra += extraById.get(id) ?? 0;
    if (extra) totals.set(keeperId, (totals.get(keeperId) ?? 0) + extra);
  }
}

/** Move per-contact spend from absorbed rows onto the keeper. */
export function transferAbsorbedNumbers(
  valuesById: Map<string, number>,
  absorbedIdsByKeeperId: Map<string, string[]>
) {
  for (const [keeperId, ids] of absorbedIdsByKeeperId) {
    let extra = 0;
    let any = false;
    for (const id of ids) {
      if (!valuesById.has(id)) continue;
      any = true;
      extra += valuesById.get(id) ?? 0;
      valuesById.delete(id);
    }
    if (!any) continue;
    valuesById.set(keeperId, (valuesById.get(keeperId) ?? 0) + extra);
  }
}

export async function findPhoneSharePeers<T extends PhoneLinkedContact>(
  companyId: string,
  contacts: T[]
): Promise<PhoneLinkedContact[]> {
  const known = new Set(contacts.map((contact) => contact.id));
  const variants = new Set<string>();
  for (const contact of contacts) {
    for (const phone of canonicalPhonesForContact(contact)) {
      for (const variant of buildPhoneLookupVariants(phone)) variants.add(variant);
    }
  }
  if (variants.size === 0) return [];

  const variantList = [...variants];
  const peers: PhoneLinkedContact[] = [];
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
        updatedAt: true,
        assignedMerchant: true,
        phones: { select: { phoneNumber: true } },
      },
    });
    for (const row of rows) {
      if (known.has(row.id) || seen.has(row.id)) continue;
      seen.add(row.id);
      peers.push(row);
    }
  }

  return peers;
}

export async function resolveInsightPhoneCluster(
  companyId: string,
  contact: PhoneLinkedContact
): Promise<{ keeperId: string; absorbedIds: string[] }> {
  const peers = await findPhoneSharePeers(companyId, [contact]);
  const collapsed = collapsePhoneSubsetContacts([contact, ...peers]);
  await releasePreviousNumberAllocations(
    companyId,
    [contact, ...peers],
    collapsed.absorbedIdsByKeeperId
  );
  if (collapsed.contacts.some((row) => row.id === contact.id)) {
    return {
      keeperId: contact.id,
      absorbedIds: collapsed.absorbedIdsByKeeperId.get(contact.id) ?? [],
    };
  }

  let keeperId = contact.id;
  for (const [keeper, ids] of collapsed.absorbedIdsByKeeperId) {
    if (ids.includes(contact.id)) {
      keeperId = keeper;
      break;
    }
  }
  return {
    keeperId,
    absorbedIds: collapsed.absorbedIdsByKeeperId.get(keeperId) ?? [],
  };
}
