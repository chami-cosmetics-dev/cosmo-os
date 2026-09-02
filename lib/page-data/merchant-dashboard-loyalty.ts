import { getLastContactedAt } from "@/lib/customer-insight/contacted";
import { lifetimeTotalsByContactId } from "@/lib/customer-insight/lifetime-totals-batch";
import {
  LOYALTY_OUTREACH_QUEUE_STATUSES,
  pendingLoyaltySuggestion,
} from "@/lib/customer-insight/loyalty-outreach";
import { getLoyaltyProfileMissingFields } from "@/lib/customer-insight/loyalty-profile-complete";
import { merchantContactAllocationKeys } from "@/lib/customer-insight/ownership";
import { prisma } from "@/lib/prisma";

export type MerchantLoyaltyOutreachItem = {
  contactId: string;
  name: string;
  phoneNumber: string | null;
  lifetimeTotal: number;
  /** Computed Gold/Platinum from spend. */
  suggestedTier: "gold" | "platinum";
  /** new = still Standard; upgrade = assigned Gold, spend now Platinum. */
  suggestionKind: "new" | "upgrade";
  currentAssignedTier: "gold" | "platinum" | null;
  status: string;
  lastContactedAt: string | null;
  /** Empty when profile is complete enough for Responded / loyalty send. */
  missingProfileFields: string[];
};

const CANDIDATE_CAP = 2_000;
const LIFETIME_CHUNK = 400;

/**
 * Allocated customers with a pending Gold/Platinum action:
 * - still Standard and spend ≥ Gold, or
 * - assigned Gold and spend ≥ Platinum (upgrade).
 */
export async function fetchMerchantLoyaltyOutreach(input: {
  companyId: string;
  viewer: {
    knownName?: string | null;
    name?: string | null;
    email?: string | null;
    couponCodes?: string[] | null;
    roleNames?: string[];
  };
  take?: number;
}): Promise<MerchantLoyaltyOutreachItem[]> {
  const labels = merchantContactAllocationKeys(input.viewer);
  if (labels.length === 0) return [];

  const limit = input.take ?? 25;
  const allocatedOr = {
    OR: labels.map((label) => ({
      assignedMerchant: { equals: label, mode: "insensitive" as const },
    })),
  };

  const [unassigned, goldAssigned] = await Promise.all([
    prisma.contactMaster.findMany({
      where: {
        companyId: input.companyId,
        loyaltyAssignedTier: null,
        AND: [
          allocatedOr,
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
        gender: true,
        language: true,
        birthMonth: true,
        birthDay: true,
        city: true,
        address: true,
        loyaltyAssignedTier: true,
        loyaltyOutreachStatus: true,
        emails: { select: { email: true } },
        phones: { select: { phoneNumber: true } },
      },
      take: CANDIDATE_CAP,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.contactMaster.findMany({
      where: {
        companyId: input.companyId,
        loyaltyAssignedTier: "gold",
        ...allocatedOr,
      },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        gender: true,
        language: true,
        birthMonth: true,
        birthDay: true,
        city: true,
        address: true,
        loyaltyAssignedTier: true,
        loyaltyOutreachStatus: true,
        emails: { select: { email: true } },
        phones: { select: { phoneNumber: true } },
      },
      take: CANDIDATE_CAP,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const byId = new Map<string, (typeof unassigned)[number]>();
  for (const row of [...unassigned, ...goldAssigned]) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  const rows = [...byId.values()];
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
    suggestionKind: "new" | "upgrade";
    currentAssignedTier: "gold" | "platinum" | null;
    status: string;
    missingProfileFields: string[];
  }> = [];

  const markEligibleIds: string[] = [];

  for (const c of rows) {
    const lifetimeTotal = lifetimeById.get(c.id) ?? 0;
    const pending = pendingLoyaltySuggestion(c.loyaltyAssignedTier, lifetimeTotal);
    if (!pending) continue;

    let status = c.loyaltyOutreachStatus;
    if (pending.kind === "upgrade" && (status === "assigned" || !status)) {
      status = "eligible";
    } else if (!status || status === "eligible") {
      if (!status && pending.kind === "new") markEligibleIds.push(c.id);
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
      suggestedTier: pending.suggestedTier,
      suggestionKind: pending.kind,
      currentAssignedTier: pending.currentAssigned,
      status,
      missingProfileFields: getLoyaltyProfileMissingFields({
        name: c.name,
        email: c.email,
        phoneNumber: c.phoneNumber,
        phones: c.phones.map((p) => p.phoneNumber),
        gender: c.gender,
        language: c.language,
        birthMonth: c.birthMonth,
        birthDay: c.birthDay,
        city: c.city,
        address: c.address,
      }),
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
