import { listContactEmails, listContactPhones } from "@/lib/contact-identifiers";
import { buildContactOrderLookupOr } from "@/lib/contact-purchase-lookup";
import { brandFromAdaptLineItem, brandFromVendorName, brandsMatch } from "@/lib/customer-insight/brand";
import { computeLifetimeTotal } from "@/lib/customer-insight/lifetime-total";
import {
  buildLoyaltyDto,
  classifyLoyaltyTierKey,
  isPushToGold,
  isPushToPlatinum,
  loyaltyCode,
  loyaltyLabel,
} from "@/lib/customer-insight/loyalty-tier";
import { normalizeMerchantLabel, viewerMerchantLabels } from "@/lib/customer-insight/ownership";
import type {
  AllocatedFilterResultDto,
  LoyaltyTierKey,
} from "@/lib/customer-insight/types";
import { prisma } from "@/lib/prisma";

export type FilterQueryInput = {
  companyId: string;
  viewer: {
    knownName?: string | null;
    name?: string | null;
    email?: string | null;
    roleNames?: string[];
  };
  isAdmin: boolean;
  pushGold?: boolean;
  pushPlatinum?: boolean;
  loyalty?: LoyaltyTierKey;
  brand?: string;
  minTotal?: number;
  maxTotal?: number;
  birthdayThisMonth?: boolean;
  page: number;
  pageSize: number;
};

const FILTER_CANDIDATE_CAP = 800;

export function matchesBirthdayThisMonth(
  birthMonth: number | null | undefined,
  now = new Date()
): boolean {
  if (birthMonth == null || birthMonth < 1 || birthMonth > 12) return false;
  return birthMonth === now.getMonth() + 1;
}

async function contactHasBrand(
  companyId: string,
  contactId: string,
  brand: string
): Promise<boolean> {
  const contact = await prisma.contactMaster.findFirst({
    where: { id: contactId, companyId },
    select: {
      email: true,
      phoneNumber: true,
    },
  });
  if (!contact) return false;

  const emails = await listContactEmails(contactId, contact.email);
  const phones = await listContactPhones(contactId, contact.phoneNumber);
  const orderLookupOr = buildContactOrderLookupOr({ phones, emails });

  if (orderLookupOr.length > 0) {
    const orders = await prisma.order.findMany({
      where: {
        companyId,
        cancelledAt: null,
        OR: orderLookupOr,
      },
      select: {
        lineItems: {
          select: {
            productItem: {
              select: { vendor: { select: { name: true } } },
            },
          },
        },
      },
      take: 200,
    });
    for (const order of orders) {
      for (const li of order.lineItems) {
        const b = brandFromVendorName(li.productItem.vendor?.name);
        if (brandsMatch(b, brand)) return true;
      }
    }
  }

  const adaptRows = await prisma.adaptPurchaseHistory.findMany({
    where: { contactId, companyId },
    select: { lineItems: true },
    take: 100,
  });
  for (const row of adaptRows) {
    const items = Array.isArray(row.lineItems) ? row.lineItems : [];
    for (const item of items) {
      if (brandsMatch(brandFromAdaptLineItem(item), brand)) return true;
    }
  }
  return false;
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

export async function filterAllocatedContacts(
  input: FilterQueryInput
): Promise<AllocatedFilterResultDto> {
  const labels = viewerMerchantLabels(input.viewer);
  const currentMonth = new Date().getMonth() + 1;

  const where: {
    companyId: string;
    assignedMerchant?: { not: null } | { in: string[]; mode: "insensitive" } | { not: null; equals?: never };
    birthMonth?: number;
    AND?: Array<Record<string, unknown>>;
  } = {
    companyId: input.companyId,
  };

  if (input.isAdmin) {
    where.assignedMerchant = { not: null };
  } else if (labels.length === 0) {
    return {
      items: [],
      pagination: { page: input.page, pageSize: input.pageSize, total: 0 },
    };
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

  const candidates = await prisma.contactMaster.findMany({
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

  const scored: Array<{
    contactId: string;
    name: string;
    phoneNumber: string | null;
    lifetimeTotal: number;
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

    if (input.brand) {
      const hasBrand = await contactHasBrand(
        input.companyId,
        contact.id,
        input.brand
      );
      if (!hasBrand) continue;
    }

    scored.push({
      contactId: contact.id,
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      lifetimeTotal,
      assignedMerchant: contact.assignedMerchant,
      key,
    });
  }

  scored.sort((a, b) => b.lifetimeTotal - a.lifetimeTotal);

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

/** Exported for tests — label equality helper */
export { normalizeMerchantLabel };
