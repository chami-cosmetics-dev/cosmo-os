import { Prisma } from "@prisma/client";

import { contactOrderLookupKeys } from "@/lib/contact-purchase-lookup";
import {
  CUSTOMER_LIFETIME_TOTAL_FULFILLMENT_STAGES,
  adaptSaleTotalWhere,
  customerLifetimeTotalOrderWhere,
  orderPurchaseAt,
} from "@/lib/customer-insight/lifetime-total";
import { chunkArray } from "@/lib/customer-insight/purchase-scan";
import { prisma } from "@/lib/prisma";

const ID_CHUNK = 400;
/** Above this, one company-wide MIN() beats per-contact order scans. */
const BULK_ID_THRESHOLD = 800;

export type FirstPurchaseIndexes = {
  byPhone: Map<string, Date>;
  byEmail: Map<string, Date>;
  byContactId: Map<string, Date>;
};

export type FirstPurchaseContact = {
  id: string;
  phoneNumber?: string | null;
  email?: string | null;
  phones?: Array<{ phoneNumber: string }>;
  emails?: Array<{ email: string }>;
  aliasPhones?: string[];
  aliasEmails?: string[];
};

type FirstAtRow = { key: string; first_at: Date | string };

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function rememberEarlier(map: Map<string, Date>, key: string, at: Date) {
  const trimmed = key.trim();
  if (!trimmed) return;
  map.set(trimmed, earlierDate(map.get(trimmed), at)!);
}

const eligibleOrderSql = Prisma.sql`
  "cancelledAt" IS NULL
  AND "financialStatus" <> 'voided'
  AND "fulfillmentStage"::text IN (${Prisma.join([
    ...CUSTOMER_LIFETIME_TOTAL_FULFILLMENT_STAGES,
  ])})
`;

export function earlierDate(
  a: Date | null | undefined,
  b: Date | null | undefined
): Date | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/**
 * One MIN() per phone, email, and Adapt contact.
 * Same date rule as `orderPurchaseAt`: delivery, else invoice, else placed.
 */
export async function loadFirstPurchaseIndexes(
  companyId: string
): Promise<FirstPurchaseIndexes> {
  const [phoneRows, erpRows, emailRows, adapt] = await Promise.all([
    prisma.$queryRaw<FirstAtRow[]>`
      SELECT btrim("customerPhone") AS key,
             MIN(COALESCE("deliveryCompleteAt", "invoiceCompleteAt", "createdAt")) AS first_at
      FROM "Order"
      WHERE "companyId" = ${companyId}
        AND ${eligibleOrderSql}
        AND "customerPhone" IS NOT NULL
        AND btrim("customerPhone") <> ''
      GROUP BY btrim("customerPhone")
    `,
    prisma.$queryRaw<FirstAtRow[]>`
      SELECT btrim("erpnextCustomerId") AS key,
             MIN(COALESCE("deliveryCompleteAt", "invoiceCompleteAt", "createdAt")) AS first_at
      FROM "Order"
      WHERE "companyId" = ${companyId}
        AND ${eligibleOrderSql}
        AND "erpnextCustomerId" IS NOT NULL
        AND btrim("erpnextCustomerId") <> ''
      GROUP BY btrim("erpnextCustomerId")
    `,
    prisma.$queryRaw<FirstAtRow[]>`
      SELECT lower(btrim("customerEmail")) AS key,
             MIN(COALESCE("deliveryCompleteAt", "invoiceCompleteAt", "createdAt")) AS first_at
      FROM "Order"
      WHERE "companyId" = ${companyId}
        AND ${eligibleOrderSql}
        AND "customerEmail" IS NOT NULL
        AND btrim("customerEmail") <> ''
      GROUP BY lower(btrim("customerEmail"))
    `,
    prisma.adaptPurchaseHistory.groupBy({
      by: ["contactId"],
      where: { companyId, ...adaptSaleTotalWhere() },
      _min: { invoiceDate: true },
    }),
  ]);

  const byPhone = new Map<string, Date>();
  for (const row of phoneRows) {
    if (!row.key) continue;
    rememberEarlier(byPhone, row.key, asDate(row.first_at));
  }
  for (const row of erpRows) {
    if (!row.key) continue;
    rememberEarlier(byPhone, row.key, asDate(row.first_at));
  }

  const byEmail = new Map<string, Date>();
  for (const row of emailRows) {
    if (!row.key) continue;
    rememberEarlier(byEmail, row.key.toLowerCase(), asDate(row.first_at));
  }

  const byContactId = new Map<string, Date>();
  for (const row of adapt) {
    if (!row._min.invoiceDate) continue;
    byContactId.set(row.contactId, row._min.invoiceDate);
  }

  return { byPhone, byEmail, byContactId };
}

