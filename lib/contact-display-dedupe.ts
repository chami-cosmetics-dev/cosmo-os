import { buildPhoneLookupVariants } from "@/lib/phone-lookup";

type ContactLike = {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  lastPurchaseAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
};

function contactIdentityKeys(contact: Pick<ContactLike, "email" | "phoneNumber">) {
  const keys: string[] = [];
  const email = contact.email?.trim().toLowerCase();
  if (email) keys.push(`email:${email}`);

  const phone = contact.phoneNumber?.trim();
  if (phone) {
    for (const variant of buildPhoneLookupVariants(phone)) {
      keys.push(`phone:${variant}`);
    }
  }

  return keys;
}

function pickBetterContact<T extends ContactLike>(current: T, candidate: T) {
  if (!current.lastPurchaseAt && candidate.lastPurchaseAt) return candidate;
  if (
    current.lastPurchaseAt &&
    candidate.lastPurchaseAt &&
    candidate.lastPurchaseAt > current.lastPurchaseAt
  ) {
    return candidate;
  }
  if (candidate.updatedAt > current.updatedAt) return candidate;
  return current;
}

export function dedupeContactsForDisplay<T extends ContactLike>(contacts: T[]) {
  const byKey = new Map<string, T>();
  const byId = new Map<string, T>();

  for (const contact of contacts) {
    const keys = contactIdentityKeys(contact);
    const matching = keys.map((key) => byKey.get(key)).find(Boolean);
    const canonical = matching ? pickBetterContact(matching, contact) : contact;

    for (const key of keys) {
      const existing = byKey.get(key);
      byKey.set(key, existing ? pickBetterContact(existing, canonical) : canonical);
    }
  }

  for (const contact of byKey.values()) {
    const existing = byId.get(contact.id);
    byId.set(contact.id, existing ? pickBetterContact(existing, contact) : contact);
  }

  const contactsWithoutIdentifiers = contacts.filter(
    (contact) => contactIdentityKeys(contact).length === 0
  );

  return [...byId.values(), ...contactsWithoutIdentifiers];
}
