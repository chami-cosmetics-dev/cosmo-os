import { resolveFailureReportAmounts } from "@/lib/erp-sync-failure-email";

/**
 * Order total without delivery — same basis as ERP Sales (shipping sits on 5309).
 */
export function salesAmountExcludingShipping(input: {
  totalPrice: unknown;
  totalShipping?: unknown;
  shippingLines?: unknown;
  discountCodes?: unknown;
}): number | null {
  const total = Number(input.totalPrice);
  if (!Number.isFinite(total)) return null;
  return resolveFailureReportAmounts({
    totalPrice: total,
    totalShipping:
      input.totalShipping == null || input.totalShipping === ""
        ? null
        : (input.totalShipping as string | number),
    shippingLines: input.shippingLines,
    discountCodes: input.discountCodes,
  }).amountExcl;
}
