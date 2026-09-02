import { effectiveLoyaltyTierKey } from "@/lib/customer-insight/erp-loyalty";
import { findContactIdsByLastPurchaseLocation } from "@/lib/customer-insight/last-purchase-location";
import { lifetimeTotalsByContactId } from "@/lib/customer-insight/lifetime-totals-batch";
import {
  loyaltyCode,
  loyaltyLabel,
} from "@/lib/customer-insight/loyalty-tier";
import { merchantContactAllocationKeys } from "@/lib/customer-insight/ownership";
import type { AllocatedFilterResultDto, LoyaltyTierKey } from "@/lib/customer-insight/types";
import { findContactsByPurchasedBrandRanked } from "@/lib/page-data/contact-brand-ids";
import { findContactsByPurchasedItemRanked } from "@/lib/customer-insight/item-filter";
import { findContactsByPurchasedItemStatusRanked } from "@/lib/customer-insight/item-status-filter";
import { resolveAssignedMerchantFilterLabels } from "@/lib/customer-insight/merchant-label-aliases";
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
  brands?: string[];
  items?: string[];
  /** ProductItem.itemStatusCategory values (e.g. VAT_TOP_PRIORITY_BRAND). */
  itemStatusCategories?: string[];
  city?: string;
  /** Admin-only: ContactMaster.assignedMerchant (alias groups expanded). */
  assignedMerchant?: string;
  /** Admin-only: company location id of the contact's latest purchase. */
  purchaseLocationId?: string;
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
  /** When true, return all matches (up to export cap) instead of one page. */
  forExport?: boolean;
};

/** Item-rank slice only. Unranked tot/city/birthday filters scan full admin or assigned set. */
const FILTER_CANDIDATE_CAP = 800;
const LAST_CONTACTED_ID_CHUNK = 4_000;
/** Safety cap for admin CSV export of filtered insight rows. */
export const FILTER_EXPORT_CAP = 25_000;

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

/** Union spend maps (OR): contact matches if they bought any selected brand/item. */
export function mergeRankedSpendMaps(
  rankLists: Array<Array<{ contactId: string; spend: number }>>
): { spendById: Map<string, number>; sortedContactIds: string[] } {
  const spendById = new Map<string, number>();
  for (const ranks of rankLists) {
    for (const row of ranks) {
      spendById.set(
        row.contactId,
        (spendById.get(row.contactId) ?? 0) + row.spend
      );
    }
  }
  const sortedContactIds = [...spendById.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([contactId]) => contactId);
  return { spendById, sortedContactIds };
}

const CONTACT_ID_IN_CHUNK = 800;
const CONTACT_ID_PAGE = 500;

async function findContactsByIds(
  ids: string[],
  where: Record<string, unknown>,
  select: Record<string, unknown>
): Promise<ContactCandidate[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CONTACT_ID_IN_CHUNK) {
    chunks.push(ids.slice(i, i + CONTACT_ID_IN_CHUNK));
  }
  const rows = (
    await Promise.all(
      chunks.map((slice) =>
        prisma.contactMaster.findMany({
          where: { ...where, id: { in: slice } } as never,
          select: select as never,
        })
      )
    )
  ).flat() as ContactCandidate[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered: ContactCandidate[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row) ordered.push(row);
  }
  return ordered;
}

