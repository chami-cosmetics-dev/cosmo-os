import { lookupErpPriceBySku } from "@/lib/sticker-unit-price";

function toMoney(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

/**
 * Product Items price column:
 * LWK location filter → OGF list rate when present; other locations → Standard Selling catalog.
 */
export function resolveProductItemsDisplayedPrice(input: {
  isLwkView: boolean;
  catalogPrice: string;
  ogfPrice: string | number | null | undefined;
}): { price: string; priceDisplay: string } {
  if (!input.isLwkView) {
    return { price: input.catalogPrice, priceDisplay: input.catalogPrice };
  }
  const ogf = toMoney(input.ogfPrice);
  const next = ogf ?? input.catalogPrice;
  return { price: next, priceDisplay: next };
}

export function ogfPriceForSku(
  ogfBySku: Record<string, string>,
  sku: string | null | undefined,
): string | undefined {
  return lookupErpPriceBySku(ogfBySku, sku);
}
