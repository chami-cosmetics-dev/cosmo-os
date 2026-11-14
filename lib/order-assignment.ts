import type { ShopifyOrderWebhookPayload } from "@/lib/validation/shopify-order";
import type { CompanyLocation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { eligibleMerchantUserWhere } from "@/lib/merchant-eligibility";
import { isDmOnlyMerchantTracking } from "@/lib/merchant-dm-sales";
import { trackingCodesMatch } from "@/lib/merchant-wholesale";

function normalizeDiscountCodes(order: ShopifyOrderWebhookPayload) {
  return (order.discount_codes ?? [])
    .map((discount) => discount.code?.toLowerCase().trim())
    .filter((code): code is string => Boolean(code));
}

function hasMatchingCode(savedCodes: string[], orderCodes: string[]) {
  return savedCodes.some((saved) =>
    orderCodes.some((orderCode) => trackingCodesMatch(saved, orderCode)),
  );
}

export async function resolveAssignedMerchant(
  order: ShopifyOrderWebhookPayload,
  companyLocation: CompanyLocation
): Promise<string | null> {
  const sourceName = (order.source_name ?? "web").toLowerCase();
  const companyId = companyLocation.companyId;
  const orderCodes = normalizeDiscountCodes(order);
  if (isDmOnlyMerchantTracking(orderCodes)) {
    return null;
  }

  if (sourceName === "pos" && order.user_id != null) {
    const shopifyUserId = String(order.user_id);
    const merchant = await prisma.user.findFirst({
      where: {
        ...eligibleMerchantUserWhere(companyId),
        shopifyUserIds: { has: shopifyUserId },
      },
      select: { id: true },
    });
    if (merchant) return merchant.id;
  }

  if (sourceName === "web" && orderCodes.length > 0) {
    const merchants = await prisma.user.findMany({
      where: eligibleMerchantUserWhere(companyId),
      select: { id: true, couponCodes: true, wholesaleCouponCodes: true },
    });

    for (const merchant of merchants) {
      if (hasMatchingCode(merchant.wholesaleCouponCodes, orderCodes)) return merchant.id;
    }

    for (const merchant of merchants) {
      if (hasMatchingCode(merchant.couponCodes, orderCodes)) return merchant.id;
    }
  }

  return null;
}
