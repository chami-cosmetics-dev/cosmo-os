export const PRODUCT_ITEM_STATUS_CATEGORIES = [
  "TOP_PRIORITY_BRAND_PRIORITY_PRODUCT",
  "TOP_PRIORITY_BRAND_NON_PRIORITY_PRODUCT",
  "PRIORITY_BRAND_PRIORITY_PRODUCT",
  "PRIORITY_BRAND_NON_PRIORITY_PRODUCT",
  "NEWLY_ADDED",
  "VAT_TOP_PRIORITY_BRAND",
  "CONTINUE",
  "DISCONTINUE",
  "UNCATEGORIZED",
] as const;

export type ProductItemStatusCategory = (typeof PRODUCT_ITEM_STATUS_CATEGORIES)[number];

export type ProductItemStatusMeta = {
  category: ProductItemStatusCategory;
  label: string;
  brandPriority: "Top Priority Brand" | "Priority Brand" | "Standard";
  productPriority: "Priority Product" | "Non Priority Product" | "Not Set";
  lifecycle: "Newly Added" | "Continue" | "Discontinue" | "Active";
};

export const PRODUCT_ITEM_STATUS_META: Record<ProductItemStatusCategory, ProductItemStatusMeta> = {
  TOP_PRIORITY_BRAND_PRIORITY_PRODUCT: {
    category: "TOP_PRIORITY_BRAND_PRIORITY_PRODUCT",
    label: "Top Priority Brand - Priority Product",
    brandPriority: "Top Priority Brand",
    productPriority: "Priority Product",
    lifecycle: "Active",
  },
  TOP_PRIORITY_BRAND_NON_PRIORITY_PRODUCT: {
    category: "TOP_PRIORITY_BRAND_NON_PRIORITY_PRODUCT",
    label: "Top Priority Brand - Non Priority Product",
    brandPriority: "Top Priority Brand",
    productPriority: "Non Priority Product",
    lifecycle: "Active",
  },
  PRIORITY_BRAND_PRIORITY_PRODUCT: {
    category: "PRIORITY_BRAND_PRIORITY_PRODUCT",
    label: "Priority Brand - Priority Product",
    brandPriority: "Priority Brand",
    productPriority: "Priority Product",
    lifecycle: "Active",
  },
  PRIORITY_BRAND_NON_PRIORITY_PRODUCT: {
    category: "PRIORITY_BRAND_NON_PRIORITY_PRODUCT",
    label: "Priority Brand - Non Priority Product",
    brandPriority: "Priority Brand",
    productPriority: "Non Priority Product",
    lifecycle: "Active",
  },
  NEWLY_ADDED: {
    category: "NEWLY_ADDED",
    label: "Newly Added",
    brandPriority: "Standard",
    productPriority: "Not Set",
    lifecycle: "Newly Added",
  },
  VAT_TOP_PRIORITY_BRAND: {
    category: "VAT_TOP_PRIORITY_BRAND",
    label: "VAT - Top Priority Brand",
    brandPriority: "Top Priority Brand",
    productPriority: "Not Set",
    lifecycle: "Active",
  },
  CONTINUE: {
    category: "CONTINUE",
    label: "Continue",
    brandPriority: "Standard",
    productPriority: "Not Set",
    lifecycle: "Continue",
  },
  DISCONTINUE: {
    category: "DISCONTINUE",
    label: "Discontinue",
    brandPriority: "Standard",
    productPriority: "Not Set",
    lifecycle: "Discontinue",
  },
  UNCATEGORIZED: {
    category: "UNCATEGORIZED",
    label: "Uncategorized",
    brandPriority: "Standard",
    productPriority: "Not Set",
    lifecycle: "Active",
  },
};

const NORMALIZED_STATUS_MAP: Record<string, ProductItemStatusCategory> = {
  "top priority brand-priority product": "TOP_PRIORITY_BRAND_PRIORITY_PRODUCT",
  "top priority brand - priority product": "TOP_PRIORITY_BRAND_PRIORITY_PRODUCT",
  "top priority brand-non priority product": "TOP_PRIORITY_BRAND_NON_PRIORITY_PRODUCT",
  "top priority brand - non priority product": "TOP_PRIORITY_BRAND_NON_PRIORITY_PRODUCT",
  "priority brand-priority product": "PRIORITY_BRAND_PRIORITY_PRODUCT",
  "priority brand - priority product": "PRIORITY_BRAND_PRIORITY_PRODUCT",
  "priority brand-non priority product": "PRIORITY_BRAND_NON_PRIORITY_PRODUCT",
  "priority brand - non priority product": "PRIORITY_BRAND_NON_PRIORITY_PRODUCT",
  "newly added": "NEWLY_ADDED",
  "vat-top priority brand": "VAT_TOP_PRIORITY_BRAND",
  "vat - top priority brand": "VAT_TOP_PRIORITY_BRAND",
  continue: "CONTINUE",
  discontinue: "DISCONTINUE",
};

export function normalizeProductItemStatusLabel(value: string | null | undefined): ProductItemStatusCategory {
  const normalized = value
    ?.trim()
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .toLowerCase();

  if (!normalized) return "UNCATEGORIZED";
  return NORMALIZED_STATUS_MAP[normalized] ?? "UNCATEGORIZED";
}

export function getProductItemStatusMeta(
  category: string | null | undefined,
): ProductItemStatusMeta {
  if (category && category in PRODUCT_ITEM_STATUS_META) {
    return PRODUCT_ITEM_STATUS_META[category as ProductItemStatusCategory];
  }
  return PRODUCT_ITEM_STATUS_META.UNCATEGORIZED;
}
