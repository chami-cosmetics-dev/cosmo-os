import type { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getShadowSourceLocationId } from "@/lib/shadow-location-products";
import { cuidSchema } from "@/lib/validation";
import { maybeLogSlowDbRequest } from "@/lib/dbObservability";
import { mergeErpPriorityFilterOptions } from "@/lib/product-items/erp-priority-options";
import { getProductFamilyName } from "@/lib/product-item-family";

export type ProductItemsPageParams = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  locationId?: string | null;
  vendorId?: string | null;
  categoryId?: string | null;
  familyId?: string | null;
  itemStatusCategory?: string | null;
  /** Match ERP1 or ERP2 product priority (exact string) */
  erpProductPriority?: string | null;
  search?: string | null;
};

type RawProductItem = Prisma.ProductItemGetPayload<{
  include: {
    vendor: { select: { id: true; name: true } };
    category: { select: { id: true; name: true; fullName: true } };
    companyLocation: { select: { id: true; name: true; shopifyLocationId: true } };
  };
}>;

function getProductItemGroupKey(item: Pick<RawProductItem, "shopifyVariantId" | "sku" | "id">) {
  return item.shopifyVariantId || item.sku?.trim() || item.id;
}

function formatDecimalRange(values: Array<{ toString(): string } | null>) {
  const uniqueValues = Array.from(
    new Set(
      values
        .filter((value): value is { toString(): string } => Boolean(value))
        .map((value) => value.toString())
    )
  ).sort((a, b) => Number(a) - Number(b));

  if (uniqueValues.length === 0) return null;
  if (uniqueValues.length === 1) return uniqueValues[0];
  return `${uniqueValues[0]} - ${uniqueValues[uniqueValues.length - 1]}`;
}

function chooseRepresentative(current: RawProductItem, candidate: RawProductItem) {
  if (!current.imageUrl && candidate.imageUrl) return candidate;
  if (!current.sku && candidate.sku) return candidate;
  return current;
}

function groupProductItems(rawItems: RawProductItem[], hasLocationFilter: boolean) {
  const groups = new Map<string, { representative: RawProductItem; rows: RawProductItem[] }>();

  for (const item of rawItems) {
    const groupKey = getProductItemGroupKey(item);
    const existing = groups.get(groupKey);
    if (!existing) {
      groups.set(groupKey, { representative: item, rows: [item] });
      continue;
    }
    existing.representative = chooseRepresentative(existing.representative, item);
    existing.rows.push(item);
  }

  return Array.from(groups.entries()).map(([groupKey, group]) => {
    const representative = group.representative;
    const locationNames = Array.from(
      new Set(group.rows.map((row) => row.companyLocation?.name).filter(Boolean))
    );
    const locationCount = locationNames.length;
    const totalInventoryQuantity = group.rows.reduce(
      (sum, row) => sum + row.inventoryQuantity,
      0
    );
    const priceDisplay = formatDecimalRange(group.rows.map((row) => row.price)) ?? "-";
    const compareAtPriceDisplay =
      formatDecimalRange(group.rows.map((row) => row.compareAtPrice)) ?? "-";

    return {
      ...representative,
      groupKey,
      familyName: getProductFamilyName(representative.productTitle),
      locationCount,
      locationSummary: hasLocationFilter
        ? representative.companyLocation?.name ?? "-"
        : `${locationCount} location${locationCount === 1 ? "" : "s"}`,
      totalInventoryQuantity,
      price: representative.price.toString(),
      compareAtPrice: representative.compareAtPrice?.toString() ?? null,
      priceDisplay,
      compareAtPriceDisplay,
      companyLocation: representative.companyLocation
        ? { name: representative.companyLocation.name }
        : null,
    };
  });
}

function sortGroupedItems<T extends ReturnType<typeof groupProductItems>[number]>(
  items: T[],
  sortBy: string | null | undefined,
  sortOrder: "asc" | "desc"
) {
  const direction = sortOrder === "desc" ? -1 : 1;
  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

  return [...items].sort((a, b) => {
    let result = 0;
    switch (sortBy) {
      case "sku":
        result = collator.compare(a.sku ?? "", b.sku ?? "");
        break;
      case "price":
        result = Number(a.price) - Number(b.price);
        break;
      case "compare_at":
        result = Number(a.compareAtPrice ?? 0) - Number(b.compareAtPrice ?? 0);
        break;
      case "vendor":
        result = collator.compare(a.vendor?.name ?? "", b.vendor?.name ?? "");
        break;
      case "category":
        result = collator.compare(a.category?.name ?? "", b.category?.name ?? "");
        break;
      case "family":
        result = collator.compare(a.familyName, b.familyName);
        break;
      case "stock":
        result = a.totalInventoryQuantity - b.totalInventoryQuantity;
        break;
      case "location":
        result = collator.compare(a.locationSummary, b.locationSummary);
        break;
      case "product":
      default:
        result =
          collator.compare(a.productTitle, b.productTitle) ||
          collator.compare(a.variantTitle ?? "", b.variantTitle ?? "");
        break;
    }
    return result * direction;
  });
}

