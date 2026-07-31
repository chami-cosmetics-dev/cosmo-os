import { Prisma } from "@prisma/client";

import {
  resolveOrderShippingRuleLabel,
  resolveRiderIncentiveFromRules,
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

export function incentiveForOrder(
  order: {
    totalShipping?: string | number | null;
    shippingLines?: unknown;
    rawPayload?: unknown;
    sourceName?: string | null;
    discountCodes?: unknown;
  },
  chargeByLabelKey: Map<string, Prisma.Decimal | number | string>
): Prisma.Decimal {
  const label = resolveOrderShippingRuleLabel(order);
  return resolveRiderIncentiveFromRules({
    shippingRuleLabel: label,
    chargeByLabelKey,
  });
}
