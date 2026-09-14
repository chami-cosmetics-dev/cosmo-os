import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { abandonedOrderFollowUpPatchBodySchema } from "@/lib/validation";
import type {
  AbandonmentReason,
  CustomerResponse,
  FollowUpStatus,
} from "@/lib/abandoned-orders-constants";
import { ABANDONMENT_REASONS, FOLLOW_UP_STATUSES } from "@/lib/abandoned-orders-constants";
import type { AbandonedOrdersListItem } from "@/lib/page-data/abandoned-orders-types";

type CheckoutRow = {
  id: string;
  shopifyCheckoutId: string;
  abandonedAt: Date;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  billingAddressText: string | null;
  shippingAddressText: string | null;
  lineItemsSummary: string;
  totalPrice: { toString(): string };
  currency: string;
  shopifyAdminStoreHandle: string;
  followUpStatus: string;
  customerResponse: string | null;
  remark: string | null;
  abandonmentReason: string | null;
  exactDuplicateGroupId: string | null;
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
  return value as CustomerResponse;
}

function parseAbandonmentReason(value: string | null): AbandonmentReason | null {
  if (!value) return null;
  return (ABANDONMENT_REASONS as readonly string[]).includes(value)
    ? (value as AbandonmentReason)
    : null;
}

function toListItem(
  row: CheckoutRow,
  meta?: {
    exactDuplicateCount?: number;
    sameDaySiblingCount?: number;
    sameDaySiblings?: AbandonedOrdersListItem["sameDaySiblings"];
  }
): AbandonedOrdersListItem {
  return {
    id: row.id,
    shopifyCheckoutId: row.shopifyCheckoutId,
    abandonedAt: row.abandonedAt.toISOString(),
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerEmail: row.customerEmail,
    billingAddressText: row.billingAddressText,
    shippingAddressText: row.shippingAddressText,
    lineItemsSummary: row.lineItemsSummary,
    totalPrice: row.totalPrice.toString(),
    currency: row.currency,
    shopifyAdminStoreHandle: row.shopifyAdminStoreHandle,
    followUpStatus: parseFollowUpStatus(row.followUpStatus),
    customerResponse: parseCustomerResponse(row.customerResponse),
    remark: row.remark ?? null,
    abandonmentReason: parseAbandonmentReason(row.abandonmentReason),
    exactDuplicateGroupId: row.exactDuplicateGroupId,
    exactDuplicateCount: meta?.exactDuplicateCount ?? 1,
    sameDaySiblingCount: meta?.sameDaySiblingCount ?? 0,
    sameDaySiblings: meta?.sameDaySiblings ?? [],
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

const followUpSelect = {
  id: true,
  companyId: true,
  shopifyCheckoutId: true,
  abandonedAt: true,
  customerName: true,
  customerPhone: true,
  customerEmail: true,
  billingAddressText: true,
  shippingAddressText: true,
  lineItemsSummary: true,
  totalPrice: true,
  currency: true,
  shopifyAdminStoreHandle: true,
  followUpStatus: true,
  customerResponse: true,
  remark: true,
  abandonmentReason: true,
  exactDuplicateGroupId: true,
  lastFollowUpById: true,
  lastFollowUpAt: true,
  shopifyRecoveredAt: true,
  lastFollowUpBy: {
    select: { id: true, name: true, email: true },
  },
} as const;

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

  const { followUpStatus, customerResponse, remark, abandonmentReason } = parsedBody.data;

  const row = await prisma.shopifyAbandonedCheckout.findUnique({
    where: { id: input.id },
    select: followUpSelect,
  });

  if (!row || row.companyId !== input.companyId) {
    throw new Error("Not found");
  }

  const nextCustomerResponse =
    followUpStatus === "closed" ? customerResponse ?? null : null;

  const nextRemark = remark === undefined ? row.remark : remark ?? null;
  const nextAbandonmentReason =
    abandonmentReason === undefined ? row.abandonmentReason : abandonmentReason;

  const now = new Date();
  const updateData = {
    followUpStatus,
    customerResponse: nextCustomerResponse,
    remark: nextRemark,
    abandonmentReason: nextAbandonmentReason,
    lastFollowUpById: input.actorUserId,
    lastFollowUpAt: now,
  };

  let peerIds: string[] = [];
  if (row.exactDuplicateGroupId) {
    const peers = await prisma.shopifyAbandonedCheckout.findMany({
      where: {
        companyId: input.companyId,
        exactDuplicateGroupId: row.exactDuplicateGroupId,
      },
      select: { id: true },
    });
    peerIds = peers.map((p) => p.id);
    await prisma.shopifyAbandonedCheckout.updateMany({
      where: {
        companyId: input.companyId,
        exactDuplicateGroupId: row.exactDuplicateGroupId,
      },
      data: updateData,
    });
  } else {
    peerIds = [row.id];
    await prisma.shopifyAbandonedCheckout.update({
      where: { id: row.id },
      data: updateData,
    });
  }

  const updated = await prisma.shopifyAbandonedCheckout.findUniqueOrThrow({
    where: { id: row.id },
    select: followUpSelect,
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
      abandonmentReason: row.abandonmentReason,
    },
    afterData: {
      followUpStatus: updated.followUpStatus,
      customerResponse: updated.customerResponse,
      remark: updated.remark,
      abandonmentReason: updated.abandonmentReason,
    },
    metadata: {
      companyId: input.companyId,
      exactDuplicateGroupId: row.exactDuplicateGroupId,
      peerCount: peerIds.length,
      peerIds,
    },
  });

  return toListItem(updated, { exactDuplicateCount: peerIds.length });
}
