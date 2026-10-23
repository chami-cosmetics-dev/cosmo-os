import { getProductItemStatusMeta } from "@/lib/product-item-status";

const BRAND_PRIORITY_RANK: Record<string, number> = {
  "Top Priority Brand": 3,
  "Priority Brand": 2,
  Standard: 1,
};

export function normalizeBrandName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function canSuggestBrands(q: string): boolean {
  return q.trim().length >= 2;
}

export const normalizeProductName = normalizeBrandName;
export const canSearchProducts = canSuggestBrands;

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

/** Highest catalogue brand priority from ProductItem status categories. Empty → null. */
export function brandPriorityFromItemStatuses(categories: string[]): string | null {
  let best: string | null = null;
  let bestRank = 0;
  for (const category of categories) {
    const label = getProductItemStatusMeta(category).brandPriority;
    const rank = BRAND_PRIORITY_RANK[label] ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = label;
    }
  }
  return best;
}
