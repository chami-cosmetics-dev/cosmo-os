/** Shared CRM preference options for Customer Insight profile. */

export const CONTACT_GENDER_OPTIONS = ["Male", "Female", "N/A"] as const;
export type ContactGenderOption = (typeof CONTACT_GENDER_OPTIONS)[number];

export const CONTACT_LANGUAGE_OPTIONS = ["Sinhala", "Tamil", "English"] as const;
export type ContactLanguageOption = (typeof CONTACT_LANGUAGE_OPTIONS)[number];

export function isContactGenderOption(value: string): value is ContactGenderOption {
  return (CONTACT_GENDER_OPTIONS as readonly string[]).includes(value);
}

export function isContactLanguageOption(
  value: string
): value is ContactLanguageOption {
  return (CONTACT_LANGUAGE_OPTIONS as readonly string[]).includes(value);
}
