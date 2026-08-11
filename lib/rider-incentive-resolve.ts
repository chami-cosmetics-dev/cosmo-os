import { Prisma } from "@prisma/client";

import {
  resolveOrderShippingRuleLabel,
  resolveRiderIncentiveFromRules,
  resolveRiderIncentiveMatch,
} from "@/lib/rider-delivery-charge";
import { prisma } from "@/lib/prisma";

export async function loadRiderDeliveryChargeMap(): Promise<
  Map<string, Prisma.Decimal | number | string>
> {
  const rules = await prisma.riderDeliveryChargeRule.findMany({
    select: { labelKey: true, riderDeliveryCharge: true },
  });
  return new Map(rules.map((rule) => [rule.labelKey, rule.riderDeliveryCharge]));
}

function orderShippingLabel(order: {
  totalShipping?: string | number | { toString(): string } | null;
  shippingLines?: unknown;
  rawPayload?: unknown;
  sourceName?: string | null;
  discountCodes?: unknown;
}) {
  return resolveOrderShippingRuleLabel({
    ...order,
    totalShipping:
      order.totalShipping == null ? null : order.totalShipping.toString(),
  });
}

export function incentiveForOrder(
  order: {
    totalShipping?: string | number | { toString(): string } | null;
    shippingLines?: unknown;
    rawPayload?: unknown;
    sourceName?: string | null;
    discountCodes?: unknown;
  },
  chargeByLabelKey: Map<string, Prisma.Decimal | number | string>
): Prisma.Decimal {
  return resolveRiderIncentiveFromRules({
    shippingRuleLabel: orderShippingLabel(order),
    chargeByLabelKey,
  });
}

/** Incentive amount plus whether a shipping-rule charge row matched. */
export function incentiveMatchForOrder(
  order: {
    totalShipping?: string | number | { toString(): string } | null;
    shippingLines?: unknown;
    rawPayload?: unknown;
    sourceName?: string | null;
    discountCodes?: unknown;
  },
  chargeByLabelKey: Map<string, Prisma.Decimal | number | string>
): { amount: Prisma.Decimal; matched: boolean; labelKey: string | null } {
  return resolveRiderIncentiveMatch({
    shippingRuleLabel: orderShippingLabel(order),
    chargeByLabelKey,
  });
}
