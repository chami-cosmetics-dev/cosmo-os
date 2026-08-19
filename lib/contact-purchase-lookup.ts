import { isSharedMerchantEmail } from "@/lib/adapt-import/shared-emails";
import {
  collectContactEmailsSync,
  collectContactPhonesSync,
} from "@/lib/contact-identifiers";

/** Emails safe for order/purchase lookup — drop merchant placeholders. */
export function emailsForPurchaseLookup(emails: string[]): string[] {
  return emails.filter((email) => !isSharedMerchantEmail(email));
}

/**
 * Phone/email keys used to attribute Cosmo orders to a contact.
 * Same rules as `buildContactOrderLookupOr` + identifier collectors.
 */
export function contactOrderLookupKeys(input: {
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  aliasEmails?: string[];
  aliasPhones?: string[];
}): { phones: string[]; emails: string[] } {
  const phones = collectContactPhonesSync(input.primaryPhone, input.aliasPhones ?? []);
  if (phones.length > 0) {
    return { phones, emails: [] };
  }
  return {
    phones: [],
    emails: emailsForPurchaseLookup(
      collectContactEmailsSync(input.primaryEmail, input.aliasEmails ?? [])
    ),
  };
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
