import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { maybeLogSlowDbRequest } from "@/lib/db-observability";

const ACTIVE_WINDOW_DAYS = 180;

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
};

export async function fetchContactsPageData(companyId: string, params: ContactsPageParams = {}) {
  const startedAt = Date.now();
  const page = params.page ?? 1;
  const limit = params.limit ?? 10;
  const sortOrder = params.sortOrder ?? "desc";
  const sortBy = params.sortBy?.trim();
  const skip = (page - 1) * limit;
  const cutoff = getActiveCutoff();

  const SORT_FIELDS: Record<string, Prisma.ContactMasterOrderByWithRelationInput> = {
    name: { name: sortOrder },
    updated: { updatedAt: sortOrder },
    last_purchase: { lastPurchaseAt: sortOrder },
  };
  const orderBy: Prisma.ContactMasterOrderByWithRelationInput =
    sortBy && sortBy in SORT_FIELDS ? SORT_FIELDS[sortBy]! : { updatedAt: "desc" };

  const where: Prisma.ContactMasterWhereInput = { companyId };
  if (params.status === "active") {
    where.lastPurchaseAt = { gte: cutoff };
  } else if (params.status === "inactive") {
    where.lastPurchaseAt = { lt: cutoff };
  } else if (params.status === "never_purchased") {
    where.lastPurchaseAt = null;
  }

  if (params.search?.trim()) {
    const search = params.search.trim();
    const searchWhere: Prisma.ContactMasterWhereInput = {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phoneNumber: { contains: search, mode: "insensitive" } },
        { recentMerchant: { contains: search, mode: "insensitive" } },
      ],
    };
    if (Array.isArray(where.AND)) {
      where.AND = [...where.AND, searchWhere];
    } else if (where.AND) {
      where.AND = [where.AND, searchWhere];
    } else {
      where.AND = [searchWhere];
    }
  }

  const [total, activeCount, inactiveCount, neverPurchasedCount, contacts] = await Promise.all([
    prisma.contactMaster.count({ where }),
    prisma.contactMaster.count({ where: { companyId, lastPurchaseAt: { gte: cutoff } } }),
    prisma.contactMaster.count({ where: { companyId, lastPurchaseAt: { lt: cutoff } } }),
    prisma.contactMaster.count({ where: { companyId, lastPurchaseAt: null } }),
    prisma.contactMaster.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        lastPurchaseAt: true,
        recentMerchant: true,
        updatedAt: true,
        createdAt: true,
      },
    }),
  ]);

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
  };
  maybeLogSlowDbRequest("contacts.page_data", startedAt, {
    companyId,
    page,
    limit,
    total,
  });

  return payload;
}
