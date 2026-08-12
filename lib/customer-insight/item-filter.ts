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

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function labelMatches(itemLabel: string, needle: string): boolean {
  const n = norm(needle);
  const l = norm(itemLabel);
  if (!n || !l) return false;
  return l === n || l.includes(n) || n.includes(l);
}

function adaptItemLabel(item: unknown): string {
  if (!item || typeof item !== "object") return "";
  const obj = item as Record<string, unknown>;
  const title = String(obj.itemName ?? obj.productTitle ?? obj.name ?? "").trim();
  const variant = String(obj.variantTitle ?? obj.variant ?? "").trim();
  if (!title) return "";
  return variant ? `${title} — ${variant}` : title;
}

/**
 * Contact IDs that purchased the given item (case-insensitive label match).
 * Optional brand scopes Cosmo vendor / Adapt brand.
 */
export async function findContactsByPurchasedItem(
  companyId: string,
  itemLabel: string,
  brand?: string | null
): Promise<string[]> {
  const needle = itemLabel.trim();
  if (!needle) return [];
  const brandNeedle = brand?.trim() || null;
  const hits = new Set<string>();

  const adaptRows = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId },
    select: { contactId: true, lineItems: true },
    take: ITEM_ADAPT_CAP,
  });
  for (const row of adaptRows) {
    const lines = Array.isArray(row.lineItems) ? row.lineItems : [];
    for (const raw of lines) {
      const label = adaptItemLabel(raw);
      if (!labelMatches(label, needle)) continue;
      if (brandNeedle && !brandsMatch(brandFromAdaptLineItem(raw), brandNeedle)) {
        continue;
      }
      hits.add(row.contactId);
      break;
    }
  }

  const orders = await prisma.order.findMany({
    where: {
      companyId,
      cancelledAt: null,
      lineItems: {
        some: {
          productItem: {
            productTitle: { contains: needle.split("—")[0]?.trim() || needle, mode: "insensitive" },
          },
        },
      },
    },
    select: {
      customerPhone: true,
      customerEmail: true,
      lineItems: {
        select: {
          productItem: {
            select: {
              productTitle: true,
              variantTitle: true,
              vendor: { select: { name: true } },
            },
          },
        },
      },
    },
    take: ITEM_ORDER_CAP,
  });

  type HitOrder = { phoneVariants: string[]; email: string | null };
  const scored: HitOrder[] = [];
  const allPhones = new Set<string>();
  const allEmails = new Set<string>();

  for (const order of orders) {
    let matched = false;
    for (const li of order.lineItems) {
      const title = li.productItem.productTitle?.trim() || "Unknown item";
      const variant = li.productItem.variantTitle?.trim();
      const label = variant ? `${title} — ${variant}` : title;
      if (!labelMatches(label, needle) && !labelMatches(title, needle)) continue;
      if (
        brandNeedle &&
        !brandsMatch(li.productItem.vendor?.name, brandNeedle)
      ) {
        continue;
      }
      matched = true;
      break;
    }
    if (!matched) continue;
    const phone = order.customerPhone?.trim();
    const variants = phone ? buildPhoneLookupVariants(phone) : [];
    const email = order.customerEmail?.trim().toLowerCase() || null;
    for (const v of variants) allPhones.add(v);
    if (email) allEmails.add(email);
    scored.push({ phoneVariants: variants, email });
  }

  if (scored.length === 0 || (allPhones.size === 0 && allEmails.size === 0)) {
    return [...hits];
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
    for (const v of order.phoneVariants) {
      const set = phoneToContacts.get(v);
      if (set && set.size === 1) {
        attributed = [...set][0]!;
        break;
      }
    }
    if (!attributed && order.email) {
      const set = emailToContacts.get(order.email);
      if (set && set.size === 1) attributed = [...set][0]!;
    }
    if (attributed) hits.add(attributed);
  }

  return [...hits];
}
