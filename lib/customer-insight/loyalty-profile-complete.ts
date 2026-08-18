/** Required customer detail fields before loyalty respond / assign send. */

export type LoyaltyProfileFields = {
  name: string | null;
  email: string | null;
  phoneNumber: string | null;
  phones?: string[] | null;
  gender: string | null;
  language: string | null;
  birthMonth: number | null;
  birthDay: number | null;
  city: string | null;
  address: string | null;
};

export const LOYALTY_PROFILE_FIELD_LABELS = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  gender: "Gender",
  language: "Language",
  birthDate: "Birth date (month & day)",
  city: "City",
  address: "Address",
} as const;

function hasPhone(contact: LoyaltyProfileFields): boolean {
  if (contact.phoneNumber?.trim()) return true;
  return (contact.phones ?? []).some((p) => Boolean(p?.trim()));
}

function hasBirthMonthDay(contact: LoyaltyProfileFields): boolean {
  const { birthMonth, birthDay } = contact;
  return (
    birthMonth != null &&
    birthMonth >= 1 &&
    birthMonth <= 12 &&
    birthDay != null &&
    birthDay >= 1 &&
    birthDay <= 31
  );
}

/** Human-readable labels for empty loyalty profile fields. */
export function getLoyaltyProfileMissingFields(contact: LoyaltyProfileFields): string[] {
  const missing: string[] = [];
  if (!contact.name?.trim()) missing.push(LOYALTY_PROFILE_FIELD_LABELS.name);
  if (!contact.email?.trim()) missing.push(LOYALTY_PROFILE_FIELD_LABELS.email);
  if (!hasPhone(contact)) missing.push(LOYALTY_PROFILE_FIELD_LABELS.phone);
  if (!contact.gender?.trim()) missing.push(LOYALTY_PROFILE_FIELD_LABELS.gender);
  if (!contact.language?.trim()) missing.push(LOYALTY_PROFILE_FIELD_LABELS.language);
  if (!hasBirthMonthDay(contact)) {
    missing.push(LOYALTY_PROFILE_FIELD_LABELS.birthDate);
  }
  if (!contact.city?.trim()) missing.push(LOYALTY_PROFILE_FIELD_LABELS.city);
  if (!contact.address?.trim()) missing.push(LOYALTY_PROFILE_FIELD_LABELS.address);
  return missing;
}

export function isLoyaltyProfileComplete(contact: LoyaltyProfileFields): boolean {
  return getLoyaltyProfileMissingFields(contact).length === 0;
}

export function loyaltyProfileIncompleteMessage(missing: string[]): string {
  return `Fill empty customer details: ${missing.join(", ")}`;
}
