import {
  brandFromAdaptLineItem,
  brandsMatch,
} from "@/lib/customer-insight/brand";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";

const BRAND_ORDER_CAP = 5_000;
const BRAND_ADAPT_CAP = 8_000;

/**
 * Contact IDs that purchased the given Vendor/brand (Cosmo line vendor name or Adapt line brand).
 * Returns empty array when none match.
 */
export async function findContactIdsByPurchasedBrand(
  companyId: string,
  brand: string
): Promise<string[]> {
  const needle = brand.trim();
  if (!needle) return [];

  const ids = new Set<string>();

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      cancelledAt: null,
      lineItems: {
        some: {
          productItem: {
            vendor: { name: { equals: needle, mode: "insensitive" } },
          },
        },
      },
    },
    select: {
      customerPhone: true,
      customerEmail: true,
    },
    take: BRAND_ORDER_CAP,
  });

  const phoneVariants = new Set<string>();
  const emails = new Set<string>();
  for (const order of orders) {
    const phone = order.customerPhone?.trim();
    if (phone) {
      for (const v of buildPhoneLookupVariants(phone)) phoneVariants.add(v);
    }
    const email = order.customerEmail?.trim().toLowerCase();
    if (email) emails.add(email);
  }

  if (phoneVariants.size > 0 || emails.size > 0) {
    const matched = await prisma.contactMaster.findMany({
      where: {
        companyId,
        OR: [
          ...(phoneVariants.size > 0
            ? [
                { phoneNumber: { in: [...phoneVariants] } },
                { phones: { some: { phoneNumber: { in: [...phoneVariants] } } } },
              ]
            : []),
          ...(emails.size > 0
            ? [
                { email: { in: [...emails], mode: "insensitive" as const } },
                { emails: { some: { email: { in: [...emails], mode: "insensitive" as const } } } },
              ]
            : []),
        ],
      },
      select: { id: true },
      take: 10_000,
    });
    for (const row of matched) ids.add(row.id);
  }

  const adaptRows = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId },
    select: { contactId: true, lineItems: true },
    take: BRAND_ADAPT_CAP,
  });

  for (const row of adaptRows) {
    if (!row.contactId || ids.has(row.contactId)) continue;
    const items = Array.isArray(row.lineItems) ? row.lineItems : [];
    for (const item of items) {
      if (brandsMatch(brandFromAdaptLineItem(item), needle)) {
        ids.add(row.contactId);
        break;
      }
    }
  }

  return [...ids];
}
