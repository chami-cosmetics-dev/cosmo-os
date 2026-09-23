import { isSharedMerchantEmail } from "@/lib/adapt-import/shared-emails";
import {
  collectContactEmailsSync,
  collectContactPhonesSync,
  normalizeContactEmail,
} from "@/lib/contact-identifiers";
import { emailsForPurchaseLookup } from "@/lib/contact-purchase-lookup";
import {
  buildPhoneLookupVariants,
  canonicalPhoneForErpCustomerId,
} from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";

export type PurchaseSummary = {
  orderCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
};

export type PhonePurchaseAggregate = {
  customerPhone: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
};

export type EmailPurchaseAggregate = {
  customerEmail: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
};

export type ContactIdPurchaseAggregate = {
  contactId: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
};

export type PurchaseSummaryIndexes = {
  byPhone: Map<string, PurchaseSummary>;
  byEmail: Map<string, PurchaseSummary>;
  byContactId: Map<string, PurchaseSummary>;
};

export type ContactPurchaseLookup = {
  contactId: string;
  phoneNumber?: string | null;
  email?: string | null;
  aliasPhones?: string[];
  aliasEmails?: string[];
};

function normalizePhone(value: string | null | undefined) {
  return value?.trim() || "";
}

export function phoneMatchKeys(raw: string | null | undefined): string[] {
  const phone = normalizePhone(raw);
  if (!phone) return [];
  const keys = new Set<string>();
  const canonical = canonicalPhoneForErpCustomerId(phone);
  if (canonical) keys.add(canonical);
  for (const variant of buildPhoneLookupVariants(phone)) {
    keys.add(variant);
    const variantCanonical = canonicalPhoneForErpCustomerId(variant);
    if (variantCanonical) keys.add(variantCanonical);
  }
  return [...keys];
}

function emptySummary(): PurchaseSummary {
  return { orderCount: 0, totalSpent: 0, lastOrderAt: null };
}

function mergeInto(target: PurchaseSummary, row: PurchaseSummary) {
  target.orderCount += row.orderCount;
  target.totalSpent += row.totalSpent;
  if (row.lastOrderAt && (!target.lastOrderAt || row.lastOrderAt > target.lastOrderAt)) {
    target.lastOrderAt = row.lastOrderAt;
  }
}

function mergeAggregate(
  target: PurchaseSummary,
  row: { orderCount: number; totalSpent: number; lastOrderAt: Date | null }
) {
  mergeInto(target, row);
}

/**
 * Index SQL phone aggregates so 077… / +94… / 94… resolve to one summary object.
 */
export function indexPurchaseAggregatesByPhoneKey(
  rows: PhonePurchaseAggregate[]
): Map<string, PurchaseSummary> {
  const byKey = new Map<string, PurchaseSummary>();

  for (const row of rows) {
    const keys = phoneMatchKeys(row.customerPhone);
    if (keys.length === 0) continue;

    let summary: PurchaseSummary | undefined;
    for (const key of keys) {
      summary = byKey.get(key);
      if (summary) break;
    }
    if (!summary) summary = emptySummary();
    mergeAggregate(summary, row);
    for (const key of keys) {
      byKey.set(key, summary);
    }
  }

  return byKey;
}

export function indexPurchaseAggregatesByEmail(
  rows: EmailPurchaseAggregate[]
): Map<string, PurchaseSummary> {
  const byKey = new Map<string, PurchaseSummary>();

  for (const row of rows) {
    const email = normalizeContactEmail(row.customerEmail);
    if (!email || isSharedMerchantEmail(email)) continue;

    let summary = byKey.get(email);
    if (!summary) {
      summary = emptySummary();
      byKey.set(email, summary);
    }
    mergeAggregate(summary, row);
  }

  return byKey;
}

export function indexPurchaseAggregatesByContactId(
  rows: ContactIdPurchaseAggregate[]
): Map<string, PurchaseSummary> {
  const byKey = new Map<string, PurchaseSummary>();
  for (const row of rows) {
    if (!row.contactId) continue;
    let summary = byKey.get(row.contactId);
    if (!summary) {
      summary = emptySummary();
      byKey.set(row.contactId, summary);
    }
    mergeAggregate(summary, row);
  }
  return byKey;
}

export function purchaseSummaryForPhone(
  byKey: Map<string, PurchaseSummary>,
  phone: string | null | undefined
): PurchaseSummary | undefined {
  for (const key of phoneMatchKeys(phone)) {
    const summary = byKey.get(key);
    if (summary) return summary;
  }
  return undefined;
}

