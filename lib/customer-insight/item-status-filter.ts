import { customerLifetimeTotalOrderWhere } from "@/lib/customer-insight/lifetime-total";
import {
  brandFromAdaptLineItem,
  brandsMatch,
} from "@/lib/customer-insight/brand";
import type { ItemPurchaseRank } from "@/lib/customer-insight/item-filter";
import {
  forEachIdPage,
  findAllContactsForPurchaseLookup,
} from "@/lib/customer-insight/purchase-scan";
import { emailsForPurchaseLookup } from "@/lib/contact-purchase-lookup";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import {
  PRODUCT_ITEM_STATUS_CATEGORIES,
  type ProductItemStatusCategory,
} from "@/lib/product-item-status";
import { prisma } from "@/lib/prisma";

const STATUS_SET = new Set<string>(PRODUCT_ITEM_STATUS_CATEGORIES);

function lineSpend(quantity: number, price: string | number): number {
  const q = Number.isFinite(quantity) ? quantity : 0;
  const p =
    typeof price === "number"
      ? price
      : Number.parseFloat(String(price).replace(/,/g, ""));
  if (!Number.isFinite(p)) return 0;
  return q * p;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function adaptSku(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const obj = raw as Record<string, unknown>;
  return String(obj.itemCode ?? obj.sku ?? obj.SKU ?? "").trim();
}

export function normalizeInsightItemStatusCategories(
  values: string[] | undefined | null
): ProductItemStatusCategory[] {
  if (!values?.length) return [];
  const out: ProductItemStatusCategory[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const key = raw.trim();
    if (!key || !STATUS_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key as ProductItemStatusCategory);
  }
  return out;
}

/**
 * Contacts who bought products currently marked with the given item status
 * categories (e.g. VAT_TOP_PRIORITY_BRAND), ranked by matching spend.
 * Full history scan (paged) — no soft take caps that drop older buyers.
 */
export async function findContactsByPurchasedItemStatusRanked(
  companyId: string,
  categories: string[],
  brands?: string[] | string | null
): Promise<ItemPurchaseRank[]> {
  const statusCategories = normalizeInsightItemStatusCategories(categories);
  if (statusCategories.length === 0) return [];

  const brandNeedles = (Array.isArray(brands) ? brands : brands ? [brands] : [])
    .map((b) => b.trim())
    .filter(Boolean);

  const spendByContact = new Map<string, number>();
  const addSpend = (contactId: string, amount: number) => {
    if (!contactId || !(amount > 0)) return;
    spendByContact.set(contactId, (spendByContact.get(contactId) ?? 0) + amount);
  };

  const skuSet = new Set<string>();
  await forEachIdPage(
    ({ take, cursor }) =>
      prisma.productItem.findMany({
        where: {
          companyId,
          itemStatusCategory: { in: statusCategories },
        },
        select: {
          id: true,
          sku: true,
          vendor: { select: { name: true } },
        },
        orderBy: { id: "asc" },
        take,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
    (statusProducts) => {
      for (const p of statusProducts) {
        const sku = p.sku?.trim();
        if (!sku) continue;
        if (
          brandNeedles.length > 0 &&
          !brandNeedles.some((brand) => brandsMatch(p.vendor?.name, brand))
        ) {
          continue;
        }
        skuSet.add(norm(sku));
      }
    }
  );

  if (skuSet.size > 0) {
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
          const lines = Array.isArray(row.lineItems) ? row.lineItems : [];
          let spend = 0;
          for (const raw of lines) {
            const sku = adaptSku(raw);
            if (!sku || !skuSet.has(norm(sku))) continue;
            if (brandNeedles.length > 0) {
              const lineBrand = brandFromAdaptLineItem(raw);
              if (!brandNeedles.some((brand) => brandsMatch(lineBrand, brand))) {
                continue;
              }
            }
            if (!raw || typeof raw !== "object") continue;
            const obj = raw as Record<string, unknown>;
            spend += lineSpend(
              Number(obj.quantity ?? 0),
              String(obj.unitPrice ?? obj.price ?? "0")
            );
          }
          if (spend > 0) addSpend(row.contactId, spend);
        }
      }
    );
  }

  const statusCategorySet = new Set<string>(statusCategories);
  type HitOrder = { phoneVariants: string[]; email: string | null; spend: number };
  const scored: HitOrder[] = [];
  const allPhones = new Set<string>();
  const allEmails = new Set<string>();

  const orderWhere = {
    companyId,
    ...customerLifetimeTotalOrderWhere(),
    lineItems: {
      some: {
        productItem: {
          itemStatusCategory: { in: statusCategories },
        },
      },
    },
  };

  await forEachIdPage(
    ({ take, cursor }) =>
      prisma.order.findMany({
        where: orderWhere,
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
                  itemStatusCategory: true,
                  sku: true,
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
    (orders) => {
      for (const order of orders) {
        let spend = 0;
        for (const li of order.lineItems) {
          if (!statusCategorySet.has(li.productItem.itemStatusCategory)) continue;
          if (
            brandNeedles.length > 0 &&
            !brandNeedles.some((brand) =>
              brandsMatch(li.productItem.vendor?.name, brand)
            )
          ) {
            continue;
          }
          spend += lineSpend(li.quantity, li.price.toString());
        }
        if (!(spend > 0)) continue;
        const phone = order.customerPhone?.trim();
        const variants = phone ? buildPhoneLookupVariants(phone) : [];
        const email = order.customerEmail?.trim().toLowerCase() || null;
        for (const v of variants) allPhones.add(v);
        if (email) allEmails.add(email);
        scored.push({ phoneVariants: variants, email, spend });
      }
    }
  );

  const finalize = () =>
    [...spendByContact.entries()]
      .map(([contactId, itemSpend]) => ({
        contactId,
        itemSpend: Math.round(itemSpend * 100) / 100,
      }))
      .sort((a, b) => b.itemSpend - a.itemSpend);

  if (scored.length === 0 || (allPhones.size === 0 && allEmails.size === 0)) {
    return finalize();
  }

  const contacts = await findAllContactsForPurchaseLookup({
    companyId,
    phoneVariants: [...allPhones],
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

  for (const order of scored) {
    let attributed: string | null = null;
    if (order.phoneVariants.length > 0) {
      const hits = new Set<string>();
      for (const v of order.phoneVariants) {
        const set = phoneToContacts.get(v);
        if (!set) continue;
        for (const id of set) hits.add(id);
      }
      if (hits.size === 1) attributed = [...hits][0]!;
    } else if (order.email) {
      const set = emailToContacts.get(order.email);
      if (set && set.size === 1) attributed = [...set][0]!;
    }
    if (attributed) addSpend(attributed, order.spend);
  }

  return finalize();
}
