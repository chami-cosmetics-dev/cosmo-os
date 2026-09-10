import {
  DM_GENERAL_DISPLAY_NAME,
  normalizeDashboardMerchantLabel,
  parseOrderCouponList,
} from "@/lib/merchant-dm-sales";
import {
  buildCouponToMerchantMap,
  matchMerchantFromCouponMap,
  resolveAssignedMerchantDashboardFallback,
  type MerchantUser,
} from "@/lib/merchant-groups";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";

export const REVIEW_DM_GENERAL_MERCHANT_ID = "__dm_general";
export const REVIEW_DM_GENERAL_MERCHANT_NAME = "DM General";

export type ReviewMerchant = { id: string; name: string };

function toReviewMerchant(merchant: { id: string | null; name: string }): ReviewMerchant {
  const normalized = normalizeDashboardMerchantLabel(merchant.name);
  if (!merchant.id && normalized === DM_GENERAL_DISPLAY_NAME) {
    return {
      id: REVIEW_DM_GENERAL_MERCHANT_ID,
      name: REVIEW_DM_GENERAL_MERCHANT_NAME,
    };
  }
  if (!merchant.id) {
    const slug = merchant.name.trim().toLowerCase().replace(/\s+/g, "_");
    return { id: `__${slug}`, name: merchant.name };
  }
  return { id: merchant.id, name: merchant.name };
}

export function buildReviewCouponToMerchantMap(users: MerchantUser[]) {
  return buildCouponToMerchantMap(users);
}

/**
 * Merchant review queue attribution.
 * Personal MER → merchant user; DM MER (e.g. MER115) → DM General bucket.
 * Matches sales dashboard DM split so holders like Sandali keep combined targets
 * but review queues list personal vs DM orders separately.
 */
export function resolveReviewMerchant(input: {
  sourceName: string | null;
  discountCodes: unknown;
  rawPayload: unknown;
  assignedMerchantId?: string | null;
  assignedMerchant?: {
    knownName?: string | null;
    name?: string | null;
    email?: string | null;
    couponCodes?: string[] | null;
  } | null;
  couponToMerchant: Map<string, { id: string | null; name: string }>;
}): ReviewMerchant {
  const merchantCouponCode = getMerchantCouponCode({
    sourceName: input.sourceName,
    discountCodes: input.discountCodes,
    rawPayload: input.rawPayload,
    assignedMerchantCouponCodes: null,
    joinAllDiscountCodes: true,
  });
  const merchantCoupons = parseOrderCouponList(merchantCouponCode);

  const couponMatch = matchMerchantFromCouponMap(
    merchantCoupons,
    input.couponToMerchant,
  );
  if (couponMatch) {
    return toReviewMerchant(couponMatch);
  }

  if (input.assignedMerchantId || input.assignedMerchant) {
    const fallback = resolveAssignedMerchantDashboardFallback({
      assignedMerchantId: input.assignedMerchantId ?? null,
      assignedMerchant: input.assignedMerchant ?? null,
      orderCoupons: merchantCoupons,
      userToGroup: new Map(),
    });
    return toReviewMerchant(fallback);
  }

  return {
    id: REVIEW_DM_GENERAL_MERCHANT_ID,
    name: REVIEW_DM_GENERAL_MERCHANT_NAME,
  };
}
