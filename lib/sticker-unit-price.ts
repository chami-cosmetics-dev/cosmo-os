export type StickerPriceInputs = {
  price: string | number | null | undefined;
  compareAtPrice?: string | number | null | undefined;
};

function toMoney(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

/** LWK detection via locationReference (trim, case-insensitive). */
export function isLwkLocation(
  locationReference: string | null | undefined
): boolean {
  return (locationReference ?? "").trim().toUpperCase() === "LWK";
}

/**
 * Resolve sticker unit price for any location:
 * prefer original/list (compare-at) over discounted sell price.
 */
export function resolveStickerUnitPrice(input: StickerPriceInputs): string {
  return toMoney(input.compareAtPrice) ?? toMoney(input.price) ?? "";
}
