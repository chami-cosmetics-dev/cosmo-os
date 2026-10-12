import { normalizeContactEmail, normalizeContactPhone } from "@/lib/contact-identifiers";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";

import { REJECT_REASON } from "@/lib/vault-supplement-import/headers";

export type ContactMatchRef = { id: string };

export type ContactResolveResult =
  | { ok: true; action: "create" }
  | { ok: true; action: "match"; contactId: string }
  | { ok: false; reason: string };

const PROFILE_FIELDS = ["name", "phoneNumber", "email", "address", "city", "district"] as const;

export type ContactProfileFields = {
  name?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
};

/** Same customer when phones normalize to one canonical number, else one email. */
export function customerGroupKey(phone: string | null | undefined, email: string | null | undefined): string | null {
  const normalizedPhone = normalizeContactPhone(phone);
  if (normalizedPhone) return `phone:${normalizedPhone}`;
  const normalizedEmail = normalizeContactEmail(email);
  if (normalizedEmail) return `email:${normalizedEmail}`;
  return null;
}

export function phonesAreSameCustomer(left: string, right: string): boolean {
  const a = normalizeContactPhone(left);
  const b = normalizeContactPhone(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const variants = new Set(buildPhoneLookupVariants(a));
  return buildPhoneLookupVariants(b).some((variant) => variants.has(variant));
}

function uniqueIds(matches: ContactMatchRef[]): string[] {
  return [...new Set(matches.map((match) => match.id))];
}

/**
 * Phone first, then email. Reject when the two sides point at different contacts
 * or either side hits more than one contact.
 */
export function resolveContactMatch(input: {
  phoneMatches: ContactMatchRef[];
  emailMatches: ContactMatchRef[];
}): ContactResolveResult {
  const phoneIds = uniqueIds(input.phoneMatches);
  const emailIds = uniqueIds(input.emailMatches);

  if (phoneIds.length > 1) {
    return { ok: false, reason: REJECT_REASON.phoneMany };
  }
  if (emailIds.length > 1) {
    return { ok: false, reason: REJECT_REASON.emailMany };
  }
  if (phoneIds.length === 1 && emailIds.length === 1 && phoneIds[0] !== emailIds[0]) {
    return { ok: false, reason: REJECT_REASON.phoneEmailDiffer };
  }
  if (phoneIds.length === 1) {
    return { ok: true, action: "match", contactId: phoneIds[0]! };
  }
  if (emailIds.length === 1) {
    return { ok: true, action: "match", contactId: emailIds[0]! };
  }
  return { ok: true, action: "create" };
}

/** Fill only empty profile fields. Existing values stay. */
export function fillEmptyContactFields(
  existing: ContactProfileFields,
  incoming: ContactProfileFields,
): ContactProfileFields {
  const out: ContactProfileFields = {};
  for (const key of PROFILE_FIELDS) {
    const current = existing[key];
    const next = incoming[key];
    const currentBlank = current == null || String(current).trim() === "";
    const nextValue = next == null ? "" : String(next).trim();
    if (currentBlank && nextValue) {
      out[key] = nextValue;
    }
  }
  return out;
}
