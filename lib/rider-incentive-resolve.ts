import { Prisma } from "@prisma/client";

import {
  extractOrderShippingCity,
  resolveOrderShippingRuleLabel,
  resolveRiderIncentiveFromRules,
  resolveRiderIncentiveMatch,
} from "@/lib/rider-delivery-charge";
import { prisma } from "@/lib/prisma";

export type RiderIncentiveOrder = {
  totalShipping?: string | number | { toString(): string } | null;
  shippingLines?: unknown;
  shippingAddress?: unknown;
  rawPayload?: unknown;
  sourceName?: string | null;
  discountCodes?: unknown;
};

export type RiderIncentiveContext = {
  chargeByLabelKey: Map<string, Prisma.Decimal | number | string>;
  zoneMembersByZone: Map<string, Set<string>>;
};

export async function loadRiderDeliveryChargeMap(): Promise<
  Map<string, Prisma.Decimal | number | string>
> {
  const rules = await prisma.riderDeliveryChargeRule.findMany({
    select: { labelKey: true, riderDeliveryCharge: true },
  });
  return new Map(rules.map((rule) => [rule.labelKey, rule.riderDeliveryCharge]));
}

export async function loadRiderDeliveryZoneMemberMap(): Promise<Map<string, Set<string>>> {
  const members = await prisma.riderDeliveryZoneMember.findMany({
    select: { zoneKey: true, districtLabelKey: true },
  });
  const byZone = new Map<string, Set<string>>();
  for (const row of members) {
    const set = byZone.get(row.zoneKey) ?? new Set<string>();
    set.add(row.districtLabelKey);
    byZone.set(row.zoneKey, set);
  }
  return byZone;
}

export async function loadRiderIncentiveContext(): Promise<RiderIncentiveContext> {
  const [chargeByLabelKey, zoneMembersByZone] = await Promise.all([
    loadRiderDeliveryChargeMap(),
    loadRiderDeliveryZoneMemberMap(),
  ]);
  return { chargeByLabelKey, zoneMembersByZone };
}

function orderShippingLabel(order: RiderIncentiveOrder) {
  return resolveOrderShippingRuleLabel({
    ...order,
    totalShipping:
      order.totalShipping == null ? null : order.totalShipping.toString(),
  });
}

export function incentiveForOrder(
  order: RiderIncentiveOrder,
  chargeByLabelKey: Map<string, Prisma.Decimal | number | string>,
  zoneMembersByZone?: Map<string, Set<string>>,
  manualIncentiveLabelKey?: string | null
): Prisma.Decimal {
  return resolveRiderIncentiveFromRules({
    shippingRuleLabel: orderShippingLabel(order),
    chargeByLabelKey,
    shippingCity: extractOrderShippingCity(order),
    zoneMembersByZone,
    manualIncentiveLabelKey,
  });
}

/** Incentive amount plus whether a shipping-rule charge row matched. */
export function incentiveMatchForOrder(
  order: RiderIncentiveOrder,
  chargeByLabelKey: Map<string, Prisma.Decimal | number | string>,
  zoneMembersByZone?: Map<string, Set<string>>,
  manualIncentiveLabelKey?: string | null
): {
  amount: Prisma.Decimal;
  matched: boolean;
  labelKey: string | null;
  excludedFromIncentive?: boolean;
  manualOverride?: boolean;
} {
  return resolveRiderIncentiveMatch({
    shippingRuleLabel: orderShippingLabel(order),
    chargeByLabelKey,
    shippingCity: extractOrderShippingCity(order),
    zoneMembersByZone,
    manualIncentiveLabelKey,
  });
}
