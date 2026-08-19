import type { Prisma } from "@prisma/client";

import {
  brandFromAdaptLineItem,
  brandsMatch,
  lineMatchesBrand,
} from "@/lib/customer-insight/brand";
import { emailsForPurchaseLookup } from "@/lib/contact-purchase-lookup";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";

const BRAND_ORDER_CAP = 5_000;
const BRAND_ADAPT_CAP = 8_000;
const BRAND_VERIFY_CAP = 2_000;

export type BrandPurchaseRank = {
  contactId: string;
  /** Spend on this brand only (verified via contact purchase lookup). */
  brandSpend: number;
};

function lineSpend(quantity: number, price: string | number): number {
  const q = Number.isFinite(quantity) ? quantity : 0;
  const p = typeof price === "number" ? price : Number.parseFloat(price);
  if (!Number.isFinite(p)) return 0;
  return q * p;
}

export { lineMatchesBrand } from "@/lib/customer-insight/brand";

function adaptItemMatchesBrand(item: unknown, brand: string): boolean {
  if (brandsMatch(brandFromAdaptLineItem(item), brand)) return true;
  if (!item || typeof item !== "object") return false;
  const obj = item as Record<string, unknown>;
  const name = String(obj.itemName ?? obj.productTitle ?? obj.name ?? "");
  return lineMatchesBrand(brand, { productTitle: name });
}

function sumBrandSpendOnOrderLines(
  brand: string,
  lineItems: Array<{
    quantity: number;
    price: { toString(): string } | string;
    productItem: { productTitle: string; vendor: { name: string } | null };
  }>
): { spend: number; matched: boolean } {
  let spend = 0;
  let matched = false;
  for (const li of lineItems) {
    if (
      !lineMatchesBrand(brand, {
        vendorName: li.productItem.vendor?.name,
        productTitle: li.productItem.productTitle,
      })
    ) {
      continue;
    }
    matched = true;
    spend += lineSpend(li.quantity, li.price.toString());
  }
  return { spend, matched };
}

/**
 * Contacts who actually purchased the brand, ranked by brand spend highest first.
 * Uses whole-word title match + unique phone attribution (same idea as View Purchases).
 */