const getProductItemsPageLookups = unstable_cache(
  async (companyId: string) => {
    const [locations, vendors, categories, familyRows, priorityRows] = await Promise.all([
      prisma.companyLocation.findMany({
        where: { companyId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.vendor.findMany({
        where: { companyId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.category.findMany({
        where: { companyId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.productItem.findMany({
        where: { companyId },
        orderBy: { productTitle: "asc" },
        distinct: ["productTitle"],
        select: { productTitle: true },
      }),
      prisma.productItem.findMany({
        where: { companyId },
        select: { erp1ProductPriority: true, erp2ProductPriority: true },
      }),
    ]);
    const familyNames = Array.from(
      new Set(familyRows.map((row) => getProductFamilyName(row.productTitle)))
    ).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base", numeric: true }));

    const prioritySet = new Set<string>();
    for (const row of priorityRows) {
      if (row.erp1ProductPriority?.trim()) prioritySet.add(row.erp1ProductPriority.trim());
      if (row.erp2ProductPriority?.trim()) prioritySet.add(row.erp2ProductPriority.trim());
    }

    return {
      locations,
      vendors,
      categories,
      families: familyNames.map((name) => ({ id: name, name })),
      priorities: mergeErpPriorityFilterOptions(prioritySet),
    };
  },
  ["product-items-page-lookups-v3"],
  { revalidate: 60 }
);

export async function fetchProductItemsPageData(companyId: string, params: ProductItemsPageParams = {}) {
  const startedAt = Date.now();
  const page = params.page ?? 1;
  const limit = params.limit ?? 10;
  const sortOrder = params.sortOrder ?? "asc";
  const skip = (page - 1) * limit;

  const where: Prisma.ProductItemWhereInput = {
    companyId,
  };

  if (params.locationId) {
    const idResult = cuidSchema.safeParse(params.locationId);
    if (idResult.success) {
      const location = await prisma.companyLocation.findFirst({
        where: { id: idResult.data, companyId },
        select: { id: true, shadowParentLocationId: true },
      });
      where.companyLocationId = location
        ? getShadowSourceLocationId(location)
        : idResult.data;
    }
  }

  if (params.vendorId) {
    const idResult = cuidSchema.safeParse(params.vendorId);
    if (idResult.success) {
      where.vendorId = idResult.data;
    }
  }

  if (params.categoryId) {
    const idResult = cuidSchema.safeParse(params.categoryId);
    if (idResult.success) {
      where.categoryId = idResult.data;
    }
  }

  if (params.erpProductPriority?.trim()) {
    const priority = params.erpProductPriority.trim();
    where.OR = [
      ...(Array.isArray(where.OR) ? where.OR : []),
      { erp1ProductPriority: priority },
      { erp2ProductPriority: priority },
    ];
  } else if (
    params.itemStatusCategory?.trim()
  ) {
    // Legacy filter: treat as ERP priority string match (ERP1 or ERP2)
    const priority = params.itemStatusCategory.trim();
    where.OR = [
      { erp1ProductPriority: priority },
      { erp2ProductPriority: priority },
    ];
  }

  if (params.search) {
    const searchOr = [
      { productTitle: { contains: params.search, mode: "insensitive" as const } },
      { variantTitle: { contains: params.search, mode: "insensitive" as const } },
      { sku: { contains: params.search, mode: "insensitive" as const } },
    ];
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchOr }];
      delete where.OR;
    } else {
      where.OR = searchOr;
    }
  }

  const [itemsResult, lookups] = await Promise.all([
    prisma.productItem.findMany({
        where,
        orderBy: [{ productTitle: "asc" }, { variantTitle: "asc" }, { sku: "asc" }],
        include: {
          vendor: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, fullName: true } },
          companyLocation: { select: { id: true, name: true, shopifyLocationId: true } },
        },
      }),
    getProductItemsPageLookups(companyId),
  ]);

  const familyFilter = params.familyId?.trim();
  const groupedItems = sortGroupedItems(
    groupProductItems(itemsResult, Boolean(params.locationId)).filter((item) =>
      familyFilter ? item.familyName === familyFilter : true
    ),
    params.sortBy,
    sortOrder
  );
  const total = groupedItems.length;
  const rawItems = groupedItems.slice(skip, skip + limit);
  // Build family → productKeys map so any explained member marks the whole family
  const familyToProductKeys = new Map<string, string[]>();
  for (const item of rawItems) {
    const productKey = item.shopifyProductId || item.groupKey;
    const existing = familyToProductKeys.get(item.familyName);
    if (existing) {
      existing.push(productKey);
    } else {
      familyToProductKeys.set(item.familyName, [productKey]);
    }
  }

  const allProductKeys = Array.from(new Set(rawItems.map((item) => item.shopifyProductId || item.groupKey)));
  const explainedProductKeys =
    allProductKeys.length > 0
      ? await prisma.cosmoAcademyExplanation.findMany({
          where: {
            companyId,
            productKey: { in: allProductKeys },
            status: "published",
          },
          select: { productKey: true },
          distinct: ["productKey"],
        })
      : [];
  const explainedProductKeySet = new Set(explainedProductKeys.map((e) => e.productKey));

  // A family is explained if ANY of its product keys has a published explanation
  const explainedFamilies = new Set<string>();
  for (const [familyName, keys] of familyToProductKeys.entries()) {
    if (keys.some((k) => explainedProductKeySet.has(k))) {
      explainedFamilies.add(familyName);
    }
  }

  const items = rawItems.map((item) => ({
    ...item,
    hasExplanation: explainedFamilies.has(item.familyName),
  }));

  maybeLogSlowDbRequest("product_items.page_data", startedAt, {
    companyId,
    page,
    limit,
    total,
  });

  return {
    items,
    total,
    page,
    limit,
    locations: lookups.locations,
    vendors: lookups.vendors,
    categories: lookups.categories,
    families: lookups.families,
    priorities: lookups.priorities,
  };
}
