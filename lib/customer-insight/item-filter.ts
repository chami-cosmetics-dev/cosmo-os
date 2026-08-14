import { customerLifetimeTotalOrderWhere } from "@/lib/customer-insight/lifetime-total";
import {
  brandFromAdaptLineItem,
  brandsMatch,
} from "@/lib/customer-insight/brand";
import { emailsForPurchaseLookup } from "@/lib/contact-purchase-lookup";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";

const ITEM_ORDER_CAP = 4_000;
const ITEM_ADAPT_CAP = 6_000;
const ITEM_VERIFY_CAP = 2_000;

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
  const p = typeof price === "number" ? price : Number.parseFloat(String(price).replace(/,/g, ""));
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
    const lineBrand = brandFromAdaptLineItem(raw);
    if (!brandNeedles.some((brand) => brandsMatch(lineBrand, brand))) return false;
  }
  return true;
}

/**
 * Contacts who purchased the item, ranked by item spend highest first.
 * Optional brands scope Cosmo vendor / Adapt brand (any selected brand matches).
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
  const addSpend = (contactId: string, amount: number) => {
    if (!contactId || !(amount > 0)) return;
    spendByContact.set(contactId, (spendByContact.get(contactId) ?? 0) + amount);
  };

  const adaptRows = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId },
    select: { contactId: true, lineItems: true },
    take: ITEM_ADAPT_CAP,
  });
  for (const row of adaptRows) {
    if (!row.contactId) continue;
    const lines = Array.isArray(row.lineItems) ? row.lineItems : [];
    let spend = 0;
    for (const raw of lines) {
      if (!adaptLineMatchesItem(raw, needle, brandNeedles.length ? brandNeedles : null)) continue;
      if (!raw || typeof raw !== "object") continue;
      const obj = raw as Record<string, unknown>;
      spend += lineSpend(
        Number(obj.quantity ?? 0),
        String(obj.unitPrice ?? obj.price ?? "0")
      );
    }
    if (spend > 0) addSpend(row.contactId, spend);
  }

  const titleNeedle = needle.split("—")[0]?.trim() || needle;
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      ...customerLifetimeTotalOrderWhere(),
      lineItems: {
        some: {
          productItem: {
            OR: [
              {
                productTitle: {
                  contains: titleNeedle,
                  mode: "insensitive",
                },
              },
              { sku: { contains: needle, mode: "insensitive" } },
            ],
          },
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
              variantTitle: true,
              sku: true,
              vendor: { select: { name: true } },
            },
          },
        },
      },
    },
    take: ITEM_ORDER_CAP,
  });

  type HitOrder = { phoneVariants: string[]; email: string | null; spend: number };
  const scored: HitOrder[] = [];
  const allPhones = new Set<string>();
  const allEmails = new Set<string>();

  for (const order of orders) {
    let spend = 0;
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

  const orClauses = [];
  if (allPhones.size > 0) {
    const phones = [...allPhones];
    orClauses.push({ phoneNumber: { in: phones } });
    orClauses.push({ phones: { some: { phoneNumber: { in: phones } } } });
  }
  if (allEmails.size > 0) {
    const emails = [...allEmails];
    orClauses.push({ email: { in: emails, mode: "insensitive" as const } });
    orClauses.push({
      emails: { some: { email: { in: emails, mode: "insensitive" as const } } },
    });
  }

  const contacts = await prisma.contactMaster.findMany({
    where: { companyId, OR: orClauses },
    select: {
      id: true,
      phoneNumber: true,
      email: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
    take: ITEM_VERIFY_CAP,
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
