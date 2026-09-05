import { LIMITS } from "@/lib/validation";

/** Emails merchants often put on customer Adapt invoices — never use for match/fill. */
const SHARED_MERCHANT_EMAILS = new Set([
  "sales@cosmetics.lk",
  "info@lmj.lk",
  "info@cosmetics.lk",
  "shammi@cosmetics.lk",
  "dharshika@cosmetics.lk",
  "ruwini@cosmetics.lk",
  "nirukshi.cosmetics@outlook.com",
  "sachini.cosmetics@outlook.com",
  "ishadi.cosmetics@outlook.com",
  "venushka.cosmetics@outlook.com",
  "sandali.cosmetics@outlook.com",
  "dulshi25.cosmetics@gmail.com",
  "maheshisoysacosmetics@outlook.com",
  "nilmini.cosmetics@gmail.com",
  // Merchant/staff checkout Gmail reused on hundreds of customer Adapt/ERP rows
  "hpg.inoka@gmail.com",
]);

const SHARED_MERCHANT_EMAIL_SUFFIXES = [
  "@cosmetics.lk",
  ".cosmetics@outlook.com",
  ".cosmetics@gmail.com",
];

export function normalizeAdaptEmail(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return trimmed ? trimmed.slice(0, LIMITS.email.max) : null;
}

export function normalizeAdaptPhone(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, LIMITS.mobile.max) : null;
}

export function isSharedMerchantEmail(value: string | null | undefined): boolean {
  const email = value?.trim().toLowerCase() ?? "";
  if (!email) return false;
  if (SHARED_MERCHANT_EMAILS.has(email)) return true;
  return SHARED_MERCHANT_EMAIL_SUFFIXES.some((suffix) => email.endsWith(suffix));
}

/** Prefer real customer email; drop merchant/shared placeholder emails. */
export function adaptEmailForContactUse(value: string | null | undefined): string | null {
  const email = normalizeAdaptEmail(value);
  if (!email || isSharedMerchantEmail(email)) return null;
  return email;
}
