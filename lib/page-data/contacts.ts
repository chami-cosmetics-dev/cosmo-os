import type { Prisma } from "@prisma/client";

import { dedupeContactsForDisplay } from "@/lib/contact-display-dedupe";
import { findContactIdsByPurchasedBrand } from "@/lib/page-data/contact-brand-ids";
import {
  buildContactPhoneSearchOrFilters,
  isPhoneLikeSearch,
} from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";
import { maybeLogSlowDbRequest } from "@/lib/dbObservability";

const ACTIVE_WINDOW_DAYS = 180;
export const CONTACTS_UNALLOCATED = "__unallocated";

function getActiveCutoff() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ACTIVE_WINDOW_DAYS);
  return cutoff;
}

function deriveStatus(lastPurchaseAt: Date | null): "active" | "inactive" | "never_purchased" {
  if (!lastPurchaseAt) return "never_purchased";
  return lastPurchaseAt >= getActiveCutoff() ? "active" : "inactive";
}

export type ContactsPageParams = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  status?: "active" | "inactive" | "never_purchased" | null;
  search?: string | null;
  /** Exact allocated merchant label, or `__unallocated` for empty. */
  allocatedTo?: string | null;
  /** Vendor / brand name purchased. */
  brand?: string | null;
};

function buildContactsSearchWhere(search: string): Prisma.ContactMasterWhereInput {
  const or: Prisma.ContactMasterWhereInput[] = [
    { name: { contains: search, mode: "insensitive" } },
    { email: { contains: search, mode: "insensitive" } },
    { recentMerchant: { contains: search, mode: "insensitive" } },
    { assignedMerchant: { contains: search, mode: "insensitive" } },
  ];

  if (isPhoneLikeSearch(search)) {
    or.push(
      ...(buildContactPhoneSearchOrFilters(search) as Prisma.ContactMasterWhereInput[])
    );
  } else {
    or.push({ phoneNumber: { contains: search, mode: "insensitive" } });
  }

  return { OR: or };
}

function andWhere(
  where: Prisma.ContactMasterWhereInput,
  clause: Prisma.ContactMasterWhereInput
) {
  if (Array.isArray(where.AND)) {
    where.AND = [...where.AND, clause];
  } else if (where.AND) {
    where.AND = [where.AND, clause];
  } else {
    where.AND = [clause];
  }
}

/** Shared filter where for Contact Master list + export. */
export async function buildContactsListWhere(
  companyId: string,
  params: Pick<ContactsPageParams, "status" | "search" | "allocatedTo" | "brand"> = {}
): Promise<Prisma.ContactMasterWhereInput> {
  const cutoff = getActiveCutoff();
  const where: Prisma.ContactMasterWhereInput = { companyId };

  if (params.status === "active") {
    where.lastPurchaseAt = { gte: cutoff };
  } else if (params.status === "inactive") {
    where.lastPurchaseAt = { lt: cutoff };
  } else if (params.status === "never_purchased") {
    where.lastPurchaseAt = null;
  }

  if (params.search?.trim()) {
    andWhere(where, buildContactsSearchWhere(params.search.trim()));
  }

  const allocatedTo = params.allocatedTo?.trim() || null;
  if (allocatedTo === CONTACTS_UNALLOCATED) {
    andWhere(where, {
      OR: [{ assignedMerchant: null }, { assignedMerchant: "" }],
    });
  } else if (allocatedTo) {
    andWhere(where, {
      assignedMerchant: { equals: allocatedTo, mode: "insensitive" },
    });
  }

  const brand = params.brand?.trim() || null;
  if (brand) {
    const brandContactIds = await findContactIdsByPurchasedBrand(companyId, brand);
    if (brandContactIds.length === 0) {
      // Force empty result set (no contact id will match).
      andWhere(where, { id: { equals: "__no_brand_match__" } });
    } else {
      andWhere(where, { id: { in: brandContactIds } });
    }
  }

  return where;
}

