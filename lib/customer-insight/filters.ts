import { listContactEmails, listContactPhones } from "@/lib/contact-identifiers";
import { buildContactOrderLookupOr } from "@/lib/contact-purchase-lookup";
import { computeLifetimeTotal } from "@/lib/customer-insight/lifetime-total";
import {
  buildLoyaltyDto,
  classifyLoyaltyTierKey,
  loyaltyCode,
  loyaltyLabel,
} from "@/lib/customer-insight/loyalty-tier";
import { merchantMatchKeysForUser } from "@/lib/customer-insight/ownership";
import type { AllocatedFilterResultDto, LoyaltyTierKey } from "@/lib/customer-insight/types";
import { findContactsByPurchasedBrandRanked } from "@/lib/page-data/contact-brand-ids";
import { findContactsByPurchasedItem } from "@/lib/customer-insight/item-filter";
import { prisma } from "@/lib/prisma";

export type MonthDay = { month: number; day: number };

export type FilterQueryInput = {
  companyId: string;
  viewer: {
    knownName?: string | null;
    name?: string | null;
    email?: string | null;
    couponCodes?: string[] | null;
    roleNames?: string[];
  };
  isAdmin: boolean;
  scopeAllContacts?: boolean;
  brand?: string;
  item?: string;
  minTotal?: number;
  maxTotal?: number;
  birthdayFrom?: MonthDay;
  birthdayTo?: MonthDay;
  lastContactedFrom?: string;
  lastContactedTo?: string;
  loyaltyRegisteredFrom?: string;
  loyaltyRegisteredTo?: string;
  noPurchaseFrom?: string;
  noPurchaseTo?: string;
  noPurchaseMonths?: 3 | 6;
  page: number;
  pageSize: number;
};

const FILTER_CANDIDATE_CAP = 800;
const BRAND_FILTER_RANK_CAP = 2_000;

export function matchesBirthdayThisMonth(
  birthMonth: number | null | undefined,
  now = new Date()
): boolean {
  if (birthMonth == null || birthMonth < 1 || birthMonth > 12) return false;
  return birthMonth === now.getMonth() + 1;
}

/** Ordinal day-of-year style key for month-day (non-leap Feb 29 → 60). */
export function monthDayKey(month: number, day: number): number {
  return month * 100 + day;
}

/**
 * True when birth month-day falls in [from, to] inclusive.
 * Supports year wrap (e.g. Dec 20 – Jan 5).
 */
export function matchesBirthdayRange(
  birthMonth: number | null | undefined,
  birthDay: number | null | undefined,
  from: MonthDay,
  to: MonthDay
): boolean {
  if (
    birthMonth == null ||
    birthDay == null ||
    birthMonth < 1 ||
    birthMonth > 12 ||
    birthDay < 1 ||
    birthDay > 31
  ) {
    return false;
  }
  const b = monthDayKey(birthMonth, birthDay);
  const f = monthDayKey(from.month, from.day);
  const t = monthDayKey(to.month, to.day);
  if (f <= t) return b >= f && b <= t;
  return b >= f || b <= t;
}

export function noPurchaseCutoff(months: 3 | 6, now = new Date()): Date {
  const d = new Date(now.getTime());
  d.setMonth(d.getMonth() - months);
  return d;
}

export function hasNoPurchaseWithinMonths(
  lastPurchaseAt: Date | string | null | undefined,
  months: 3 | 6,
  now = new Date()
): boolean {
  if (lastPurchaseAt == null || lastPurchaseAt === "") return true;
  const last =
    lastPurchaseAt instanceof Date
      ? lastPurchaseAt
      : new Date(lastPurchaseAt);
  if (Number.isNaN(last.getTime())) return true;
  return last.getTime() < noPurchaseCutoff(months, now).getTime();
}

