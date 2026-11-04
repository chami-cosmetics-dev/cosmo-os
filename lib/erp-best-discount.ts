/**
 * Per-SKU "highest discount wins" between a basket coupon (SV10/SV20) and an
 * item promo (Tabloid). Discounts never stack.
 *
 * ERPNext cannot express this: Apply Multiple Pricing Rules either stacks or
 * throws MultiplePricingRuleConflict, and priority cannot flip when SV20 (20%)
 * should beat a 10% tabloid but lose to a 30% tabloid.
 */

export function roundMoney(value: number): number {
  return parseFloat(value.toFixed(2));
}

export function normalizeDiscountPercent(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

/** Higher of coupon % and item-promo %. Zero when neither applies. */
export function bestDiscountPercent(
  couponPercent: number | null | undefined,
  itemPromoPercent: number | null | undefined,
): number {
  return Math.max(normalizeDiscountPercent(couponPercent), normalizeDiscountPercent(itemPromoPercent));
}

export function discountedRate(listRate: number, percent: number): number {
  if (!Number.isFinite(listRate) || listRate <= 0) return 0;
  const pct = normalizeDiscountPercent(percent);
  if (pct <= 0) return roundMoney(listRate);
  return roundMoney(listRate * (1 - pct / 100));
}

export function applyBestDiscountToListRate(input: {
  listRate: number;
  couponPercent?: number | null;
  itemPromoPercent?: number | null;
}): { appliedPercent: number; rate: number } {
  const appliedPercent = bestDiscountPercent(input.couponPercent, input.itemPromoPercent);
  return { appliedPercent, rate: discountedRate(input.listRate, appliedPercent) };
}

/**
 * Rewrite product rows from MRP + max(coupon, tabloid).
 * Rows with no MRP (shipping, unknown SKU) keep the incoming rate.
 */
export function applyBestDiscountToProductItems<
  T extends { item_code: string; qty: number; rate?: number; price_list_rate?: number },
>(
  items: T[],
  ctx: {
    couponPercent: number;
    itemPromoBySku: ReadonlyMap<string, number>;
    listRateBySku: ReadonlyMap<string, number>;
  },
): T[] {
  return items.map((item) => {
    const sku = item.item_code?.trim();
    if (!sku) return item;
    const listRate = ctx.listRateBySku.get(sku);
    if (listRate == null || listRate <= 0) return item;
    const itemPromoPercent = ctx.itemPromoBySku.get(sku) ?? 0;
    const { appliedPercent, rate } = applyBestDiscountToListRate({
      listRate,
      couponPercent: ctx.couponPercent,
      itemPromoPercent,
    });
    if (appliedPercent <= 0) {
      return { ...item, rate: roundMoney(listRate), price_list_rate: roundMoney(listRate) };
    }
    return { ...item, rate, price_list_rate: roundMoney(listRate) };
  });
}

export function productItemsTotal(
  items: Array<{ qty: number; rate?: number }>,
): number {
  return roundMoney(items.reduce((sum, item) => sum + (item.rate ?? 0) * item.qty, 0));
}

/** Shopify paid total wins when computed max-discount grand total drifts. */
export function computedTotalsMatchShopify(
  computedGrand: number,
  shopifyGrand: number,
  tolerance = 1,
): boolean {
  if (!Number.isFinite(shopifyGrand) || shopifyGrand <= 0) return true;
  if (!Number.isFinite(computedGrand)) return false;
  return Math.abs(computedGrand - shopifyGrand) <= tolerance;
}
