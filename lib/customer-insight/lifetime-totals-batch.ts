import { contactOrderLookupKeys } from "@/lib/contact-purchase-lookup";
import {
  attributeOrderTotalsByContact,
  combineLifetimeTotals,
  customerLifetimeTotalOrderWhere,
  type ContactOrderLookup,
} from "@/lib/customer-insight/lifetime-total";
import { prisma } from "@/lib/prisma";

const ORDER_LOOKUP_IN_CAP = 800;
const ADAPT_ID_CHUNK = 4_000;
const CONTACT_BATCH = 400;

export type LifetimeTotalContactInput = {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  emails?: Array<{ email: string }>;
  phones?: Array<{ phoneNumber: string }>;
};

function toAmount(value: { toString(): string } | number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function adaptTotalsByContactId(
  companyId: string,
  contactIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (contactIds.length === 0) return out;

  const chunks: string[][] = [];
  for (let i = 0; i < contactIds.length; i += ADAPT_ID_CHUNK) {
    chunks.push(contactIds.slice(i, i + ADAPT_ID_CHUNK));
  }

  const grouped = await Promise.all(
    chunks.map((slice) =>
      prisma.adaptPurchaseHistory.groupBy({
        by: ["contactId"],
        where: { companyId, contactId: { in: slice } },
        _sum: { ttlAmount: true },
      })
    )
  );

  for (const rows of grouped) {
    for (const row of rows) {
      out.set(row.contactId, toAmount(row._sum.ttlAmount?.toString() ?? 0));
    }
  }
  return out;
}

/**
 * Lifetime tot for many contacts in a few queries (not per-contact N+1).
 * Phone/email attribution matches single-contact insight totals.
 * Contacts are batched so large merchant sets are not truncated by IN-list limits.
 */
export async function lifetimeTotalsByContactId(
  companyId: string,
  contacts: LifetimeTotalContactInput[]
): Promise<Map<string, number>> {
  if (contacts.length === 0) return new Map();

  if (contacts.length <= CONTACT_BATCH) {
    return lifetimeTotalsForContactBatch(companyId, contacts);
  }

  const out = new Map<string, number>();
  for (let i = 0; i < contacts.length; i += CONTACT_BATCH) {
    const part = await lifetimeTotalsForContactBatch(
      companyId,
      contacts.slice(i, i + CONTACT_BATCH)
    );
    for (const [id, total] of part) out.set(id, total);
  }
  return out;
}

async function lifetimeTotalsForContactBatch(
  companyId: string,
  contacts: LifetimeTotalContactInput[]
): Promise<Map<string, number>> {
  if (contacts.length === 0) return new Map();

  const lookupByContactId = new Map<string, ContactOrderLookup>();
  const allPhones: string[] = [];
  const allEmails: string[] = [];
  const seenPhone = new Set<string>();
  const seenEmail = new Set<string>();

  for (const contact of contacts) {
    const keys = contactOrderLookupKeys({
      primaryEmail: contact.email,
      primaryPhone: contact.phoneNumber,
      aliasEmails: (contact.emails ?? []).map((row) => row.email),
      aliasPhones: (contact.phones ?? []).map((row) => row.phoneNumber),
    });
    lookupByContactId.set(contact.id, keys);
    for (const phone of keys.phones) {
      if (seenPhone.has(phone)) continue;
      seenPhone.add(phone);
      allPhones.push(phone);
    }
    for (const email of keys.emails) {
      const key = email.trim().toLowerCase();
      if (!key || seenEmail.has(key)) continue;
      seenEmail.add(key);
      allEmails.push(email);
    }
  }

  const contactIds = contacts.map((c) => c.id);
  const hasOrderKeys = allPhones.length > 0 || allEmails.length > 0;
  const useInFilter =
    hasOrderKeys && allPhones.length + allEmails.length <= ORDER_LOOKUP_IN_CAP;

  const [orders, adaptTotals] = await Promise.all([
    hasOrderKeys
      ? prisma.order.findMany({
          where: {
            companyId,
            ...customerLifetimeTotalOrderWhere(),
            ...(useInFilter
              ? {
                  OR: [
                    ...(allPhones.length > 0
                      ? [
                          { customerPhone: { in: allPhones } },
                          { erpnextCustomerId: { in: allPhones } },
                        ]
                      : []),
                    ...(allEmails.length > 0
                      ? [
                          {
                            customerEmail: {
                              in: allEmails,
                              mode: "insensitive" as const,
                            },
                          },
                        ]
                      : []),
                  ],
                }
              : {}),
          },
          select: {
            customerPhone: true,
            customerEmail: true,
            erpnextCustomerId: true,
            totalPrice: true,
          },
        })
      : Promise.resolve([]),
    adaptTotalsByContactId(companyId, contactIds),
  ]);

  const orderTotals = attributeOrderTotalsByContact({
    lookupByContactId,
    orders: orders.map((order) => ({
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      erpnextCustomerId: order.erpnextCustomerId,
      totalPrice: order.totalPrice.toString(),
    })),
  });

  return combineLifetimeTotals(contactIds, orderTotals, adaptTotals);
}
