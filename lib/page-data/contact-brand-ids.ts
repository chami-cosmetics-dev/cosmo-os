import {
  brandFromAdaptLineItem,
  brandsMatch,
} from "@/lib/customer-insight/brand";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";

const BRAND_ORDER_CAP = 5_000;
const BRAND_ADAPT_CAP = 8_000;

export type BrandPurchaseRank = {
  contactId: string;
  /** Spend on this brand only (loyalty-eligible Cosmo lines + Adapt matching lines). */
  brandSpend: number;
};

function lineSpend(quantity: number, price: string | number): number {
  const q = Number.isFinite(quantity) ? quantity : 0;
  const p = typeof price === "number" ? price : Number.parseFloat(price);
  if (!Number.isFinite(p)) return 0;
  return q * p;
}

/** Match like dashboard brand sales: vendor equals OR product title contains brand. */
function lineMatchesBrand(
  brand: string,
  input: { vendorName?: string | null; productTitle?: string | null }
): boolean {
  if (brandsMatch(input.vendorName, brand)) return true;
  const title = input.productTitle?.trim().toLowerCase() ?? "";
  const needle = brand.trim().toLowerCase();
  if (!needle || !title) return false;
  return title.includes(needle);
}

function adaptItemMatchesBrand(item: unknown, brand: string): boolean {
  if (brandsMatch(brandFromAdaptLineItem(item), brand)) return true;
  if (!item || typeof item !== "object") return false;
  const obj = item as Record<string, unknown>;
  const name = String(obj.itemName ?? obj.productTitle ?? obj.name ?? "");
  return lineMatchesBrand(brand, { productTitle: name });
}

/**
 * Contacts who purchased the brand, ranked by brand spend (highest first).
 * Example: select "Anua" → customers who bought Anua the most.
 */
export async function findContactsByPurchasedBrandRanked(
  companyId: string,
  brand: string
): Promise<BrandPurchaseRank[]> {
  const needle = brand.trim();
  if (!needle) return [];

  const spendByContact = new Map<string, number>();

  const addSpend = (contactId: string, amount: number) => {
    if (!contactId || !(amount > 0)) return;
    spendByContact.set(contactId, (spendByContact.get(contactId) ?? 0) + amount);
  };

  // Broad fetch: vendor match OR title contains brand (dashboard-style).
  const orders = await prisma.order.findMany({
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

  type OrderSpend = { phoneVariants: string[]; email: string | null; spend: number };
  const orderSpends: OrderSpend[] = [];
  const phoneVariants = new Set<string>();
  const emails = new Set<string>();

  for (const order of orders) {
    let spend = 0;
    for (const li of order.lineItems) {
      if (
        !lineMatchesBrand(needle, {
          vendorName: li.productItem.vendor?.name,
          productTitle: li.productItem.productTitle,
        })
      ) {
        continue;
      }
      spend += lineSpend(li.quantity, li.price.toString());
    }
    if (!(spend > 0)) continue;

    const variants = order.customerPhone?.trim()
      ? buildPhoneLookupVariants(order.customerPhone.trim())
      : [];
    const email = order.customerEmail?.trim().toLowerCase() || null;
    for (const v of variants) phoneVariants.add(v);
    if (email) emails.add(email);
    orderSpends.push({ phoneVariants: variants, email, spend });
  }

  if (orderSpends.length > 0 && (phoneVariants.size > 0 || emails.size > 0)) {
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
                {
                  emails: {
                    some: { email: { in: [...emails], mode: "insensitive" as const } },
                  },
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        phoneNumber: true,
        email: true,
        phones: { select: { phoneNumber: true } },
        emails: { select: { email: true } },
      },
      take: 10_000,
    });

    const contactByPhone = new Map<string, string>();
    const contactByEmail = new Map<string, string>();
    for (const c of matched) {
      const phones = [
        c.phoneNumber,
        ...c.phones.map((p) => p.phoneNumber),
      ].filter(Boolean) as string[];
      for (const phone of phones) {
        for (const v of buildPhoneLookupVariants(phone)) {
          if (!contactByPhone.has(v)) contactByPhone.set(v, c.id);
        }
      }
      const emailList = [
        c.email,
        ...c.emails.map((e) => e.email),
      ]
        .map((e) => e?.trim().toLowerCase())
        .filter(Boolean) as string[];
      for (const email of emailList) {
        if (!contactByEmail.has(email)) contactByEmail.set(email, c.id);
      }
    }

    for (const os of orderSpends) {
      let contactId: string | undefined;
      for (const v of os.phoneVariants) {
        contactId = contactByPhone.get(v);
        if (contactId) break;
      }
      if (!contactId && os.email) contactId = contactByEmail.get(os.email);
      if (contactId) addSpend(contactId, os.spend);
    }
  }

  const adaptRows = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId },
    select: { contactId: true, lineItems: true },
    take: BRAND_ADAPT_CAP,
  });

  for (const row of adaptRows) {
    if (!row.contactId) continue;
    const items = Array.isArray(row.lineItems) ? row.lineItems : [];
    let spend = 0;
    for (const item of items) {
      if (!adaptItemMatchesBrand(item, needle)) continue;
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const qty = Number(obj.quantity ?? 0);
      const price = String(obj.unitPrice ?? obj.price ?? "0");
      spend += lineSpend(qty, price);
    }
    if (spend > 0) addSpend(row.contactId, spend);
  }

  return [...spendByContact.entries()]
    .map(([contactId, brandSpend]) => ({
      contactId,
      brandSpend: Math.round(brandSpend * 100) / 100,
    }))
    .sort((a, b) => b.brandSpend - a.brandSpend);
}

/** Contact IDs that purchased the given brand. */
export async function findContactIdsByPurchasedBrand(
  companyId: string,
  brand: string
): Promise<string[]> {
  const ranked = await findContactsByPurchasedBrandRanked(companyId, brand);
  return ranked.map((r) => r.contactId);
}
