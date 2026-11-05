import {
  customerInsightPurchaseMatchOrderWhere,
  isAdaptAmountExcludedFromSaleTotal,
  isOrderIncludedInCustomerLifetimeTotal,
} from "@/lib/customer-insight/lifetime-total";
import {
  brandFromAdaptLineItem,
  lineMatchesBrand,
} from "@/lib/customer-insight/brand";
import { addFilterMatchSpend } from "@/lib/customer-insight/filter-match-spend";
import {
  forEachIdPage,
  findAllContactsForPurchaseLookup,
} from "@/lib/customer-insight/purchase-scan";
import { emailsForPurchaseLookup } from "@/lib/contact-purchase-lookup";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type ItemPurchaseRank = {
  contactId: string;
  /** Spend on this item only (verified via contact purchase lookup). */
  itemSpend: number;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function labelMatches(itemLabel: string, needle: string): boolean {
  const n = norm(needle);
  const l = norm(itemLabel);
  if (!n || !l) return false;
  return l === n || l.includes(n) || n.includes(l);
}

function skuMatches(sku: string | null | undefined, needle: string): boolean {
  const s = norm(sku ?? "");
  const n = norm(needle);
  if (!s || !n) return false;
  return s === n || s.includes(n) || n.includes(s);
}

function lineSpend(quantity: number, price: string | number): number {
  const q = Number.isFinite(quantity) ? quantity : 0;
  const p =
    typeof price === "number"
      ? price
      : Number.parseFloat(String(price).replace(/,/g, ""));
  if (!Number.isFinite(p)) return 0;
  return q * p;
}

function adaptItemLabel(item: unknown): string {
  if (!item || typeof item !== "object") return "";
  const obj = item as Record<string, unknown>;
  const title = String(obj.itemName ?? obj.productTitle ?? obj.name ?? "").trim();
  const variant = String(obj.variantTitle ?? obj.variant ?? "").trim();
  if (!title) return "";
  return variant ? `${title} — ${variant}` : title;
}

function lineMatchesItem(
  line: {
    productTitle?: string | null;
    variantTitle?: string | null;
    sku?: string | null;
  },
  needle: string
): boolean {
  const title = line.productTitle?.trim() || "Unknown item";
  const variant = line.variantTitle?.trim();
  const label = variant ? `${title} — ${variant}` : title;
  const sku = line.sku?.trim() || "";
  return (
    labelMatches(label, needle) ||
    labelMatches(title, needle) ||
    skuMatches(sku, needle)
  );
}

function adaptLineMatchesItem(
  raw: unknown,
  needle: string,
  brandNeedles: string[] | null
): boolean {
  const label = adaptItemLabel(raw);
  const sku =
    raw && typeof raw === "object"
      ? String(
          (raw as Record<string, unknown>).itemCode ??
            (raw as Record<string, unknown>).sku ??
            ""
        ).trim()
      : "";
  if (!labelMatches(label, needle) && !skuMatches(sku, needle)) return false;
  if (brandNeedles?.length) {
    // Same as brand-only filter: vendor/brand field OR product title word.
    // Vendor is often null on Vault/Shopify lines; title still carries the brand.
    if (
      !brandNeedles.some((brand) =>
        lineMatchesBrand(brand, {
          vendorName: brandFromAdaptLineItem(raw),
          productTitle: label,
        })
      )
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Contacts who purchased the item, ranked by item spend highest first.
 * Full history scan (paged) — no soft take caps that drop older buyers.
 */
export async function findContactsByPurchasedItemRanked(
  companyId: string,
  itemLabel: string,
  brands?: string[] | string | null
): Promise<ItemPurchaseRank[]> {
  const needle = itemLabel.trim();
  if (!needle) return [];
  const brandNeedles = (Array.isArray(brands) ? brands : brands ? [brands] : [])
    .map((b) => b.trim())
    .filter(Boolean);

  const spendByContact = new Map<string, number>();

  await forEachIdPage(
    ({ take, cursor }) =>
      prisma.adaptPurchaseHistory.findMany({
        where: { companyId },
        select: { id: true, contactId: true, lineItems: true, financialStatus: true },
        orderBy: { id: "asc" },
        take,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
    (adaptRows) => {
      for (const row of adaptRows) {
        if (!row.contactId) continue;
        const lines = Array.isArray(row.lineItems) ? row.lineItems : [];
        let spend = 0;
        let matched = false;
        for (const raw of lines) {
          if (
            !adaptLineMatchesItem(
              raw,
              needle,
              brandNeedles.length ? brandNeedles : null
            )
          ) {
            continue;
          }
          matched = true;
          if (isAdaptAmountExcludedFromSaleTotal(row.financialStatus)) continue;
          if (!raw || typeof raw !== "object") continue;
          const obj = raw as Record<string, unknown>;
          spend += lineSpend(
            Number(obj.quantity ?? 0),
            String(obj.unitPrice ?? obj.price ?? "0")
          );
        }
        if (matched) addFilterMatchSpend(spendByContact, row.contactId, spend);
      }
    }
  );

  const titleNeedle = needle.split("—")[0]?.trim() || needle;
  type HitOrder = { phoneVariants: string[]; email: string | null; spend: number };
  const scored: HitOrder[] = [];
  const allPhones = new Set<string>();
  const allEmails = new Set<string>();

  const orderWhere: Prisma.OrderWhereInput = {
    companyId,
    ...customerInsightPurchaseMatchOrderWhere(),
    lineItems: {
      some: {
        productItem: {
          OR: [
            {
              productTitle: {
                contains: titleNeedle,
                mode: "insensitive" as const,
              },
            },
            { sku: { contains: needle, mode: "insensitive" as const } },
          ],
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
          cancelledAt: true,
          financialStatus: true,
          fulfillmentStage: true,
          lineItems: {
            select: {
              quantity: true,
              price: true,
              productItem: {
                select: {
                  productTitle: true,
                  variantTitle: true,
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
        let matchedSpend = 0;
        let matched = false;
        for (const li of order.lineItems) {
          if (
            !lineMatchesItem(
              {
                productTitle: li.productItem.productTitle,
                variantTitle: li.productItem.variantTitle,
                sku: li.productItem.sku,
              },
              needle
            )
          ) {
            continue;
          }
          if (
            brandNeedles.length > 0 &&
            !brandNeedles.some((brand) =>
              lineMatchesBrand(brand, {
                vendorName: li.productItem.vendor?.name,
                productTitle: li.productItem.productTitle,
              })
            )
          ) {
            continue;
          }
          matched = true;
          matchedSpend += lineSpend(li.quantity, li.price.toString());
        }
        if (!matched) continue;
        const spend = isOrderIncludedInCustomerLifetimeTotal(order)
          ? matchedSpend
          : 0;
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
    if (attributed) addFilterMatchSpend(spendByContact, attributed, order.spend);
  }

  return finalize();
}

/** Contact IDs that purchased the given item. */
export async function findContactsByPurchasedItem(
  companyId: string,
  itemLabel: string,
  brands?: string[] | string | null
): Promise<string[]> {
  const ranked = await findContactsByPurchasedItemRanked(
    companyId,
    itemLabel,
    brands
  );
  return ranked.map((r) => r.contactId);
}