/** No purchase overlapping [from, to] inclusive Colombo calendar days (UTC noon approx). */
export function hasNoPurchaseInDateRange(
  lastPurchaseAt: Date | string | null | undefined,
  fromYmd: string,
  toYmd: string
): boolean {
  const from = new Date(`${fromYmd}T00:00:00+05:30`);
  const to = new Date(`${toYmd}T23:59:59.999+05:30`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return false;
  if (lastPurchaseAt == null || lastPurchaseAt === "") return true;
  const last =
    lastPurchaseAt instanceof Date
      ? lastPurchaseAt
      : new Date(lastPurchaseAt);
  if (Number.isNaN(last.getTime())) return true;
  return last.getTime() < from.getTime() || last.getTime() > to.getTime();
}

function startOfColomboDay(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+05:30`);
}

function endOfColomboDay(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

async function lifetimeTotalForContact(
  companyId: string,
  contactId: string
): Promise<number> {
  const contact = await prisma.contactMaster.findFirst({
    where: { id: contactId, companyId },
    select: { email: true, phoneNumber: true },
  });
  if (!contact) return 0;

  const emails = await listContactEmails(contactId, contact.email);
  const phones = await listContactPhones(contactId, contact.phoneNumber);
  const orderLookupOr = buildContactOrderLookupOr({ phones, emails });

  const [orders, adaptRows] = await Promise.all([
    orderLookupOr.length > 0
      ? prisma.order.findMany({
          where: { companyId, OR: orderLookupOr },
          select: { totalPrice: true, cancelledAt: true },
        })
      : Promise.resolve([]),
    prisma.adaptPurchaseHistory.findMany({
      where: { contactId, companyId },
      select: { ttlAmount: true },
    }),
  ]);

  return computeLifetimeTotal({
    orders: orders.map((o) => ({
      totalPrice: o.totalPrice.toString(),
      cancelledAt: o.cancelledAt,
    })),
    adaptRows: adaptRows.map((r) => ({ ttlAmount: r.ttlAmount.toString() })),
  });
}

type ContactCandidate = {
  id: string;
  name: string;
  phoneNumber: string | null;
  assignedMerchant: string | null;
  birthMonth: number | null;
  birthDay: number | null;
  lastPurchaseAt: Date | null;
  loyaltyAssignedAt: Date | null;
};

function buildAllocationWhere(input: FilterQueryInput): {
  empty: boolean;
  where: Record<string, unknown>;
} {
  const labels = merchantMatchKeysForUser(input.viewer);
  const scopeAll = Boolean(input.scopeAllContacts ?? input.isAdmin);

  const where: Record<string, unknown> = {
    companyId: input.companyId,
  };

  if (scopeAll) {
    // all company contacts
  } else if (labels.length === 0) {
    return { empty: true, where };
  } else {
    where.AND = [
      {
        OR: labels.map((label) => ({
          assignedMerchant: { equals: label, mode: "insensitive" as const },
        })),
      },
    ];
  }

  if (input.loyaltyRegisteredFrom || input.loyaltyRegisteredTo) {
    const assignedAt: Record<string, Date> = {};
    if (input.loyaltyRegisteredFrom) {
      assignedAt.gte = startOfColomboDay(input.loyaltyRegisteredFrom);
    }
    if (input.loyaltyRegisteredTo) {
      assignedAt.lte = endOfColomboDay(input.loyaltyRegisteredTo);
    }
    const existingAnd = Array.isArray(where.AND)
      ? (where.AND as unknown[])
      : where.AND
        ? [where.AND]
        : [];
    where.AND = [
      ...existingAnd,
      { loyaltyAssignedAt: assignedAt },
      { loyaltyAssignedTier: { not: null } },
    ];
  }

  if (input.noPurchaseMonths === 3 || input.noPurchaseMonths === 6) {
    const cutoff = noPurchaseCutoff(input.noPurchaseMonths);
    const inactivity = {
      OR: [{ lastPurchaseAt: null }, { lastPurchaseAt: { lt: cutoff } }],
    };
    const existingAnd = Array.isArray(where.AND)
      ? (where.AND as unknown[])
      : where.AND
        ? [where.AND]
        : [];
    where.AND = [...existingAnd, inactivity];
  }

  return { empty: false, where };
}

async function lastContactedMap(
  companyId: string,
  contactIds: string[]
): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  if (contactIds.length === 0) return map;
  const rows = await prisma.contactAllocationUpdate.findMany({
    where: {
      companyId,
      contactId: { in: contactIds },
      NOT: { category: "allocation" },
    },
    orderBy: { createdAt: "desc" },
    select: { contactId: true, createdAt: true },
  });
  for (const row of rows) {
    if (!map.has(row.contactId)) map.set(row.contactId, row.createdAt);
  }
  return map;
}

function inLastContactedRange(
  at: Date | undefined,
  fromYmd?: string,
  toYmd?: string
): boolean {
  if (!fromYmd && !toYmd) return true;
  if (!at) return false;
  if (fromYmd && at.getTime() < startOfColomboDay(fromYmd).getTime()) return false;
  if (toYmd && at.getTime() > endOfColomboDay(toYmd).getTime()) return false;
  return true;
}

export async function filterAllocatedContacts(
  input: FilterQueryInput
): Promise<AllocatedFilterResultDto> {
  const emptyResult = (): AllocatedFilterResultDto => ({
    items: [],
    pagination: { page: input.page, pageSize: input.pageSize, total: 0 },
  });

  const { empty, where } = buildAllocationWhere(input);
  if (empty) return emptyResult();

  const brandNeedle = input.brand?.trim() || null;
  const itemNeedle = input.item?.trim() || null;

  const brandRanks = brandNeedle
    ? await findContactsByPurchasedBrandRanked(input.companyId, brandNeedle)
    : [];
  const brandSpendById = new Map(
    brandRanks.map((r) => [r.contactId, r.brandSpend] as const)
  );

  if (brandNeedle && brandRanks.length === 0) {
    return emptyResult();
  }

  let itemContactIds: Set<string> | null = null;
  if (itemNeedle) {
    const itemHits = await findContactsByPurchasedItem(
      input.companyId,
      itemNeedle,
      brandNeedle
    );
    itemContactIds = new Set(itemHits);
    if (itemContactIds.size === 0) return emptyResult();
  }

  let candidates: ContactCandidate[];

  const select = {
    id: true,
    name: true,
    phoneNumber: true,
    assignedMerchant: true,
    birthMonth: true,
    birthDay: true,
    lastPurchaseAt: true,
    loyaltyAssignedAt: true,
  } as const;

  if (brandNeedle) {
    const brandIds = brandRanks
      .slice(0, BRAND_FILTER_RANK_CAP)
      .map((r) => r.contactId)
      .filter((id) => (itemContactIds ? itemContactIds.has(id) : true));
    const rows = await prisma.contactMaster.findMany({
      where: { ...where, id: { in: brandIds } } as never,
      select,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    candidates = [];
    for (const id of brandIds) {
      const row = byId.get(id);
      if (row) candidates.push(row);
    }
  } else if (itemContactIds) {
    const ids = [...itemContactIds].slice(0, FILTER_CANDIDATE_CAP);
    candidates = await prisma.contactMaster.findMany({
      where: { ...where, id: { in: ids } } as never,
      select,
    });
  } else {
    candidates = await prisma.contactMaster.findMany({
      where: where as never,
      select,
      take: FILTER_CANDIDATE_CAP,
      orderBy: { updatedAt: "desc" },
    });
  }

  const contacted = await lastContactedMap(
    input.companyId,
    candidates.map((c) => c.id)
  );

  const scored: Array<{
    contactId: string;
    name: string;
    phoneNumber: string | null;
    lifetimeTotal: number;
    brandSpend: number | null;
    assignedMerchant: string | null;
    key: LoyaltyTierKey;
  }> = [];

  for (const contact of candidates) {
    if (input.birthdayFrom && input.birthdayTo) {
      if (
        !matchesBirthdayRange(
          contact.birthMonth,
          contact.birthDay,
          input.birthdayFrom,
          input.birthdayTo
        )
      ) {
        continue;
      }
    }

    if (
      !inLastContactedRange(
        contacted.get(contact.id),
        input.lastContactedFrom,
        input.lastContactedTo
      )
    ) {
      continue;
    }

    if (input.noPurchaseFrom && input.noPurchaseTo) {
      if (
        !hasNoPurchaseInDateRange(
          contact.lastPurchaseAt,
          input.noPurchaseFrom,
          input.noPurchaseTo
        )
      ) {
        continue;
      }
    }

    const lifetimeTotal = await lifetimeTotalForContact(
      input.companyId,
      contact.id
    );

    const key = classifyLoyaltyTierKey(lifetimeTotal);
    if (input.minTotal != null && lifetimeTotal < input.minTotal) continue;
    if (input.maxTotal != null && lifetimeTotal > input.maxTotal) continue;

    const brandSpend = brandNeedle
      ? brandSpendById.get(contact.id) ?? 0
      : null;
    if (brandNeedle && !(brandSpend && brandSpend > 0)) continue;

    scored.push({
      contactId: contact.id,
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      lifetimeTotal,
      brandSpend,
      assignedMerchant: contact.assignedMerchant,
      key,
    });
  }

  if (brandNeedle) {
    scored.sort((a, b) => {
      const spendDiff = (b.brandSpend ?? 0) - (a.brandSpend ?? 0);
      if (spendDiff !== 0) return spendDiff;
      return b.lifetimeTotal - a.lifetimeTotal;
    });
  } else {
    scored.sort((a, b) => b.lifetimeTotal - a.lifetimeTotal);
  }

  const total = scored.length;
  const start = (input.page - 1) * input.pageSize;
  const pageItems = scored.slice(start, start + input.pageSize);

  return {
    items: pageItems.map((row) => {
      const loyalty = buildLoyaltyDto(row.lifetimeTotal);
      return {
        contactId: row.contactId,
        name: row.name,
        phoneNumber: row.phoneNumber,
        lifetimeTotal: row.lifetimeTotal,
        brandSpend: row.brandSpend,
        loyalty: {
          key: loyalty.key,
          label: loyaltyLabel(row.key),
          code: loyaltyCode(row.key),
        },
        assignedMerchant: row.assignedMerchant,
      };
    }),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
    },
  };
}
