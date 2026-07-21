import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { CustomerResponse, FollowUpStatus } from "@/lib/abandoned-orders-constants";
import { CUSTOMER_RESPONSES, FOLLOW_UP_STATUSES } from "@/lib/abandoned-orders-constants";
import type {
  AbandonedOrdersFilters,
  AbandonedOrdersListItem,
  AbandonedOrdersPagination,
} from "@/lib/page-data/abandoned-orders-types";

function parseFollowUpStatus(value: string): FollowUpStatus {
  return (FOLLOW_UP_STATUSES as readonly string[]).includes(value)
    ? (value as FollowUpStatus)
    : "pending";
}

function parseCustomerResponse(value: string | null): CustomerResponse | null {
  if (!value) return null;
  return (CUSTOMER_RESPONSES as readonly string[]).includes(value)
    ? (value as CustomerResponse)
    : null;
}

function toEndOfDayUtc(d: Date) {
  const end = new Date(d);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function buildWhere({
  companyId,
  filters,
}: {
  companyId: string;
  filters: AbandonedOrdersFilters;
}): Prisma.ShopifyAbandonedCheckoutWhereInput {
  const search = filters.search?.trim();

  const followUpStatus: string[] = filters.followUpStatus?.length
    ? [...filters.followUpStatus]
    : ["pending", "follow_up"];

  const where: Prisma.ShopifyAbandonedCheckoutWhereInput = {
    companyId,
    followUpStatus: { in: followUpStatus },
  };

  if (filters.from || filters.to) {
    where.abandonedAt = {};
    if (filters.from) where.abandonedAt.gte = filters.from;
    if (filters.to) where.abandonedAt.lte = toEndOfDayUtc(filters.to);
  }

  if (filters.customerResponse?.length) {
    where.customerResponse = { in: [...filters.customerResponse] };
  }

  if (search) {
    where.OR = [
      { customerName: { contains: search, mode: "insensitive" } },
      { customerPhone: { contains: search, mode: "insensitive" } },
      { customerEmail: { contains: search, mode: "insensitive" } },
      { lineItemsSummary: { contains: search, mode: "insensitive" } },
      // Store numeric Shopify checkout id as string
      { shopifyCheckoutId: { contains: search, mode: "insensitive" } },
      { shopifyAdminStoreHandle: { contains: search, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function fetchAbandonedOrdersPageData({
  companyId,
  filters,
}: {
  companyId: string;
  filters: AbandonedOrdersFilters;
}): Promise<{ items: AbandonedOrdersListItem[]; pagination: AbandonedOrdersPagination }> {
  const page = filters.page;
  const limit = filters.limit;
  const skip = (page - 1) * limit;

  const where = buildWhere({ companyId, filters });

  const [rows, total] = await Promise.all([
    prisma.shopifyAbandonedCheckout.findMany({
      where,
      orderBy: { abandonedAt: "desc" },
      skip,
      take: limit,
      include: {
        lastFollowUpBy: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
    prisma.shopifyAbandonedCheckout.count({ where }),
  ]);

  const items: AbandonedOrdersListItem[] = rows.map((r) => ({
    id: r.id,
    shopifyCheckoutId: r.shopifyCheckoutId,
    abandonedAt: r.abandonedAt.toISOString(),
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    customerEmail: r.customerEmail,
    lineItemsSummary: r.lineItemsSummary,
    totalPrice: r.totalPrice.toString(),
    currency: r.currency,
    shopifyAdminStoreHandle: r.shopifyAdminStoreHandle,

    followUpStatus: parseFollowUpStatus(r.followUpStatus),
    customerResponse: parseCustomerResponse(r.customerResponse),
    remark: r.remark ?? null,

    lastFollowUpBy: r.lastFollowUpBy
      ? {
          id: r.lastFollowUpBy.id,
          name: r.lastFollowUpBy.name,
          email: r.lastFollowUpBy.email ?? null,
        }
      : null,
    lastFollowUpAt: r.lastFollowUpAt ? r.lastFollowUpAt.toISOString() : null,
    shopifyRecoveredAt: r.shopifyRecoveredAt ? r.shopifyRecoveredAt.toISOString() : null,
  }));

  return {
    items,
    pagination: {
      page,
      limit,
      total,
    },
  };
}

