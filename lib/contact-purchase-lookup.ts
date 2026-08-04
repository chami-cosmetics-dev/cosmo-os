import { isSharedMerchantEmail } from "@/lib/adapt-import/shared-emails";

/** Emails safe for order/purchase lookup — drop merchant placeholders. */
export function emailsForPurchaseLookup(emails: string[]): string[] {
  return emails.filter((email) => !isSharedMerchantEmail(email));
}

/**
 * Cosmo order identity for a contact:
 * - phone present → phone only (merchants reuse emails on customer orders)
 * - no phone → customer emails only (shared merchant emails excluded)
 */
export function buildContactOrderLookupOr(input: {
  phones: string[];
  emails: string[];
}): Array<{ customerPhone: { in: string[] } } | { customerEmail: { equals: string; mode: "insensitive" } }> {
  const phones = input.phones.filter(Boolean);
  if (phones.length > 0) {
    return [{ customerPhone: { in: phones } }];
  }

  const emails = emailsForPurchaseLookup(input.emails);
  return emails.map((email) => ({
    customerEmail: { equals: email, mode: "insensitive" as const },
  }));
}
