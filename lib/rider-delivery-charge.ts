import { Prisma } from "@prisma/client";

import { resolveOrderShippingDisplay } from "@/lib/order-shipping-display";

/** Normalize shipping rule labels for lookup (case/spacing insensitive). */
export function normalizeShippingRuleLabelKey(label: string | null | undefined): string {
  return (label ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveOrderShippingRuleLabel(order: {
  totalShipping?: string | number | null;
  shippingLines?: unknown;
  rawPayload?: unknown;
  sourceName?: string | null;
  discountCodes?: unknown;
}): string | null {
  return resolveOrderShippingDisplay(order).label;
}

export function riderDeliveryChargeAmount(
  charge: Prisma.Decimal | number | string | null | undefined
): Prisma.Decimal {
  if (charge == null) return new Prisma.Decimal(0);
  const value = new Prisma.Decimal(charge.toString());
  return value.gt(0) ? value : new Prisma.Decimal(0);
}

/** Resolve rider incentive from uploaded rule table; unmatched labels → 0. */
export function resolveRiderIncentiveFromRules(input: {
  shippingRuleLabel: string | null | undefined;
  chargeByLabelKey: Map<string, Prisma.Decimal | number | string>;
}): Prisma.Decimal {
  const key = normalizeShippingRuleLabelKey(input.shippingRuleLabel);
  if (!key) return new Prisma.Decimal(0);
  const charge = input.chargeByLabelKey.get(key);
  if (charge == null) return new Prisma.Decimal(0);
  return riderDeliveryChargeAmount(charge);
}

export type ParsedRiderDeliveryChargeRow = {
  label: string;
  labelKey: string;
  district: string | null;
  shippingAmount: string;
  riderDeliveryCharge: string;
  shippingAccount: string | null;
  costCenter: string | null;
};

function cellString(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function cellMoney(value: unknown): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(2);
}

/**
 * Parse "Shipping Rule New.xlsx" style sheets.
 * Expected headers (row 1): Shipping Rule Label, District, Shipping Account, Cost Center,
 * Shipping Amount, Delivery Charges for riders
 */
export function parseRiderDeliveryChargeSheetRows(
  rows: unknown[][]
): { rows: ParsedRiderDeliveryChargeRow[]; errors: string[] } {
  const errors: string[] = [];
  if (rows.length < 2) {
    return { rows: [], errors: ["Sheet has no data rows"] };
  }

  const header = (rows[0] ?? []).map((c) => cellString(c).toLowerCase());
  const findCol = (...needles: string[]) =>
    header.findIndex((h) => needles.some((n) => h.includes(n)));

  const labelCol = findCol("shipping rule label", "rule label", "label");
  const districtCol = findCol("district");
  const accountCol = findCol("shipping account", "account");
  const costCol = findCol("cost center", "cost centre");
  const shippingAmtCol = findCol("shipping amount");
  const riderCol = findCol("delivery charges for riders", "rider", "delivery charge");

  if (labelCol < 0 || shippingAmtCol < 0 || riderCol < 0) {
    return {
      rows: [],
      errors: [
        "Missing required columns. Need Shipping Rule Label, Shipping Amount, and Delivery Charges for riders.",
      ],
    };
  }

  const byKey = new Map<string, ParsedRiderDeliveryChargeRow>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const label = cellString(row[labelCol]);
    if (!label) continue;
    const shippingAmount = cellMoney(row[shippingAmtCol]);
    const riderDeliveryCharge = cellMoney(row[riderCol]);
    if (shippingAmount == null || riderDeliveryCharge == null) {
      errors.push(`Row ${i + 1} (${label}): invalid shipping/rider amounts`);
      continue;
    }
    const labelKey = normalizeShippingRuleLabelKey(label);
    byKey.set(labelKey, {
      label,
      labelKey,
      district: districtCol >= 0 ? cellString(row[districtCol]) || null : null,
      shippingAmount,
      riderDeliveryCharge,
      shippingAccount: accountCol >= 0 ? cellString(row[accountCol]) || null : null,
      costCenter: costCol >= 0 ? cellString(row[costCol]) || null : null,
    });
  }

  return { rows: Array.from(byKey.values()), errors };
}
