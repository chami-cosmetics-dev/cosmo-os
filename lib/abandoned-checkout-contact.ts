import { prisma } from "@/lib/prisma";

/** Abandoned checkout is only kept when both email and phone are present. */
export function hasAbandonedCheckoutContacts(
  email: string | null | undefined,
  phone: string | null | undefined
): boolean {
  return Boolean(email?.trim() && phone?.trim());
}

/** Delete rows missing email or phone — cannot follow up. */
export async function purgeAbandonedCheckoutsMissingContact(
  companyId: string
): Promise<number> {
  const candidates = await prisma.shopifyAbandonedCheckout.findMany({
    where: { companyId },
    select: { id: true, customerEmail: true, customerPhone: true },
  });

  const ids = candidates
    .filter((row) => !hasAbandonedCheckoutContacts(row.customerEmail, row.customerPhone))
    .map((row) => row.id);

  if (ids.length === 0) return 0;

  const result = await prisma.shopifyAbandonedCheckout.deleteMany({
    where: { companyId, id: { in: ids } },
  });
  return result.count;
}