function purchaseSummaryForEmail(
  byKey: Map<string, PurchaseSummary>,
  emails: string[]
): PurchaseSummary | undefined {
  const combined = emptySummary();
  let matched = false;
  for (const email of emailsForPurchaseLookup(emails)) {
    const summary = byKey.get(email);
    if (!summary) continue;
    matched = true;
    mergeInto(combined, summary);
  }
  return matched ? combined : undefined;
}

/**
 * Phone contacts → Cosmo orders by phone (+ Adapt by contact id).
 * Email-only contacts → Cosmo orders by email (+ Adapt by contact id).
 * Same attribution rules as contact purchase lookup / insight.
 */
export function purchaseSummaryForContact(
  indexes: PurchaseSummaryIndexes,
  contact: ContactPurchaseLookup
): PurchaseSummary | undefined {
  const phones = collectContactPhonesSync(contact.phoneNumber, contact.aliasPhones ?? []);
  const emails = collectContactEmailsSync(contact.email, contact.aliasEmails ?? []);

  const combined = emptySummary();
  let matched = false;

  if (phones.length > 0) {
    const seen = new Set<PurchaseSummary>();
    for (const phone of phones) {
      const summary = purchaseSummaryForPhone(indexes.byPhone, phone);
      if (!summary || seen.has(summary)) continue;
      seen.add(summary);
      matched = true;
      mergeInto(combined, summary);
    }
  } else {
    const emailSummary = purchaseSummaryForEmail(indexes.byEmail, emails);
    if (emailSummary) {
      matched = true;
      mergeInto(combined, emailSummary);
    }
  }

  const adapt = indexes.byContactId.get(contact.contactId);
  if (adapt) {
    matched = true;
    mergeInto(combined, adapt);
  }

  return matched ? combined : undefined;
}

function toAmount(value: { toString(): string } | number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(n) ? n : 0;
}

/**
 * One GROUP BY query instead of loading every Order row into memory.
 * Needed so Contact Master ~80k export can finish inside maxDuration.
 */
export async function loadOrderPurchaseAggregates(
  companyId: string
): Promise<Map<string, PurchaseSummary>> {
  const grouped = await prisma.order.groupBy({
    by: ["customerPhone"],
    where: {
      companyId,
      customerPhone: { not: null },
    },
    _count: { _all: true },
    _sum: { totalPrice: true },
    _max: { createdAt: true },
  });

  return indexPurchaseAggregatesByPhoneKey(
    grouped.flatMap((row) => {
      const customerPhone = row.customerPhone?.trim() ?? "";
      if (!customerPhone) return [];
      return [
        {
          customerPhone,
          orderCount: row._count._all,
          totalSpent: toAmount(row._sum.totalPrice),
          lastOrderAt: row._max.createdAt,
        },
      ];
    })
  );
}

async function loadOrderPurchaseAggregatesByEmail(
  companyId: string
): Promise<Map<string, PurchaseSummary>> {
  // Email-only attribution: orders with no usable phone (matches contact-purchase-lookup).
  const grouped = await prisma.order.groupBy({
    by: ["customerEmail"],
    where: {
      companyId,
      customerEmail: { not: null },
      OR: [{ customerPhone: null }, { customerPhone: "" }],
    },
    _count: { _all: true },
    _sum: { totalPrice: true },
    _max: { createdAt: true },
  });

  return indexPurchaseAggregatesByEmail(
    grouped.flatMap((row) => {
      const customerEmail = row.customerEmail?.trim() ?? "";
      if (!customerEmail) return [];
      return [
        {
          customerEmail,
          orderCount: row._count._all,
          totalSpent: toAmount(row._sum.totalPrice),
          lastOrderAt: row._max.createdAt,
        },
      ];
    })
  );
}

async function loadAdaptPurchaseAggregates(
  companyId: string
): Promise<Map<string, PurchaseSummary>> {
  const grouped = await prisma.adaptPurchaseHistory.groupBy({
    by: ["contactId"],
    where: { companyId },
    _count: { _all: true },
    _sum: { ttlAmount: true },
    _max: { invoiceDate: true },
  });

  return indexPurchaseAggregatesByContactId(
    grouped.map((row) => ({
      contactId: row.contactId,
      orderCount: row._count._all,
      totalSpent: toAmount(row._sum.ttlAmount),
      lastOrderAt: row._max.invoiceDate,
    }))
  );
}

/** Phone + email-only Cosmo orders + Adapt history, for Contact Master export. */
export async function loadPurchaseSummaryIndexes(
  companyId: string
): Promise<PurchaseSummaryIndexes> {
  const [byPhone, byEmail, byContactId] = await Promise.all([
    loadOrderPurchaseAggregates(companyId),
    loadOrderPurchaseAggregatesByEmail(companyId),
    loadAdaptPurchaseAggregates(companyId),
  ]);
  return { byPhone, byEmail, byContactId };
}
