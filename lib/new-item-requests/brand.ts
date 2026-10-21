export function normalizeBrandName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function canSuggestBrands(q: string): boolean {
  return q.trim().length >= 2;
}

export function isExistingVendorName(typedName: string, vendorName: string | null | undefined): boolean {
  if (!vendorName?.trim()) return false;
  return normalizeBrandName(typedName) === normalizeBrandName(vendorName);
}

export function toStoredBrand(input: { vendorName: string | null; typedName: string }): {
  brandName: string;
  brandNameNormalized: string;
  brandIsExisting: boolean;
} {
  const typed = input.typedName.trim();
  if (input.vendorName?.trim()) {
    const brandName = input.vendorName.trim();
    return {
      brandName,
      brandNameNormalized: normalizeBrandName(brandName),
      brandIsExisting: true,
    };
  }
  return {
    brandName: typed,
    brandNameNormalized: normalizeBrandName(typed),
    brandIsExisting: false,
  };
}