async function findAllMatchingContactIds(
  where: Record<string, unknown>
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.contactMaster.findMany({
      where: where as never,
      select: { id: true },
      orderBy: { id: "asc" },
      take: CONTACT_ID_PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (page.length === 0) break;
    for (const row of page) ids.push(row.id);
    if (page.length < CONTACT_ID_PAGE) break;
    cursor = page[page.length - 1]!.id;
  }
  return ids;
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

type ContactCandidate = {
  id: string;
  name: string;
  phoneNumber: string | null;
  email: string | null;
  assignedMerchant: string | null;
  birthMonth: number | null;
  birthDay: number | null;
  lastPurchaseAt: Date | null;
  loyaltyAssignedAt: Date | null;
  loyaltyAssignedTier: string | null;
  phones: { phoneNumber: string }[];
  emails: { email: string }[];
};

async function buildAllocationWhere(input: FilterQueryInput): Promise<{
  empty: boolean;
  where: Record<string, unknown>;
}> {
  const labels = merchantContactAllocationKeys(input.viewer);
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

  const cityNeedle = input.city?.trim();
  if (cityNeedle) {
    const existingAnd = Array.isArray(where.AND)
      ? (where.AND as unknown[])
      : where.AND
        ? [where.AND]
        : [];
    where.AND = [
      ...existingAnd,
      { city: { equals: cityNeedle, mode: "insensitive" as const } },
    ];
  }

  const assignedNeedle = input.assignedMerchant?.trim();
  if (assignedNeedle) {
    const existingAnd = Array.isArray(where.AND)
      ? (where.AND as unknown[])
      : where.AND
        ? [where.AND]
        : [];
    const assignedAliases = await resolveAssignedMerchantFilterLabels(
      input.companyId,
      assignedNeedle
    );
    where.AND = [
      ...existingAnd,
      assignedAliases.length <= 1
        ? {
            assignedMerchant: {
              equals: assignedAliases[0] ?? assignedNeedle,
              mode: "insensitive" as const,
            },
          }
        : {
            OR: assignedAliases.map((alias) => ({
              assignedMerchant: {
                equals: alias,
                mode: "insensitive" as const,
              },
            })),
          },
    ];
  }

  return { empty: false, where };
}

async function lastContactedMap(
  companyId: string,
  contactIds: string[]
): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  if (contactIds.length === 0) return map;

  const chunks: string[][] = [];
  for (let i = 0; i < contactIds.length; i += LAST_CONTACTED_ID_CHUNK) {
    chunks.push(contactIds.slice(i, i + LAST_CONTACTED_ID_CHUNK));
  }

  const grouped = await Promise.all(
    chunks.map((slice) =>
      prisma.contactAllocationUpdate.groupBy({
        by: ["contactId"],
        where: {
          companyId,
          contactId: { in: slice },
          NOT: { category: "allocation" },
        },
        _max: { createdAt: true },
      })
    )
  );

  for (const rows of grouped) {
    for (const row of rows) {
      if (row._max.createdAt) map.set(row.contactId, row._max.createdAt);
    }
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

  const { empty, where } = await buildAllocationWhere(input);
  if (empty) return emptyResult();

  const purchaseLocationId = input.purchaseLocationId?.trim() || null;
  if (purchaseLocationId) {
    const locationContactIds = await findContactIdsByLastPurchaseLocation(
      input.companyId,
      purchaseLocationId
    );
    if (locationContactIds.length === 0) return emptyResult();
    const existingAnd = Array.isArray(where.AND)
      ? (where.AND as unknown[])
      : where.AND
        ? [where.AND]
        : [];
    where.AND = [...existingAnd, { id: { in: locationContactIds } }];
  }

  const brandNeedles = (input.brands ?? []).map((b) => b.trim()).filter(Boolean);
  const itemNeedles = (input.items ?? []).map((i) => i.trim()).filter(Boolean);
  const statusNeedles = (input.itemStatusCategories ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  const hasBrands = brandNeedles.length > 0;
  const hasItems = itemNeedles.length > 0;
  const hasStatus = statusNeedles.length > 0;
  /** Item label and/or live ProductItem status — both contribute to itemSpend. */
  const hasItemScope = hasItems || hasStatus;

  const brandRankLists = hasBrands
    ? await Promise.all(
        brandNeedles.map((brand) =>
          findContactsByPurchasedBrandRanked(input.companyId, brand)
        )
      )
    : [];
  const { spendById: brandSpendById, sortedContactIds: brandSortedIds } =
    mergeRankedSpendMaps(
      brandRankLists.map((ranks) =>
        ranks.map((r) => ({ contactId: r.contactId, spend: r.brandSpend }))
      )
    );

  if (hasBrands && brandSortedIds.length === 0) {
    return emptyResult();
  }

  const itemRankLists = hasItems
    ? await Promise.all(
        itemNeedles.map((item) =>
          findContactsByPurchasedItemRanked(
            input.companyId,
            item,
            hasBrands ? brandNeedles : null
          )
        )
      )
    : [];
  const statusRankList = hasStatus
    ? await findContactsByPurchasedItemStatusRanked(
        input.companyId,
        statusNeedles,
        hasBrands ? brandNeedles : null
      )
    : [];
  const { spendById: itemSpendById, sortedContactIds: itemSortedIds } =
    mergeRankedSpendMaps([
      ...itemRankLists.map((ranks) =>
        ranks.map((r) => ({ contactId: r.contactId, spend: r.itemSpend }))
      ),
      ...(hasStatus
        ? [
            statusRankList.map((r) => ({
              contactId: r.contactId,
              spend: r.itemSpend,
            })),
          ]
        : []),
    ]);
  const itemContactIds = hasItemScope ? new Set(itemSortedIds) : null;
  if (hasItemScope && (!itemContactIds || itemContactIds.size === 0)) {
    return emptyResult();
  }

  let candidates: ContactCandidate[];

  const select = {
    id: true,
    name: true,
    phoneNumber: true,
    email: true,
    assignedMerchant: true,
    birthMonth: true,
    birthDay: true,
    lastPurchaseAt: true,
    loyaltyAssignedAt: true,
    loyaltyAssignedTier: true,
    phones: { select: { phoneNumber: true } },
    emails: { select: { email: true } },
  } as const;

  if (hasBrands) {
    const brandIds = brandSortedIds.filter((id) =>
      itemContactIds ? itemContactIds.has(id) : true
    );
    candidates = await findContactsByIds(brandIds, where, select);
  } else if (itemContactIds) {
    const ids = itemSortedIds.slice(0, FILTER_CANDIDATE_CAP);
    candidates = await findContactsByIds(ids, where, select);
  } else {
    const ids = await findAllMatchingContactIds(where);
    candidates = await findContactsByIds(ids, where, select);
  }

  const needLastContacted = Boolean(
    input.lastContactedFrom || input.lastContactedTo
  );
  const contacted = await lastContactedMap(
    input.companyId,
    candidates.map((c) => c.id)
  );

  const eligible: ContactCandidate[] = [];
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
      needLastContacted &&
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

    eligible.push(contact);
  }

  const lifetimeById = await lifetimeTotalsByContactId(
    input.companyId,
    eligible
  );

  const scored: Array<{
    contactId: string;
    name: string;
    phoneNumber: string | null;
    lifetimeTotal: number;
    brandSpend: number | null;
    itemSpend: number | null;
    assignedMerchant: string | null;
    lastPurchaseAt: Date | null;
    lastContactedAt: Date | null;
    key: LoyaltyTierKey;
  }> = [];

  for (const contact of eligible) {
    const lifetimeTotal = lifetimeById.get(contact.id) ?? 0;

    // Badge = registered only; spend stays on lifetimeTotal / filters.
    const key = effectiveLoyaltyTierKey(contact.loyaltyAssignedTier);
    if (input.minTotal != null && lifetimeTotal < input.minTotal) continue;
    if (input.maxTotal != null && lifetimeTotal > input.maxTotal) continue;

    const brandSpend = hasBrands
      ? brandSpendById.has(contact.id)
        ? brandSpendById.get(contact.id) ?? 0
        : null
      : null;
    if (hasBrands && !brandSpendById.has(contact.id)) continue;

    const itemSpend = hasItemScope
      ? itemSpendById.has(contact.id)
        ? itemSpendById.get(contact.id) ?? 0
        : null
      : null;
    if (hasItemScope && !itemSpendById.has(contact.id)) continue;

    scored.push({
      contactId: contact.id,
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      lifetimeTotal,
      brandSpend,
      itemSpend,
      assignedMerchant: contact.assignedMerchant,
      lastPurchaseAt: contact.lastPurchaseAt,
      lastContactedAt: contacted.get(contact.id) ?? null,
      key,
    });
  }

  if (hasItemScope) {
    scored.sort((a, b) => {
      const spendDiff = (b.itemSpend ?? 0) - (a.itemSpend ?? 0);
      if (spendDiff !== 0) return spendDiff;
      return b.lifetimeTotal - a.lifetimeTotal;
    });
  } else if (hasBrands) {
    scored.sort((a, b) => {
      const spendDiff = (b.brandSpend ?? 0) - (a.brandSpend ?? 0);
      if (spendDiff !== 0) return spendDiff;
      return b.lifetimeTotal - a.lifetimeTotal;
    });
  } else {
    scored.sort((a, b) => b.lifetimeTotal - a.lifetimeTotal);
  }

  const total = scored.length;
  const exportRows = input.forExport
    ? scored.slice(0, FILTER_EXPORT_CAP)
    : null;
  const start = (input.page - 1) * input.pageSize;
  const pageItems = exportRows ?? scored.slice(start, start + input.pageSize);

  return {
    items: pageItems.map((row) => {
      return {
        contactId: row.contactId,
        name: row.name,
        phoneNumber: row.phoneNumber,
        lifetimeTotal: row.lifetimeTotal,
        brandSpend: row.brandSpend,
        itemSpend: row.itemSpend,
        loyalty: {
          key: row.key,
          label: loyaltyLabel(row.key),
          code: loyaltyCode(row.key),
        },
        assignedMerchant: row.assignedMerchant,
        lastPurchaseAt: row.lastPurchaseAt?.toISOString() ?? null,
        lastContactedAt: row.lastContactedAt?.toISOString() ?? null,
      };
    }),
    pagination: {
      page: input.forExport ? 1 : input.page,
      pageSize: input.forExport ? pageItems.length : input.pageSize,
      total,
    },
  };
}
