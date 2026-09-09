import { isSharedMerchantEmail } from "@/lib/adapt-import/shared-emails";
import { normalizeContactEmail, normalizeContactPhone } from "@/lib/contact-identifiers";
import { isOrderReversed } from "@/lib/customer-insight/lifetime-total";
import { buildPhoneLookupVariants } from "@/lib/phone-lookup";
import { prisma } from "@/lib/prisma";

export type LastPurchaseOrderMatch =
  | { customerPhone: { in: string[] } }
  | { erpnextCustomerId: { in: string[] } }
  | { customerEmail: { equals: string; mode: "insensitive" } };

/**
 * Identity keys allowed to date a purchase. Phone number only, wherever there is one:
 * company/staff checkout emails sit on thousands of unrelated customer orders, so
 * matching on them hands a contact somebody else's newest order. Company emails never
 * match at all; a personal email is used only when the contact has no phone.
 * Same rule as `buildContactOrderLookupOr`.
 */
export function buildLastPurchaseOrderMatch(input: {
  email?: string | null;
  phoneNumber?: string | null;
}): LastPurchaseOrderMatch[] {
  const phone = normalizeContactPhone(input.phoneNumber);
  if (phone) {
    const phoneValues = buildPhoneLookupVariants(phone);
    if (phoneValues.length > 0) {
      return [
        { customerPhone: { in: phoneValues } },
        { erpnextCustomerId: { in: phoneValues } },
      ];
    }
  }

  const email = normalizeContactEmail(input.email);
  if (!email || isSharedMerchantEmail(email)) return [];
  return [{ customerEmail: { equals: email, mode: "insensitive" as const } }];
}

/** Newest orders are re-checked in memory, so a run of reversals cannot hide a real sale. */
const REVERSAL_SCAN_DEPTH = 50;

/**
 * Newest purchase for an identity, or null.
 * A placed order counts from the day it is placed; cancelled, voided and returned
 * orders never do.
 */
export async function getLatestOrderPurchaseAt(
  companyId: string,
  email?: string | null,
  phoneNumber?: string | null
) {
  const match = buildLastPurchaseOrderMatch({ email, phoneNumber });
  if (match.length === 0) return null;

  const orders = await prisma.order.findMany({
    where: { companyId, cancelledAt: null, OR: match },
    orderBy: { createdAt: "desc" },
    take: REVERSAL_SCAN_DEPTH,
    select: {
      createdAt: true,
      cancelledAt: true,
      financialStatus: true,
      fulfillmentStage: true,
    },
  });

  return orders.find((order) => !isOrderReversed(order))?.createdAt ?? null;
}
