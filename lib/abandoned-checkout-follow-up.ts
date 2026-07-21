import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { abandonedOrderFollowUpPatchBodySchema } from "@/lib/validation";
import type { CustomerResponse, FollowUpStatus } from "@/lib/abandoned-orders-constants";
import { CUSTOMER_RESPONSES, FOLLOW_UP_STATUSES } from "@/lib/abandoned-orders-constants";
import type { AbandonedOrdersListItem } from "@/lib/page-data/abandoned-orders-types";

type CheckoutRow = {
  id: string;
  shopifyCheckoutId: string;
  abandonedAt: Date;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  lineItemsSummary: string;
  totalPrice: { toString(): string };
  currency: string;
  shopifyAdminStoreHandle: string;
  followUpStatus: string;
  customerResponse: string | null;
  remark: string | null;
  lastFollowUpAt: Date | null;
  shopifyRecoveredAt: Date | null;
  lastFollowUpBy: { id: string; name: string | null; email: string | null } | null;
};

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

function toListItem(row: CheckoutRow): AbandonedOrdersListItem {
  return {
    id: row.id,
    shopifyCheckoutId: row.shopifyCheckoutId,
    abandonedAt: row.abandonedAt.toISOString(),
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerEmail: row.customerEmail,
    lineItemsSummary: row.lineItemsSummary,
    totalPrice: row.totalPrice.toString(),
    currency: row.currency,
    shopifyAdminStoreHandle: row.shopifyAdminStoreHandle,
    followUpStatus: parseFollowUpStatus(row.followUpStatus),
    customerResponse: parseCustomerResponse(row.customerResponse),
    remark: row.remark ?? null,
    lastFollowUpBy: row.lastFollowUpBy
      ? {
          id: row.lastFollowUpBy.id,
          name: row.lastFollowUpBy.name,
          email: row.lastFollowUpBy.email ?? null,
        }
      : null,
    lastFollowUpAt: row.lastFollowUpAt ? row.lastFollowUpAt.toISOString() : null,
    shopifyRecoveredAt: row.shopifyRecoveredAt ? row.shopifyRecoveredAt.toISOString() : null,
  };
}

export async function updateAbandonedCheckoutFollowUp(input: {
  id: string;
  companyId: string;
  actorUserId: string;
  body: unknown;
}): Promise<AbandonedOrdersListItem> {
  const parsedBody = abandonedOrderFollowUpPatchBodySchema.safeParse(input.body);
  if (!parsedBody.success) {
    const first = parsedBody.error.issues[0];
    throw new Error(first?.message ?? "Invalid follow-up payload");
  }

  const { followUpStatus, customerResponse, remark } = parsedBody.data;

  const row = await prisma.shopifyAbandonedCheckout.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      companyId: true,
      shopifyCheckoutId: true,
      abandonedAt: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      lineItemsSummary: true,
      totalPrice: true,
      currency: true,
      shopifyAdminStoreHandle: true,
      followUpStatus: true,
      customerResponse: true,
      remark: true,
      lastFollowUpById: true,
      lastFollowUpAt: true,
      shopifyRecoveredAt: true,
      lastFollowUpBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!row || row.companyId !== input.companyId) {
    throw new Error("Not found");
  }

  const nextCustomerResponse =
    followUpStatus === "closed" ? customerResponse ?? null : row.customerResponse;

  const nextRemark = remark === undefined ? row.remark : remark ?? null;

  const updated = await prisma.shopifyAbandonedCheckout.update({
    where: { id: input.id },
    data: {
      followUpStatus,
      customerResponse: nextCustomerResponse,
      remark: nextRemark,
      lastFollowUpById: input.actorUserId,
      lastFollowUpAt: new Date(),
    },
    include: {
      lastFollowUpBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  await writeAuditLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    module: "orders",
    action: "abandoned_order_follow_up_saved",
    entityType: "shopify_abandoned_checkout",
    entityId: updated.id,
    summary: `Abandoned checkout follow-up updated to ${followUpStatus}`,
    beforeData: {
      followUpStatus: row.followUpStatus,
      customerResponse: row.customerResponse,
      remark: row.remark,
    },
    afterData: {
      followUpStatus: updated.followUpStatus,
      customerResponse: updated.customerResponse,
      remark: updated.remark,
    },
    metadata: {
      companyId: input.companyId,
    },
  });

  return toListItem(updated);
}
