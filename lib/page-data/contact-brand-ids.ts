import {
  brandFromAdaptLineItem,
  brandsMatch,
  lineMatchesBrand,
} from "@/lib/customer-insight/brand";
import {
  forEachIdPage,
  findAllContactsForPurchaseLookup,
} from "@/lib/customer-insight/purchase-scan";
import { emailsForPurchaseLookup } from "@/lib/contact-purchase-lookup";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";

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
 * Full history scan (paged) — no soft take caps that drop older buyers.
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

  // --- Adapt: direct contactId link (trusted) — all rows ---
  await forEachIdPage(
    ({ take, cursor }) =>
      prisma.adaptPurchaseHistory.findMany({
        where: { companyId },
        select: { id: true, contactId: true, lineItems: true },
        orderBy: { id: "asc" },
        take,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
    (adaptRows) => {
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
    }
  );

  // --- Cosmo: all brand-matching orders, attribute via unique phone/email ---
  type BrandOrder = {
    phoneVariants: string[];
    email: string | null;
    spend: number;
  };
  const scoredOrders: BrandOrder[] = [];
  const allPhoneVariants = new Set<string>();
  const allEmails = new Set<string>();

  const brandOrderWhere = {
    companyId,
    cancelledAt: null,
    lineItems: {
      some: {
        OR: [
          {
            productItem: {
              vendor: { name: { equals: needle, mode: "insensitive" as const } },
            },
          },
          {
            productItem: {
              productTitle: { contains: needle, mode: "insensitive" as const },
            },
          },
        ],
      },
    },
  };

  await forEachIdPage(
    ({ take, cursor }) =>
      prisma.order.findMany({
        where: brandOrderWhere,
        select: {
          id: true,
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
        orderBy: { id: "asc" },
        take,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
    (brandOrders) => {
      for (const order of brandOrders) {
        const { spend, matched } = sumBrandSpendOnOrderLines(
          needle,
          order.lineItems
        );
        if (!matched) continue;
        const phone = order.customerPhone?.trim();
        const variants = phone ? buildPhoneLookupVariants(phone) : [];
        const email = order.customerEmail?.trim().toLowerCase() || null;
        for (const v of variants) allPhoneVariants.add(v);
        if (email) allEmails.add(email);
        scoredOrders.push({ phoneVariants: variants, email, spend });
      }
    }
  );

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

  const contacts = await findAllContactsForPurchaseLookup({
    companyId,
    phoneVariants: [...allPhoneVariants],
    emails: [...allEmails],
  });

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
