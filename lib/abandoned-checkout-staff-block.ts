import { isSharedMerchantEmail, normalizeAdaptEmail } from "@/lib/adapt-import/shared-emails";
import { prisma } from "@/lib/prisma";

/**
 * Abandoned checkouts from staff / shared merchant emails are noise —
 * block ingest and purge existing rows.
 *
 * Matches:
 * - Cosmo OS company users (`User.email`)
 * - Shared merchant/staff checkout emails (`isSharedMerchantEmail`)
 */
export async function loadCompanyStaffEmails(companyId: string): Promise<Set<string>> {
  const users = await prisma.user.findMany({
    where: {
      companyId,
      email: { not: null },
    },
    select: { email: true },
  });

  const emails = new Set<string>();
  for (const user of users) {
    const normalized = normalizeAdaptEmail(user.email);
    if (normalized) emails.add(normalized);
  }
  return emails;
}

export function isBlockedAbandonedCheckoutEmail(
  email: string | null | undefined,
  companyStaffEmails: ReadonlySet<string>
): boolean {
  const normalized = normalizeAdaptEmail(email);
  if (!normalized) return false;
  if (companyStaffEmails.has(normalized)) return true;
  return isSharedMerchantEmail(normalized);
}

/** Delete abandoned checkouts whose customer email is staff/shared-merchant. */
export async function purgeStaffAbandonedCheckouts(companyId: string): Promise<number> {
  const staffEmails = await loadCompanyStaffEmails(companyId);

  const candidates = await prisma.shopifyAbandonedCheckout.findMany({
    where: {
      companyId,
      customerEmail: { not: null },
    },
    select: { id: true, customerEmail: true },
  });

  const ids = candidates
    .filter((row) => isBlockedAbandonedCheckoutEmail(row.customerEmail, staffEmails))
    .map((row) => row.id);

  if (ids.length === 0) return 0;

  const result = await prisma.shopifyAbandonedCheckout.deleteMany({
    where: { companyId, id: { in: ids } },
  });
  return result.count;
}
