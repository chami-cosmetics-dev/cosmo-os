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
/** Above this, one company-wide MIN()/MAX() beats per-contact order scans. */
const BULK_ID_THRESHOLD = 800;
/** IN-list size for scoped purchase-date lookups on one export page. */
const KEY_CHUNK = 800;

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

export type PurchaseAtsByContactId = {
  first: Map<string, Date>;
  last: Map<string, Date>;
};

type PurchaseAtRow = {
  key: string;
  first_at: Date | string;
  last_at: Date | string;
};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function emptyIndexes(): FirstPurchaseIndexes {
  return {
    byPhone: new Map(),
    byEmail: new Map(),
    byContactId: new Map(),
  };
}

function rememberEarlier(map: Map<string, Date>, key: string, at: Date) {
  const trimmed = key.trim();
  if (!trimmed) return;
  map.set(trimmed, earlierDate(map.get(trimmed), at)!);
}

function rememberLater(map: Map<string, Date>, key: string, at: Date) {
  const trimmed = key.trim();
  if (!trimmed) return;
  map.set(trimmed, laterDate(map.get(trimmed), at)!);
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

export function laterDate(
  a: Date | null | undefined,
  b: Date | null | undefined
): Date | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

function contactLookupKeys(contact: FirstPurchaseContact) {
  return contactOrderLookupKeys({
    primaryEmail: contact.email,
    primaryPhone: contact.phoneNumber,
    aliasEmails:
      contact.aliasEmails ?? contact.emails?.map((row) => row.email) ?? [],
    aliasPhones:
      contact.aliasPhones ?? contact.phones?.map((row) => row.phoneNumber) ?? [],
  });
}

function purchaseAtForContact(
  indexes: FirstPurchaseIndexes,
  contact: FirstPurchaseContact,
  pick: typeof earlierDate
): Date | null {
  const keys = contactLookupKeys(contact);
  let at: Date | null = indexes.byContactId.get(contact.id) ?? null;
  if (keys.phones.length > 0) {
    for (const phone of keys.phones) {
      at = pick(at, indexes.byPhone.get(phone));
    }
  } else {
    for (const email of keys.emails) {
      const key = email.trim().toLowerCase();
      if (!key) continue;
      at = pick(at, indexes.byEmail.get(key));
    }
  }
  return at;
}

/** Phone-keyed contacts match phone only; email-keyed contacts match email. */
export function firstPurchaseAtForContact(
  indexes: FirstPurchaseIndexes,
  contact: FirstPurchaseContact
): Date | null {
  return purchaseAtForContact(indexes, contact, earlierDate);
}

/** Newest completed Cosmo order or Adapt invoice. Same identity rules as first. */
export function lastPurchaseAtForContact(
  indexes: FirstPurchaseIndexes,
  contact: FirstPurchaseContact
): Date | null {
  return purchaseAtForContact(indexes, contact, laterDate);
}

function applyPurchaseAtRows(
  first: FirstPurchaseIndexes,
  last: FirstPurchaseIndexes,
  rows: PurchaseAtRow[],
  target: "phone" | "email"
) {
  for (const row of rows) {
    if (!row.key) continue;
    const key = target === "email" ? row.key.toLowerCase() : row.key;
    const firstMap = target === "email" ? first.byEmail : first.byPhone;
    const lastMap = target === "email" ? last.byEmail : last.byPhone;
    rememberEarlier(firstMap, key, asDate(row.first_at));
    rememberLater(lastMap, key, asDate(row.last_at));
  }
}

/**
 * One MIN()/MAX() per phone, email, and Adapt contact.
 * Same date rule as `orderPurchaseAt`: delivery, else invoice, else placed.
 */
export async function loadPurchaseIndexes(companyId: string): Promise<{
  first: FirstPurchaseIndexes;
  last: FirstPurchaseIndexes;
}> {
  const first = emptyIndexes();
  const last = emptyIndexes();
  const [phoneRows, erpRows, emailRows, adapt] = await Promise.all([
    prisma.$queryRaw<PurchaseAtRow[]>`
      SELECT btrim("customerPhone") AS key,
             MIN(COALESCE("deliveryCompleteAt", "invoiceCompleteAt", "createdAt")) AS first_at,
             MAX(COALESCE("deliveryCompleteAt", "invoiceCompleteAt", "createdAt")) AS last_at
      FROM "Order"
      WHERE "companyId" = ${companyId}
        AND ${eligibleOrderSql}
        AND "customerPhone" IS NOT NULL
        AND btrim("customerPhone") <> ''
      GROUP BY btrim("customerPhone")
    `,
    prisma.$queryRaw<PurchaseAtRow[]>`
      SELECT btrim("erpnextCustomerId") AS key,
             MIN(COALESCE("deliveryCompleteAt", "invoiceCompleteAt", "createdAt")) AS first_at,
             MAX(COALESCE("deliveryCompleteAt", "invoiceCompleteAt", "createdAt")) AS last_at
      FROM "Order"
      WHERE "companyId" = ${companyId}
        AND ${eligibleOrderSql}
        AND "erpnextCustomerId" IS NOT NULL
        AND btrim("erpnextCustomerId") <> ''
      GROUP BY btrim("erpnextCustomerId")
    `,
    prisma.$queryRaw<PurchaseAtRow[]>`
      SELECT lower(btrim("customerEmail")) AS key,
             MIN(COALESCE("deliveryCompleteAt", "invoiceCompleteAt", "createdAt")) AS first_at,
             MAX(COALESCE("deliveryCompleteAt", "invoiceCompleteAt", "createdAt")) AS last_at
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
      _max: { invoiceDate: true },
    }),
  ]);

  applyPurchaseAtRows(first, last, phoneRows, "phone");
  applyPurchaseAtRows(first, last, erpRows, "phone");
  applyPurchaseAtRows(first, last, emailRows, "email");
  for (const row of adapt) {
    if (row._min.invoiceDate) {
      first.byContactId.set(row.contactId, row._min.invoiceDate);
    }
    if (row._max.invoiceDate) {
      last.byContactId.set(row.contactId, row._max.invoiceDate);
    }
  }

  return { first, last };
}

/** Earliest completed sale per phone/email/Adapt contact. */
export async function loadFirstPurchaseIndexes(
  companyId: string
): Promise<FirstPurchaseIndexes> {
  return (await loadPurchaseIndexes(companyId)).first;
}

async function purchaseAtByPhoneKeys(
  companyId: string,
  keys: string[]
): Promise<PurchaseAtRow[]> {
  if (keys.length === 0) return [];
  const out: PurchaseAtRow[] = [];
  for (const slice of chunkArray(keys, KEY_CHUNK)) {
    const rows = await prisma.$queryRaw<PurchaseAtRow[]>`
      SELECT btrim("customerPhone") AS key,
             MIN(COALESCE("deliveryCompleteAt", "invoiceCompleteAt", "createdAt")) AS first_at,
             MAX(COALESCE("deliveryCompleteAt", "invoiceCompleteAt", "createdAt")) AS last_at
      FROM "Order"
      WHERE "companyId" = ${companyId}
        AND ${eligibleOrderSql}
        AND btrim("customerPhone") IN (${Prisma.join(slice)})
      GROUP BY btrim("customerPhone")
    `;
    out.push(...rows);
  }
  return out;
}

async function purchaseAtByErpKeys(
  companyId: string,
  keys: string[]
): Promise<PurchaseAtRow[]> {
  if (keys.length === 0) return [];
  const out: PurchaseAtRow[] = [];
  for (const slice of chunkArray(keys, KEY_CHUNK)) {
    const rows = await prisma.$queryRaw<PurchaseAtRow[]>`
      SELECT btrim("erpnextCustomerId") AS key,
             MIN(COALESCE("deliveryCompleteAt", "invoiceCompleteAt", "createdAt")) AS first_at,
             MAX(COALESCE("deliveryCompleteAt", "invoiceCompleteAt", "createdAt")) AS last_at
      FROM "Order"
      WHERE "companyId" = ${companyId}
        AND ${eligibleOrderSql}
        AND btrim("erpnextCustomerId") IN (${Prisma.join(slice)})
      GROUP BY btrim("erpnextCustomerId")
    `;
    out.push(...rows);
  }
  return out;
}

async function purchaseAtByEmailKeys(
  companyId: string,
  keys: string[]
): Promise<PurchaseAtRow[]> {
  if (keys.length === 0) return [];
  const out: PurchaseAtRow[] = [];
  for (const slice of chunkArray(keys, KEY_CHUNK)) {
    const rows = await prisma.$queryRaw<PurchaseAtRow[]>`
      SELECT lower(btrim("customerEmail")) AS key,
             MIN(COALESCE("deliveryCompleteAt", "invoiceCompleteAt", "createdAt")) AS first_at,
             MAX(COALESCE("deliveryCompleteAt", "invoiceCompleteAt", "createdAt")) AS last_at
      FROM "Order"
      WHERE "companyId" = ${companyId}
        AND ${eligibleOrderSql}
        AND lower(btrim("customerEmail")) IN (${Prisma.join(slice)})
      GROUP BY lower(btrim("customerEmail"))
    `;
    out.push(...rows);
  }
  return out;
}

function mapsFromLoadedIndexes(
  firstIndexes: FirstPurchaseIndexes,
  lastIndexes: FirstPurchaseIndexes,
  contacts: FirstPurchaseContact[]
): PurchaseAtsByContactId {
  const first = new Map<string, Date>();
  const last = new Map<string, Date>();
  for (const contact of contacts) {
    const firstAt = firstPurchaseAtForContact(firstIndexes, contact);
    if (firstAt) first.set(contact.id, firstAt);
    const lastAt = lastPurchaseAtForContact(lastIndexes, contact);
    if (lastAt) last.set(contact.id, lastAt);
  }
  return { first, last };
}

/**
 * First and last completed-sale dates for contacts already loaded.
 * Scoped MIN()/MAX() on those phones/emails — not a company-wide Order scan.
 */
export async function purchaseAtsForLoadedContacts(
  companyId: string,
  contacts: FirstPurchaseContact[]
): Promise<PurchaseAtsByContactId> {
  const first = new Map<string, Date>();
  const last = new Map<string, Date>();
  if (contacts.length === 0) return { first, last };

  const phones = new Set<string>();
  const emails = new Set<string>();
  const ids: string[] = [];
  for (const contact of contacts) {
    ids.push(contact.id);
    const keys = contactLookupKeys(contact);
    for (const phone of keys.phones) {
      if (phone) phones.add(phone);
    }
    for (const email of keys.emails) {
      const key = email.trim().toLowerCase();
      if (key) emails.add(key);
    }
  }

  const phoneList = [...phones];
  const [phoneRows, erpRows, emailRows, adaptChunks] = await Promise.all([
    purchaseAtByPhoneKeys(companyId, phoneList),
    purchaseAtByErpKeys(companyId, phoneList),
    purchaseAtByEmailKeys(companyId, [...emails]),
    Promise.all(
      chunkArray(ids, 2_000).map((slice) =>
        prisma.adaptPurchaseHistory.groupBy({
          by: ["contactId"],
          where: {
            companyId,
            contactId: { in: slice },
            ...adaptSaleTotalWhere(),
          },
          _min: { invoiceDate: true },
          _max: { invoiceDate: true },
        })
      )
    ),
  ]);

  const firstIndexes = emptyIndexes();
  const lastIndexes = emptyIndexes();
  applyPurchaseAtRows(firstIndexes, lastIndexes, phoneRows, "phone");
  applyPurchaseAtRows(firstIndexes, lastIndexes, erpRows, "phone");
  applyPurchaseAtRows(firstIndexes, lastIndexes, emailRows, "email");
  for (const row of adaptChunks.flat()) {
    if (row._min.invoiceDate) {
      firstIndexes.byContactId.set(
        row.contactId,
        earlierDate(
          firstIndexes.byContactId.get(row.contactId),
          row._min.invoiceDate
        )!
      );
    }
    if (row._max.invoiceDate) {
      lastIndexes.byContactId.set(
        row.contactId,
        laterDate(
          lastIndexes.byContactId.get(row.contactId),
          row._max.invoiceDate
        )!
      );
    }
  }

  return mapsFromLoadedIndexes(firstIndexes, lastIndexes, contacts);
}

export async function firstPurchaseAtForLoadedContacts(
  companyId: string,
  contacts: FirstPurchaseContact[]
): Promise<Map<string, Date>> {
  return (await purchaseAtsForLoadedContacts(companyId, contacts)).first;
}

export async function lastPurchaseAtForLoadedContacts(
  companyId: string,
  contacts: FirstPurchaseContact[]
): Promise<Map<string, Date>> {
  return (await purchaseAtsForLoadedContacts(companyId, contacts)).last;
}

/**
 * Earliest / newest completed Cosmo order or Adapt invoice per contact.
 * Phone-keyed contacts match phone only; email-keyed contacts match email.
 */
export async function purchaseAtsByContactIds(
  companyId: string,
  contactIds: string[]
): Promise<PurchaseAtsByContactId> {
  const ids = [...new Set(contactIds.map((id) => id.trim()).filter(Boolean))];
  const first = new Map<string, Date>();
  const last = new Map<string, Date>();
  if (ids.length === 0) return { first, last };

  if (ids.length > BULK_ID_THRESHOLD) {
    const indexes = await loadPurchaseIndexes(companyId);
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
      const part = mapsFromLoadedIndexes(indexes.first, indexes.last, contacts);
      for (const [id, at] of part.first) first.set(id, at);
      for (const [id, at] of part.last) last.set(id, at);
    }
    return { first, last };
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
        _max: { invoiceDate: true },
      }),
    ]);

    for (const row of adapt) {
      if (row._min.invoiceDate) {
        first.set(
          row.contactId,
          earlierDate(first.get(row.contactId), row._min.invoiceDate)!
        );
      }
      if (row._max.invoiceDate) {
        last.set(
          row.contactId,
          laterDate(last.get(row.contactId), row._max.invoiceDate)!
        );
      }
    }

    for (const contact of contacts) {
      const keys = contactLookupKeys(contact);
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
        first.set(id, earlierDate(first.get(id), at)!);
        last.set(id, laterDate(last.get(id), at)!);
      }
    }
  }

  return { first, last };
}

export async function firstPurchaseAtByContactIds(
  companyId: string,
  contactIds: string[]
): Promise<Map<string, Date>> {
  return (await purchaseAtsByContactIds(companyId, contactIds)).first;
}

export async function lastPurchaseAtByContactIds(
  companyId: string,
  contactIds: string[]
): Promise<Map<string, Date>> {
  return (await purchaseAtsByContactIds(companyId, contactIds)).last;
}
