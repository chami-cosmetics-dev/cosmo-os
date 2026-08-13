import { getLastContactedAt } from "@/lib/customer-insight/contacted";
import { lifetimeTotalsByContactId } from "@/lib/customer-insight/lifetime-totals-batch";
import {
  isLoyaltyEligibleByTotal,
  LOYALTY_OUTREACH_QUEUE_STATUSES,
  suggestedLoyaltyTier,
} from "@/lib/customer-insight/loyalty-outreach";
import { merchantMatchKeysForUser } from "@/lib/customer-insight/ownership";
import { prisma } from "@/lib/prisma";

export type MerchantLoyaltyOutreachItem = {
  contactId: string;
  name: string;
  phoneNumber: string | null;
  lifetimeTotal: number;
  /** Computed Gold/Platinum from spend — customer still Standard until assigned. */
  suggestedTier: "gold" | "platinum";
  status: string;
  lastContactedAt: string | null;
};

const CANDIDATE_CAP = 2_000;
const LIFETIME_CHUNK = 400;

/**
 * Allocated customers eligible for Gold/Platinum by lifetime spend, but still
 * Standard (no loyaltyAssignedTier — not registered in ERP/Shopify via OS).
 * Includes mid-outreach (contacted / responded / not_responded).
 */
export async function fetchMerchantLoyaltyOutreach(input: {
  companyId: string;
  viewer: {
    knownName?: string | null;
    name?: string | null;
    email?: string | null;
    couponCodes?: string[] | null;
  };
  take?: number;
}): Promise<MerchantLoyaltyOutreachItem[]> {
  const labels = merchantMatchKeysForUser(input.viewer);
  if (labels.length === 0) return [];

  const limit = input.take ?? 25;

  const rows = await prisma.contactMaster.findMany({
    where: {
      companyId: input.companyId,
      // Still Standard — Gold/Platinum not assigned (ERP/Shopify registration via OS)
      loyaltyAssignedTier: null,
      AND: [
        {
          OR: labels.map((label) => ({
            assignedMerchant: { equals: label, mode: "insensitive" as const },
          })),
        },
        {
          OR: [
            {
              loyaltyOutreachStatus: {
                in: [...LOYALTY_OUTREACH_QUEUE_STATUSES],
              },
            },
            { loyaltyOutreachStatus: null },
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      loyaltyOutreachStatus: true,
      emails: { select: { email: true } },
      phones: { select: { phoneNumber: true } },
    },
    take: CANDIDATE_CAP,
    orderBy: { updatedAt: "desc" },
  });

  if (rows.length === 0) return [];

  const lifetimeById = new Map<string, number>();
  for (let i = 0; i < rows.length; i += LIFETIME_CHUNK) {
    const slice = rows.slice(i, i + LIFETIME_CHUNK);
    const chunk = await lifetimeTotalsByContactId(input.companyId, slice);
    for (const [id, total] of chunk) lifetimeById.set(id, total);
  }

  const eligible: Array<{
    contactId: string;
    name: string;
    phoneNumber: string | null;
    lifetimeTotal: number;
    suggestedTier: "gold" | "platinum";
    status: string;
  }> = [];

  const markEligibleIds: string[] = [];

  for (const c of rows) {
    const lifetimeTotal = lifetimeById.get(c.id) ?? 0;
    const suggested = suggestedLoyaltyTier(lifetimeTotal);
    if (!suggested || !isLoyaltyEligibleByTotal(lifetimeTotal)) continue;

    let status = c.loyaltyOutreachStatus;
    if (!status || status === "eligible") {
      if (!status) markEligibleIds.push(c.id);
      status = "eligible";
    } else if (
      status !== "contacted" &&
      status !== "responded" &&
      status !== "not_responded"
    ) {
      continue;
    }

    eligible.push({
      contactId: c.id,
      name: c.name,
      phoneNumber: c.phoneNumber,
      lifetimeTotal,
      suggestedTier: suggested,
      status,
    });
  }

  eligible.sort((a, b) => b.lifetimeTotal - a.lifetimeTotal);
  const top = eligible.slice(0, limit);

  if (markEligibleIds.length > 0) {
    const toMark = markEligibleIds.filter((id) =>
      top.some((t) => t.contactId === id)
    );
    if (toMark.length > 0) {
      await prisma.contactMaster.updateMany({
        where: { id: { in: toMark }, loyaltyOutreachStatus: null },
        data: { loyaltyOutreachStatus: "eligible" },
      });
    }
  }

  const items: MerchantLoyaltyOutreachItem[] = [];
  for (const row of top) {
    const lastContactedAt = await getLastContactedAt({
      companyId: input.companyId,
      contactId: row.contactId,
    });
    items.push({
      ...row,
      lastContactedAt,
    });
  }

  return items;
}