export type ContactsPageOptions = {
  assignedMerchants: string[];
  brands: string[];
  assignees: Array<{ id: string; label: string }>;
};

async function fetchContactsPageOptions(companyId: string): Promise<ContactsPageOptions> {
  const [assignedRows, vendors, assigneeRows] = await Promise.all([
    prisma.contactMaster.findMany({
      where: {
        companyId,
        AND: [
          { assignedMerchant: { not: null } },
          { assignedMerchant: { not: "" } },
        ],
      },
      distinct: ["assignedMerchant"],
      select: { assignedMerchant: true },
      orderBy: { assignedMerchant: "asc" },
      take: 500,
    }),
    prisma.vendor.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
    prisma.user.findMany({
      where: {
        companyId,
        OR: [
          { employeeProfile: null },
          { employeeProfile: { status: "active" } },
        ],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, knownName: true, email: true },
      take: 300,
    }),
  ]);

  const assignedMerchants = assignedRows
    .map((r) => r.assignedMerchant?.trim())
    .filter((v): v is string => Boolean(v));

  const seenBrands = new Set<string>();
  const brands: string[] = [];
  for (const v of vendors) {
    const name = v.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seenBrands.has(key)) continue;
    seenBrands.add(key);
    brands.push(name);
  }

  return {
    assignedMerchants,
    brands,
    assignees: assigneeRows.map((user) => ({
      id: user.id,
      label: user.knownName?.trim() || user.name?.trim() || user.email?.trim() || "Unnamed user",
    })),
  };
}

export async function fetchContactsPageData(companyId: string, params: ContactsPageParams = {}) {
  const startedAt = Date.now();
  const page = params.page ?? 1;
  const limit = params.limit ?? 10;
  const sortOrder = params.sortOrder ?? "desc";
  const sortBy = params.sortBy?.trim();
  const cutoff = getActiveCutoff();

  const SORT_FIELDS: Record<string, Prisma.ContactMasterOrderByWithRelationInput> = {
    name: { name: sortOrder },
    updated: { updatedAt: sortOrder },
    last_purchase: { lastPurchaseAt: sortOrder },
  };
  const orderBy: Prisma.ContactMasterOrderByWithRelationInput =
    sortBy && sortBy in SORT_FIELDS ? SORT_FIELDS[sortBy]! : { updatedAt: "desc" };

  const where = await buildContactsListWhere(companyId, params);

  const [activeCount, inactiveCount, neverPurchasedCount, rawContacts, options] =
    await Promise.all([
      prisma.contactMaster.count({ where: { companyId, lastPurchaseAt: { gte: cutoff } } }),
      prisma.contactMaster.count({ where: { companyId, lastPurchaseAt: { lt: cutoff } } }),
      prisma.contactMaster.count({ where: { companyId, lastPurchaseAt: null } }),
      prisma.contactMaster.findMany({
        where,
        orderBy,
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          lastPurchaseAt: true,
          recentMerchant: true,
          assignedMerchant: true,
          birthYear: true,
          birthMonth: true,
          birthDay: true,
          updatedAt: true,
          createdAt: true,
        },
      }),
      fetchContactsPageOptions(companyId),
    ]);

  const dedupedContacts = dedupeContactsForDisplay(rawContacts);
  const total = dedupedContacts.length;
  const contacts = dedupedContacts.slice((page - 1) * limit, page * limit);

  const payload = {
    contacts: contacts.map((contact) => ({
      ...contact,
      status: deriveStatus(contact.lastPurchaseAt),
      lastPurchaseAt: contact.lastPurchaseAt?.toISOString() ?? null,
      updatedAt: contact.updatedAt.toISOString(),
      createdAt: contact.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
    counts: {
      all: activeCount + inactiveCount + neverPurchasedCount,
      active: activeCount,
      inactive: inactiveCount,
      neverPurchased: neverPurchasedCount,
    },
    options,
  };
  maybeLogSlowDbRequest("contacts.page_data", startedAt, {
    companyId,
    page,
    limit,
    total,
  });

  return payload;
}
