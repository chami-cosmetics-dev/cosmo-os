import { Prisma } from "@prisma/client";

import { chunkArray } from "@/lib/customer-insight/purchase-scan";
import {
  adaptSaleTotalWhere,
  CUSTOMER_LIFETIME_TOTAL_FULFILLMENT_STAGES,
} from "@/lib/customer-insight/lifetime-total";
import { canonicalPhoneForErpCustomerId, buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";

const PHONE_VARIANT_CHUNK = 400;
const ORDER_KEY_CHUNK = 800;

export type LastPurchaseContact = {
  id?: string;
  phoneNumber: string | null;
  lastPurchaseAt: Date | null;
  purchaseLastOrderAt?: Date | null;
  phones?: Array<{ phoneNumber: string }>;
};

type OrderLastPurchaseRow = {
  key: string;
  last_at: Date | string;
};

const eligibleOrderSql = Prisma.sql`
  "cancelledAt" IS NULL
  AND "financialStatus" <> 'voided'
  AND "fulfillmentStage"::text IN (${Prisma.join([
    ...CUSTOMER_LIFETIME_TOTAL_FULFILLMENT_STAGES,
  ])})
`;

/** Canonical 10-digit local phone, else trimmed raw. */
export function canonicalAbandonedCheckoutPhone(
  raw: string | null | undefined
): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  return canonicalPhoneForErpCustomerId(trimmed) ?? trimmed;
}

export function laterPurchaseAt(
  a: Date | null | undefined,
  b: Date | null | undefined
): Date | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Store a purchase stamp under every format of the same number. */
export function rememberPhonePurchase(
  map: Map<string, Date>,
  rawPhone: string | null | undefined,
  at: Date | null | undefined
) {
  if (!rawPhone?.trim() || !at || Number.isNaN(at.getTime())) return;
  const keys = new Set<string>();
  const canonical = canonicalAbandonedCheckoutPhone(rawPhone);
  if (canonical) keys.add(canonical);
  keys.add(rawPhone.trim());
  for (const variant of buildPhoneLookupVariants(rawPhone)) keys.add(variant);
  for (const key of keys) {
    map.set(key, laterPurchaseAt(map.get(key) ?? null, at)!);
  }
}

/**
 * Map phone → newest purchase stamp from contact rows.
 * Multiple contacts on one number keep the later stamp.
 */
export function indexLastPurchaseAtByPhone(
  contacts: LastPurchaseContact[]
): Map<string, Date> {
  const map = new Map<string, Date>();
  for (const contact of contacts) {
    const at = laterPurchaseAt(contact.lastPurchaseAt, contact.purchaseLastOrderAt);
    rememberPhonePurchase(map, contact.phoneNumber, at);
    for (const row of contact.phones ?? []) {
      rememberPhonePurchase(map, row.phoneNumber, at);
    }
  }
  return map;
}

export function lastPurchaseAtForCheckoutPhones(
  index: Map<string, Date>,
  phones: Array<string | null | undefined>
): Date | null {
  let latest: Date | null = null;
  const seen = new Set<string>();
  for (const raw of phones) {
    if (!raw?.trim()) continue;
    const candidates = [
      canonicalAbandonedCheckoutPhone(raw),
      raw.trim(),
      ...buildPhoneLookupVariants(raw),
    ];
    for (const key of candidates) {
      if (!key || seen.has(key)) continue;
      seen.add(key);
      latest = laterPurchaseAt(latest, index.get(key) ?? null);
    }
  }
  return latest;
}

async function lastOrderAtByPhoneKeys(
  companyId: string,
  keys: string[]
): Promise<OrderLastPurchaseRow[]> {
  if (keys.length === 0) return [];
  const out: OrderLastPurchaseRow[] = [];
  for (const slice of chunkArray(keys, ORDER_KEY_CHUNK)) {
    const rows = await prisma.$queryRaw<OrderLastPurchaseRow[]>`
      SELECT btrim("customerPhone") AS key,
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

async function lastOrderAtByErpKeys(
  companyId: string,
  keys: string[]
): Promise<OrderLastPurchaseRow[]> {
  if (keys.length === 0) return [];
  const out: OrderLastPurchaseRow[] = [];
  for (const slice of chunkArray(keys, ORDER_KEY_CHUNK)) {
    const rows = await prisma.$queryRaw<OrderLastPurchaseRow[]>`
      SELECT btrim("erpnextCustomerId") AS key,
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

export async function lookupLastPurchaseAtByPhones(
  companyId: string,
  phones: Array<string | null | undefined>
): Promise<Map<string, Date>> {
  const unique = [
    ...new Set(phones.map((p) => p?.trim() ?? "").filter((p) => p.length > 0)),
  ];
  if (unique.length === 0) return new Map();

  const variants = new Set<string>();
  for (const phone of unique) {
    for (const variant of buildPhoneLookupVariants(phone)) variants.add(variant);
  }
  const variantList = [...variants];
  const map = new Map<string, Date>();

  const [phoneOrders, erpOrders] = await Promise.all([
    lastOrderAtByPhoneKeys(companyId, variantList),
    lastOrderAtByErpKeys(companyId, variantList),
  ]);
  for (const row of [...phoneOrders, ...erpOrders]) {
    if (!row.key) continue;
    rememberPhonePurchase(map, row.key, asDate(row.last_at));
  }

  const contacts: LastPurchaseContact[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < variantList.length; i += PHONE_VARIANT_CHUNK) {
    const chunk = variantList.slice(i, i + PHONE_VARIANT_CHUNK);
    const rows = await prisma.contactMaster.findMany({
      where: {
        companyId,
        OR: [
          { phoneNumber: { in: chunk } },
          { phones: { some: { phoneNumber: { in: chunk } } } },
        ],
      },
      select: {
        id: true,
        phoneNumber: true,
        lastPurchaseAt: true,
        purchaseLastOrderAt: true,
        phones: { select: { phoneNumber: true } },
      },
    });
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      contacts.push(row);
    }
  }

  for (const contact of contacts) {
    const stamp = laterPurchaseAt(contact.lastPurchaseAt, contact.purchaseLastOrderAt);
    rememberPhonePurchase(map, contact.phoneNumber, stamp);
    for (const row of contact.phones ?? []) {
      rememberPhonePurchase(map, row.phoneNumber, stamp);
    }
  }

  const contactIds = contacts
    .map((c) => c.id)
    .filter((id): id is string => Boolean(id));
  if (contactIds.length > 0) {
    const adaptRows = await prisma.adaptPurchaseHistory.groupBy({
      by: ["contactId"],
      where: { companyId, contactId: { in: contactIds }, ...adaptSaleTotalWhere() },
      _max: { invoiceDate: true },
    });
    const adaptById = new Map(
      adaptRows
        .filter((row) => row._max.invoiceDate)
        .map((row) => [row.contactId, row._max.invoiceDate!])
    );
    for (const contact of contacts) {
      if (!contact.id) continue;
      const at = adaptById.get(contact.id);
      if (!at) continue;
      rememberPhonePurchase(map, contact.phoneNumber, at);
      for (const row of contact.phones ?? []) {
        rememberPhonePurchase(map, row.phoneNumber, at);
      }
    }
  }

  return map;
}