/** Phone-keyed contacts match phone only; email-keyed contacts match email. */
export function firstPurchaseAtForContact(
  indexes: FirstPurchaseIndexes,
  contact: FirstPurchaseContact
): Date | null {
  const keys = contactOrderLookupKeys({
    primaryEmail: contact.email,
    primaryPhone: contact.phoneNumber,
    aliasEmails:
      contact.aliasEmails ?? contact.emails?.map((row) => row.email) ?? [],
    aliasPhones:
      contact.aliasPhones ?? contact.phones?.map((row) => row.phoneNumber) ?? [],
  });

  let at: Date | null = indexes.byContactId.get(contact.id) ?? null;
  if (keys.phones.length > 0) {
    for (const phone of keys.phones) {
      at = earlierDate(at, indexes.byPhone.get(phone));
    }
  } else {
    for (const email of keys.emails) {
      const key = email.trim().toLowerCase();
      if (!key) continue;
      at = earlierDate(at, indexes.byEmail.get(key));
    }
  }
  return at;
}

/**
 * Earliest completed Cosmo order or Adapt invoice per contact.
 * Phone-keyed contacts match phone only; email-keyed contacts match email.
 */
export async function firstPurchaseAtByContactIds(
  companyId: string,
  contactIds: string[]
): Promise<Map<string, Date>> {
  const ids = [...new Set(contactIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, Date>();
  if (ids.length === 0) return out;

  if (ids.length > BULK_ID_THRESHOLD) {
    const indexes = await loadFirstPurchaseIndexes(companyId);
    for (const slice of chunkArray(ids, 2_000)) {
      const contacts = await prisma.contactMaster.findMany({
        where: { companyId, id: { in: slice } },
        select: {
          id: true,
          phoneNumber: true,
          email: true,
          phones: { select: { phoneNumber: true } },
          emails: { select: { email: true } },
        },
      });
      for (const contact of contacts) {
        const at = firstPurchaseAtForContact(indexes, contact);
        if (at) out.set(contact.id, at);
      }
    }
    return out;
  }

  const orderSelect = {
    customerPhone: true,
    customerEmail: true,
    erpnextCustomerId: true,
    createdAt: true,
    deliveryCompleteAt: true,
    invoiceCompleteAt: true,
  } as const;

  for (const slice of chunkArray(ids, ID_CHUNK)) {
    const phoneToIds = new Map<string, string[]>();
    const emailToIds = new Map<string, string[]>();
    const [contacts, adapt] = await Promise.all([
      prisma.contactMaster.findMany({
        where: { companyId, id: { in: slice } },
        select: {
          id: true,
          phoneNumber: true,
          email: true,
          phones: { select: { phoneNumber: true } },
          emails: { select: { email: true } },
        },
      }),
      prisma.adaptPurchaseHistory.groupBy({
        by: ["contactId"],
        where: { companyId, contactId: { in: slice }, ...adaptSaleTotalWhere() },
        _min: { invoiceDate: true },
      }),
    ]);

    for (const row of adapt) {
      if (!row._min.invoiceDate) continue;
      out.set(row.contactId, earlierDate(out.get(row.contactId), row._min.invoiceDate)!);
    }

    for (const contact of contacts) {
      const keys = contactOrderLookupKeys({
        primaryEmail: contact.email,
        primaryPhone: contact.phoneNumber,
        aliasEmails: contact.emails.map((row) => row.email),
        aliasPhones: contact.phones.map((row) => row.phoneNumber),
      });
      if (keys.phones.length > 0) {
        for (const phone of keys.phones) {
          if (!phone) continue;
          const list = phoneToIds.get(phone) ?? [];
          list.push(contact.id);
          phoneToIds.set(phone, list);
        }
        continue;
      }
      for (const email of keys.emails) {
        const key = email.trim().toLowerCase();
        if (!key) continue;
        const list = emailToIds.get(key) ?? [];
        list.push(contact.id);
        emailToIds.set(key, list);
      }
    }

    const phones = [...phoneToIds.keys()];
    const emails = [...emailToIds.keys()];
    const orderPages = await Promise.all([
      ...chunkArray(phones, 200).map((phoneSlice) =>
        prisma.order.findMany({
          where: {
            companyId,
            ...customerLifetimeTotalOrderWhere(),
            OR: [
              { customerPhone: { in: phoneSlice } },
              { erpnextCustomerId: { in: phoneSlice } },
            ],
          },
          select: orderSelect,
        })
      ),
      ...chunkArray(emails, 40).map((emailSlice) =>
        prisma.order.findMany({
          where: {
            companyId,
            ...customerLifetimeTotalOrderWhere(),
            OR: emailSlice.map((email) => ({
              customerEmail: { equals: email, mode: "insensitive" as const },
            })),
          },
          select: orderSelect,
        })
      ),
    ]);

    for (const order of orderPages.flat()) {
      const at = orderPurchaseAt(order);
      const matched = new Set<string>();
      const phone = order.customerPhone?.trim() || "";
      if (phone) {
        for (const id of phoneToIds.get(phone) ?? []) matched.add(id);
      }
      const erp = order.erpnextCustomerId?.trim() || "";
      if (erp) {
        for (const id of phoneToIds.get(erp) ?? []) matched.add(id);
      }
      const email = order.customerEmail?.trim().toLowerCase() || "";
      if (email) {
        for (const id of emailToIds.get(email) ?? []) matched.add(id);
      }
      for (const id of matched) {
        out.set(id, earlierDate(out.get(id), at)!);
      }
    }
  }

  return out;
}
