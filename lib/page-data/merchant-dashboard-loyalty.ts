import { listContactEmails, listContactPhones } from "@/lib/contact-identifiers";
import { buildContactOrderLookupOr } from "@/lib/contact-purchase-lookup";
import { getLastContactedAt } from "@/lib/customer-insight/contacted";
import { computeLifetimeTotal, customerLifetimeTotalOrderWhere } from "@/lib/customer-insight/lifetime-total";
import {
  isLoyaltyEligibleByTotal,
  LOYALTY_OUTREACH_QUEUE_STATUSES,
} from "@/lib/customer-insight/loyalty-outreach";
import { merchantMatchKeysForUser } from "@/lib/customer-insight/ownership";
import { prisma } from "@/lib/prisma";

export type MerchantLoyaltyOutreachItem = {
  contactId: string;
  name: string;
  phoneNumber: string | null;
  lifetimeTotal: number;
  status: string;
  lastContactedAt: string | null;
};

/**
 * Allocated customers eligible for loyalty outreach or mid-flow (not yet assigned).
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

  const rows = await prisma.contactMaster.findMany({
    where: {
      companyId: input.companyId,
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
    },
    take: 400,
    orderBy: { updatedAt: "desc" },
  });

  const items: MerchantLoyaltyOutreachItem[] = [];
  const limit = input.take ?? 25;

  for (const c of rows) {
    const emails = await listContactEmails(c.id, c.email);
    const phones = await listContactPhones(c.id, c.phoneNumber);
    const orderLookupOr = buildContactOrderLookupOr({ phones, emails });
    const [orders, adaptRows] = await Promise.all([
      orderLookupOr.length > 0
        ? prisma.order.findMany({
            where: {
              companyId: input.companyId,
              OR: orderLookupOr,
              ...customerLifetimeTotalOrderWhere(),
            },
            select: {
              totalPrice: true,
              cancelledAt: true,
              financialStatus: true,
              fulfillmentStage: true,
            },
          })
        : Promise.resolve([]),
      prisma.adaptPurchaseHistory.findMany({
        where: { contactId: c.id, companyId: input.companyId },
        select: { ttlAmount: true },
      }),
    ]);
    const lifetimeTotal = computeLifetimeTotal({
      orders: orders.map((o) => ({
        totalPrice: o.totalPrice.toString(),
        cancelledAt: o.cancelledAt,
        financialStatus: o.financialStatus,
        fulfillmentStage: o.fulfillmentStage,
      })),
      adaptRows: adaptRows.map((r) => ({ ttlAmount: r.ttlAmount.toString() })),
    });

    let status = c.loyaltyOutreachStatus;
    if (!status || status === "eligible") {
      if (!isLoyaltyEligibleByTotal(lifetimeTotal)) continue;
      if (!status) {
        await prisma.contactMaster.update({
          where: { id: c.id },
          data: { loyaltyOutreachStatus: "eligible" },
        });
        status = "eligible";
      }
    } else if (
      status !== "contacted" &&
      status !== "responded" &&
      status !== "not_responded"
    ) {
      continue;
    }

    const lastContactedAt = await getLastContactedAt({
      companyId: input.companyId,
      contactId: c.id,
    });

    items.push({
      contactId: c.id,
      name: c.name,
      phoneNumber: c.phoneNumber,
      lifetimeTotal,
      status,
      lastContactedAt,
    });
    if (items.length >= limit) break;
  }

  return items;
}