export async function findContactsByPurchasedBrandRanked(
  companyId: string,
  brand: string
): Promise<BrandPurchaseRank[]> {
  const needle = brand.trim();
  if (!needle) return [];

  const spendByContact = new Map<string, number>();
  const addSpend = (contactId: string, amount: number) => {
    if (!contactId) return;
    const add = Number.isFinite(amount) ? amount : 0;
    spendByContact.set(contactId, (spendByContact.get(contactId) ?? 0) + add);
  };

  // --- Adapt: direct contactId link (trusted) ---
  const adaptRows = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId },
    select: { contactId: true, lineItems: true },
    take: BRAND_ADAPT_CAP,
  });
  for (const row of adaptRows) {
    if (!row.contactId) continue;
    const items = Array.isArray(row.lineItems) ? row.lineItems : [];
    let spend = 0;
    let matched = false;
    for (const item of items) {
      if (!adaptItemMatchesBrand(item, needle)) continue;
      matched = true;
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      spend += lineSpend(
        Number(obj.quantity ?? 0),
        String(obj.unitPrice ?? obj.price ?? "0")
      );
    }
    if (matched) addSpend(row.contactId, spend);
  }

  // --- Cosmo: find brand orders, attribute only via unique phone match ---
  const brandOrders = await prisma.order.findMany({
    where: {
      companyId,
      cancelledAt: null,
      lineItems: {
        some: {
          OR: [
            {
              productItem: {
                vendor: { name: { equals: needle, mode: "insensitive" } },
              },
            },
            {
              productItem: {
                productTitle: { contains: needle, mode: "insensitive" },
              },
            },
          ],
        },
      },
    },
    select: {
      customerPhone: true,
      customerEmail: true,
      lineItems: {
        select: {
          quantity: true,
          price: true,
          productItem: {
            select: {
              productTitle: true,
              vendor: { select: { name: true } },
            },
          },
        },
      },
    },
    take: BRAND_ORDER_CAP,
  });

  type BrandOrder = {
    phoneVariants: string[];
    email: string | null;
    spend: number;
  };
  const scoredOrders: BrandOrder[] = [];
  const allPhoneVariants = new Set<string>();
  const allEmails = new Set<string>();

  for (const order of brandOrders) {
    const { spend, matched } = sumBrandSpendOnOrderLines(needle, order.lineItems);
    if (!matched) continue;
    const phone = order.customerPhone?.trim();
    const variants = phone ? buildPhoneLookupVariants(phone) : [];
    const email = order.customerEmail?.trim().toLowerCase() || null;
    for (const v of variants) allPhoneVariants.add(v);
    if (email) allEmails.add(email);
    scoredOrders.push({ phoneVariants: variants, email, spend });
  }

  const finalize = () =>
    [...spendByContact.entries()]
      .map(([contactId, brandSpend]) => ({
        contactId,
        brandSpend: Math.round(brandSpend * 100) / 100,
      }))
      .sort((a, b) => b.brandSpend - a.brandSpend);

  if (
    scoredOrders.length === 0 ||
    (allPhoneVariants.size === 0 && allEmails.size === 0)
  ) {
    return finalize();
  }

  const orClauses: Prisma.ContactMasterWhereInput[] = [];
  if (allPhoneVariants.size > 0) {
    const phones = [...allPhoneVariants];
    orClauses.push({ phoneNumber: { in: phones } });
    orClauses.push({ phones: { some: { phoneNumber: { in: phones } } } });
  }
  if (allEmails.size > 0) {
    const emails = [...allEmails];
    orClauses.push({ email: { in: emails, mode: "insensitive" } });
    orClauses.push({
      emails: { some: { email: { in: emails, mode: "insensitive" } } },
    });
  }

  const contacts = await prisma.contactMaster.findMany({
    where: {
      companyId,
      OR: orClauses,
    },
    select: {
      id: true,
      phoneNumber: true,
      email: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
    take: BRAND_VERIFY_CAP,
  });

  // variant → set of contact ids (only unique attributions allowed)
  const phoneToContacts = new Map<string, Set<string>>();
  const emailToContacts = new Map<string, Set<string>>();

  for (const c of contacts) {
    const phones = [c.phoneNumber, ...c.phones.map((p) => p.phoneNumber)].filter(
      Boolean
    ) as string[];
    for (const phone of phones) {
      for (const v of buildPhoneLookupVariants(phone)) {
        const set = phoneToContacts.get(v) ?? new Set<string>();
        set.add(c.id);
        phoneToContacts.set(v, set);
      }
    }
    const emails = emailsForPurchaseLookup(
      [c.email, ...c.emails.map((e) => e.email)].filter(Boolean) as string[]
    );
    for (const email of emails) {
      const key = email.trim().toLowerCase();
      const set = emailToContacts.get(key) ?? new Set<string>();
      set.add(c.id);
      emailToContacts.set(key, set);
    }
  }

  for (const order of scoredOrders) {
    let contactId: string | null = null;

    // Prefer phone when present (same rule as View Purchases).
    if (order.phoneVariants.length > 0) {
      const hits = new Set<string>();
      for (const v of order.phoneVariants) {
        const set = phoneToContacts.get(v);
        if (!set) continue;
        for (const id of set) hits.add(id);
      }
      if (hits.size === 1) {
        contactId = [...hits][0]!;
      }
      // Ambiguous or unmatched phone → skip (do not guess via email).
    } else if (order.email) {
      const set = emailToContacts.get(order.email);
      if (set && set.size === 1) {
        contactId = [...set][0]!;
      }
    }

    if (contactId) addSpend(contactId, order.spend);
  }

  return finalize();
}

/** Contact IDs that purchased the given brand. */
export async function findContactIdsByPurchasedBrand(
  companyId: string,
  brand: string
): Promise<string[]> {
  const ranked = await findContactsByPurchasedBrandRanked(companyId, brand);
  return ranked.map((r) => r.contactId);
}
