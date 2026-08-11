import { listContactEmails, listContactPhones } from "@/lib/contact-identifiers";
import { buildContactOrderLookupOr } from "@/lib/contact-purchase-lookup";
import { computeLifetimeTotal } from "@/lib/customer-insight/lifetime-total";
import {
  buildLoyaltyDto,
  classifyLoyaltyTierKey,
  isPushToGold,
  isPushToPlatinum,
  loyaltyCode,
  loyaltyLabel,
} from "@/lib/customer-insight/loyalty-tier";
import { merchantMatchKeysForUser } from "@/lib/customer-insight/ownership";
import type {
  AllocatedFilterResultDto,
  LoyaltyTierKey,
} from "@/lib/customer-insight/types";
import { findContactsByPurchasedBrandRanked } from "@/lib/page-data/contact-brand-ids";
import { prisma } from "@/lib/prisma";

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
  /** When true, filters include all company contacts (not only allocated). */
  scopeAllContacts?: boolean;
  pushGold?: boolean;
  pushPlatinum?: boolean;
  loyalty?: LoyaltyTierKey;
  brand?: string;
  minTotal?: number;
  maxTotal?: number;
  birthdayThisMonth?: boolean;
  /** No purchase in the last N months (3 or 6). Uses ContactMaster.lastPurchaseAt. */
  noPurchaseMonths?: 3 | 6;
  page: number;
  pageSize: number;
};

const FILTER_CANDIDATE_CAP = 800;
/** When brand filter is on, walk top brand spenders (same matching as Contact Master). */
const BRAND_FILTER_RANK_CAP = 2_000;

export function matchesBirthdayThisMonth(
  birthMonth: number | null | undefined,
  now = new Date()
): boolean {
  if (birthMonth == null || birthMonth < 1 || birthMonth > 12) return false;
  return birthMonth === now.getMonth() + 1;
}

/** Cutoff instant: purchases strictly before this count as outside the window. */
export function noPurchaseCutoff(months: 3 | 6, now = new Date()): Date {
  const d = new Date(now.getTime());
  d.setMonth(d.getMonth() - months);
  return d;
}

/**
 * True when contact has never purchased, or last purchase is older than `months`.
 * Relies on ContactMaster.lastPurchaseAt (synced from orders / Adapt).
 */
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
};

function buildAllocationWhere(input: FilterQueryInput): {
  empty: boolean;
  where: Record<string, unknown>;
} {
  const labels = merchantMatchKeysForUser(input.viewer);
  const currentMonth = new Date().getMonth() + 1;
  const scopeAll = Boolean(input.scopeAllContacts ?? input.isAdmin);

  const where: Record<string, unknown> = {
    companyId: input.companyId,
  };

  if (scopeAll) {
    // Admins / permitted users: every company contact matching other filters.
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

  if (input.birthdayThisMonth) {
    where.birthMonth = currentMonth;
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
  const brandRanks = brandNeedle
    ? await findContactsByPurchasedBrandRanked(input.companyId, brandNeedle)
    : [];
  const brandSpendById = new Map(
    brandRanks.map((r) => [r.contactId, r.brandSpend] as const)
  );

  if (brandNeedle && brandRanks.length === 0) {
    return emptyResult();
  }

  let candidates: ContactCandidate[];

  if (brandNeedle) {
    const brandIds = brandRanks
      .slice(0, BRAND_FILTER_RANK_CAP)
      .map((r) => r.contactId);
    const rows = await prisma.contactMaster.findMany({
      where: { ...where, id: { in: brandIds } } as never,
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        assignedMerchant: true,
        birthMonth: true,
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    // Preserve brand-spend ranking from Contact Master logic.
    candidates = [];
    for (const id of brandIds) {
      const row = byId.get(id);
      if (row) candidates.push(row);
    }
  } else {
    candidates = await prisma.contactMaster.findMany({
      where: where as never,
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        assignedMerchant: true,
        birthMonth: true,
      },
      take: FILTER_CANDIDATE_CAP,
      orderBy: { updatedAt: "desc" },
    });
  }

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
    if (
      input.birthdayThisMonth &&
      !matchesBirthdayThisMonth(contact.birthMonth)
    ) {
      continue;
    }

    const lifetimeTotal = await lifetimeTotalForContact(
      input.companyId,
      contact.id
    );

    if (input.pushGold && !isPushToGold(lifetimeTotal)) continue;
    if (input.pushPlatinum && !isPushToPlatinum(lifetimeTotal)) continue;

    const key = classifyLoyaltyTierKey(lifetimeTotal);
    if (input.loyalty && key !== input.loyalty) continue;
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
    // Already walked in brand-spend order; keep that, break ties by lifetime.
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

// (no exports)
