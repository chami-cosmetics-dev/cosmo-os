import { Prisma } from "@prisma/client";

export type RiderIncentiveInputRow = {
  riderId: string;
  riderName: string | null;
  knownName: string | null;
  /** Pre-resolved rider pay for this delivery (from delivery-charge rules). */
  incentiveAmount: Prisma.Decimal | number | string | null;
  financialStatus: string | null;
};

const VOID_STATUSES = new Set(["voided", "cancelled", "canceled", "refunded"]);

export function isIncentiveEligibleOrder(financialStatus: string | null | undefined): boolean {
  const status = financialStatus?.trim().toLowerCase() ?? "";
  if (!status) return true;
  return !VOID_STATUSES.has(status);
}

/** @deprecated Prefer riderDeliveryChargeAmount / resolveRiderIncentiveFromRules */
export function shippingIncentiveAmount(
  totalShipping: Prisma.Decimal | number | string | null | undefined
): Prisma.Decimal {
  if (totalShipping == null) return new Prisma.Decimal(0);
  const value = new Prisma.Decimal(totalShipping.toString());
  return value.gt(0) ? value : new Prisma.Decimal(0);
}

export function normalizeIncentiveAmount(
  amount: Prisma.Decimal | number | string | null | undefined
): Prisma.Decimal {
  if (amount == null) return new Prisma.Decimal(0);
  const value = new Prisma.Decimal(amount.toString());
  return value.gt(0) ? value : new Prisma.Decimal(0);
}

/** Aggregate completed deliveries into per-rider incentive rows. */
export function aggregateRiderIncentives(rows: RiderIncentiveInputRow[]): Array<{
  riderId: string;
  name: string | null;
  knownName: string | null;
  completedCount: number;
  incentiveTotal: string;
}> {
  const map = new Map<
    string,
    {
      riderId: string;
      name: string | null;
      knownName: string | null;
      completedCount: number;
      incentiveTotal: Prisma.Decimal;
    }
  >();

  for (const row of rows) {
    if (!isIncentiveEligibleOrder(row.financialStatus)) continue;
    const existing =
      map.get(row.riderId) ??
      {
        riderId: row.riderId,
        name: row.riderName,
        knownName: row.knownName,
        completedCount: 0,
        incentiveTotal: new Prisma.Decimal(0),
      };
    existing.completedCount += 1;
    existing.incentiveTotal = existing.incentiveTotal.add(normalizeIncentiveAmount(row.incentiveAmount));
    map.set(row.riderId, existing);
  }

  return Array.from(map.values())
    .map((row) => ({
      riderId: row.riderId,
      name: row.name,
      knownName: row.knownName,
      completedCount: row.completedCount,
      incentiveTotal: row.incentiveTotal.toFixed(2),
    }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}
